/**
 * Non-streaming Claude CLI Executor
 *
 * Manages Claude CLI process execution with format conversion between
 * text/JSON inputs and outputs. Handles timeouts and process cleanup.
 */

const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./logger');

class ClaudeExecutor {
  /**
   * Führt eine Claude Code Anfrage aus
   *
   * @param {Object} request - OpenAI-kompatibles Request-Objekt
   * @param {Object} options - Execution Options
   * @param {string} options.input_format - Input Format: "text" | "stream-json"
   * @param {string} options.output_format - Output Format: "text" | "json" | "stream-json"
   * @returns {Promise<Object>} OpenAI-kompatibles Response-Objekt
   */
  async execute(request, options = {}) {
    // Backward compatibility: Falls options boolean ist
    if (typeof options === 'boolean') {
      options = {
        input_format: options ? 'stream-json' : 'text',
        output_format: options ? 'stream-json' : 'json'
      };
    }

    // Defaults setzen
    const input_format = options.input_format || 'text';
    const output_format = options.output_format || 'json';

    const requestId = uuidv4();
    const startTime = Date.now();

    logger.info('Starting Claude execution', {
      requestId,
      model: request.model,
      input_format,
      output_format,
      messageCount: request.messages?.length
    });

    try {
      // Claude CLI Argumente zusammenstellen
      const args = this._buildClaudeArgs(request, input_format, output_format);

      // Input erstellen (abhängig vom Format)
      const input = this._prepareInput(request, input_format);

      // Claude Prozess starten
      const response = await this._spawnClaudeProcess(
        args,
        input,
        requestId
      );

      // Response in OpenAI-Format konvertieren
      const openAiResponse = this._convertToOpenAiFormat(
        response,
        request.model || config.claude.defaultModel,
        requestId
      );

      const duration = Date.now() - startTime;
      logger.info('Claude execution completed', {
        requestId,
        duration: `${duration}ms`,
        finishReason: openAiResponse.choices[0]?.finish_reason
      });

      return openAiResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logError(error, {
        requestId,
        duration: `${duration}ms`,
        phase: 'execution'
      });
      throw error;
    }
  }

  /**
   * Baut die Claude CLI Argumente zusammen
   */
  _buildClaudeArgs(request, input_format, output_format) {
    const args = [
      '--print', // Non-interactive mode
      '--dangerously-skip-permissions'
    ];

    // Input Format
    if (input_format !== 'text') {
      args.push('--input-format', input_format);
    }
    // text ist default, braucht kein Flag

    // Output Format
    args.push('--output-format', output_format);

    // Verbose Flag für stream-json output (REQUIRED mit --print)
    if (output_format === 'stream-json') {
      args.push('--verbose');
    }

    // Modell setzen (Alias oder vollständiger Name)
    const model = request.model || config.claude.defaultModel;
    args.push('--model', model);

    // Max Tokens und Temperature über --settings JSON
    // Claude CLI akzeptiert diese nur über settings
    if (request.max_tokens || request.temperature !== undefined) {
      const settings = {};
      if (request.max_tokens) {
        settings.maxTokens = request.max_tokens;
      }
      if (request.temperature !== undefined) {
        settings.temperature = request.temperature;
      }
      args.push('--settings', JSON.stringify(settings));
    }

    logger.debug('Claude CLI arguments', { args });
    return args;
  }

  /**
   * Bereitet Input für Claude CLI basierend auf Format vor
   */
  _prepareInput(request, input_format) {
    if (input_format === 'stream-json') {
      // Stream-JSON: Eine JSON-Zeile pro Message
      const jsonLines = [];
      for (const msg of request.messages) {
        const messageType = msg.role === 'user' ? 'user' : 'control';
        jsonLines.push(JSON.stringify({
          type: messageType,
          role: msg.role,
          content: msg.content
        }));
      }
      return jsonLines.join('\n');
    } else {
      // Text Format: Konvertiere messages zu Plain Text
      const textParts = [];
      for (const msg of request.messages) {
        if (msg.role === 'system') {
          textParts.push(`System: ${msg.content}`);
        } else if (msg.role === 'user') {
          textParts.push(msg.content);
        } else if (msg.role === 'assistant') {
          textParts.push(`Assistant: ${msg.content}`);
        }
      }
      return textParts.join('\n\n');
    }
  }

  /**
   * Startet den Claude CLI Prozess und verarbeitet die Ausgabe
   */
  _spawnClaudeProcess(args, input, requestId) {
    return new Promise((resolve, reject) => {
      const claudeProcess = spawn(config.claude.cliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV
        }
      });

      let stdout = '';
      let stderr = '';
      let timeoutHandle;
      let processExited = false;

      // Timeout Handler
      const setupTimeout = () => {
        timeoutHandle = setTimeout(() => {
          if (!processExited) {
            logger.warn('Claude process timeout', { requestId, timeout: config.claude.timeout });
            claudeProcess.kill('SIGTERM');

            // Falls SIGTERM nicht funktioniert, nach 5 Sekunden SIGKILL
            setTimeout(() => {
              if (!processExited) {
                claudeProcess.kill('SIGKILL');
              }
            }, 5000);

            reject(new Error(`Claude process timeout after ${config.claude.timeout}ms`));
          }
        }, config.claude.timeout);
      };

      // Cleanup-Funktion
      const cleanup = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        processExited = true;
      };

      // Stdout Handler
      claudeProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        logger.logClaudeProcess('stdout', { requestId, length: data.length });
      });

      // Stderr Handler
      claudeProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.logClaudeProcess('stderr', { requestId, data: data.toString() });
      });

      // Error Handler
      claudeProcess.on('error', (error) => {
        cleanup();
        logger.logError(error, { requestId, phase: 'spawn' });
        reject(new Error(`Failed to spawn Claude process: ${error.message}`));
      });

      // Exit Handler
      claudeProcess.on('close', (code) => {
        cleanup();

        logger.logClaudeProcess('exit', { requestId, code, stdoutLength: stdout.length });

        if (code !== 0) {
          const errorMsg = stderr || stdout || 'Unknown error';
          reject(new Error(`Claude process exited with code ${code}: ${errorMsg}`));
          return;
        }

        try {
          // JSON Response parsen (output-format=json)
          const response = JSON.parse(stdout);
          resolve(response);
        } catch (error) {
          logger.logError(error, {
            requestId,
            phase: 'parse',
            stdout: stdout.substring(0, 500)
          });
          reject(new Error(`Failed to parse Claude response: ${error.message}`));
        }
      });

      // Input schreiben und stdin schließen
      try {
        claudeProcess.stdin.write(input);
        claudeProcess.stdin.end();
        logger.logClaudeProcess('input-written', { requestId, length: input.length });
      } catch (error) {
        cleanup();
        logger.logError(error, { requestId, phase: 'write-input' });
        reject(new Error(`Failed to write to Claude stdin: ${error.message}`));
        return;
      }

      // Timeout aktivieren
      setupTimeout();
    });
  }

  /**
   * Parst Stream-JSON Output (mehrere JSON-Objekte, eines pro Zeile)
   */
  _parseStreamJson(output) {
    const lines = output.trim().split('\n');
    const messages = [];

    for (const line of lines) {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line);
          messages.push(msg);
        } catch (error) {
          logger.warn('Failed to parse stream-json line', { line, error: error.message });
        }
      }
    }

    // Letztes Message-Objekt zurückgeben (enthält die vollständige Antwort)
    return messages[messages.length - 1] || { content: '' };
  }

  /**
   * Konvertiert Claude CLI Response zu OpenAI-kompatiblem Format
   *
   * Claude CLI JSON-Format:
   * {
   *   "type": "result",
   *   "result": "Die eigentliche Antwort",
   *   "usage": { "input_tokens": 10, "output_tokens": 20 },
   *   ...
   * }
   */
  _convertToOpenAiFormat(claudeResponse, model, requestId) {
    // Content aus Claude CLI Response extrahieren
    let content = '';

    if (typeof claudeResponse === 'string') {
      content = claudeResponse;
    } else if (claudeResponse.result) {
      // Claude CLI gibt result zurück
      content = claudeResponse.result;
    } else if (claudeResponse.content) {
      // Fallback: content-Feld
      if (Array.isArray(claudeResponse.content)) {
        content = claudeResponse.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('\n');
      } else {
        content = claudeResponse.content;
      }
    } else if (claudeResponse.text) {
      content = claudeResponse.text;
    } else if (claudeResponse.message?.content) {
      content = claudeResponse.message.content;
    }

    // Token-Usage aus Claude Response
    const inputTokens = claudeResponse.usage?.input_tokens || 0;
    const outputTokens = claudeResponse.usage?.output_tokens || 0;

    // OpenAI-kompatible Response erstellen
    return {
      id: `chatcmpl-${requestId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: content
          },
          finish_reason: claudeResponse.stop_reason || 'stop'
        }
      ],
      usage: {
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    };
  }
}

module.exports = new ClaudeExecutor();
