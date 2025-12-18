/**
 * Claude Code Streaming Executor
 *
 * Stream-JSON Proxy: Nimmt stream-json Input, gibt direkt an Claude CLI weiter,
 * streamt Output als Server-Sent Events (SSE) zurück.
 *
 * KEIN Parsing, KEINE Konvertierung - reines Pass-Through!
 */

const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./logger');

class ClaudeStreamingExecutor {
  /**
   * Führt Claude CLI mit stream-json aus und streamt Response als SSE
   *
   * @param {Object} request - OpenAI-kompatibles Request-Objekt
   * @param {Object} res - Express Response-Objekt für SSE Streaming
   */
  async executeStreaming(request, res) {
    const requestId = uuidv4();
    const startTime = Date.now();

    logger.info('Starting Claude streaming execution', {
      requestId,
      model: request.model,
      messageCount: request.messages?.length
    });

    // SSE Headers setzen
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx: Disable buffering

    // Claude CLI Argumente
    // Verwende TEXT Input (einfacher!) + stream-json Output
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
      '--verbose', // REQUIRED!
      '--model', request.model || config.claude.defaultModel
    ];

    // Settings (max_tokens, temperature)
    if (request.max_tokens || request.temperature !== undefined) {
      const settings = {};
      if (request.max_tokens) settings.maxTokens = request.max_tokens;
      if (request.temperature !== undefined) settings.temperature = request.temperature;
      args.push('--settings', JSON.stringify(settings));
    }

    logger.debug('Claude CLI streaming args', { requestId, args });

    // Input: Konvertiere OpenAI messages zu plain text
    const textInput = this._convertMessagesToText(request.messages);
    logger.debug('Text input', { requestId, inputLength: textInput.length });

    // Spawn Claude Prozess
    const claudeProcess = spawn(config.claude.cliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: '/home/mdoehler',
        NODE_ENV: process.env.NODE_ENV
      }
    });

    let hasError = false;
    let stderrData = '';

    // STDOUT: Claude stream-json Output → SSE an Client
    claudeProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            // Parse JSON Line
            const event = JSON.parse(line);

            // Nur "assistant" Events verarbeiten (haben den Content)
            if (event.type === 'assistant' && event.message) {
              const message = event.message;

              // Extrahiere Text Content
              let content = '';
              if (message.content && Array.isArray(message.content)) {
                for (const block of message.content) {
                  if (block.type === 'text') {
                    content += block.text;
                  }
                }
              }

              // Konvertiere zu OpenAI SSE Format
              const sseChunk = {
                id: `chatcmpl-${requestId}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: request.model || config.claude.defaultModel,
                choices: [{
                  index: 0,
                  delta: {
                    content: content
                  },
                  finish_reason: message.stop_reason || null
                }]
              };

              // Sende SSE Event
              res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);

              logger.debug('Streamed assistant message', {
                requestId,
                contentLength: content.length,
                stopReason: message.stop_reason
              });
            }
            // System/Result Events loggen aber nicht streamen
            else if (event.type === 'system' || event.type === 'result') {
              logger.debug('Received control event', {
                requestId,
                type: event.type,
                subtype: event.subtype
              });
            }
          } catch (e) {
            logger.warn('Failed to parse stream-json line', {
              requestId,
              line: line.substring(0, 100),
              error: e.message
            });
          }
        }
      }
    });

    // STDERR: Log Errors
    claudeProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      logger.warn('Claude stderr', { requestId, data: data.toString() });
    });

    // ERROR: Process spawn failed
    claudeProcess.on('error', (error) => {
      hasError = true;
      logger.logError(error, { requestId, phase: 'spawn' });

      res.write(`data: ${JSON.stringify({
        error: {
          message: `Failed to spawn Claude process: ${error.message}`,
          type: 'spawn_error'
        }
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    // CLOSE: Process finished
    claudeProcess.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code !== 0) {
        hasError = true;
        logger.error('Claude process exited with error', {
          requestId,
          code,
          stderr: stderrData,
          duration: `${duration}ms`
        });

        res.write(`data: ${JSON.stringify({
          error: {
            message: `Claude process exited with code ${code}: ${stderrData}`,
            type: 'execution_error',
            code: code
          }
        })}\n\n`);
      }

      // Send [DONE] marker
      res.write('data: [DONE]\n\n');
      res.end();

      if (!hasError) {
        logger.info('Claude streaming completed', {
          requestId,
          duration: `${duration}ms`
        });
      }
    });

    // Write Input zu Claude stdin
    try {
      claudeProcess.stdin.write(textInput);
      claudeProcess.stdin.end();
      logger.debug('Input written to Claude stdin', { requestId, length: textInput.length });
    } catch (error) {
      logger.logError(error, { requestId, phase: 'write-input' });
      res.write(`data: ${JSON.stringify({
        error: {
          message: `Failed to write input: ${error.message}`,
          type: 'input_error'
        }
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }

    // Cleanup on client disconnect
    res.on('close', () => {
      if (!claudeProcess.killed) {
        logger.info('Client disconnected, killing Claude process', { requestId });
        claudeProcess.kill('SIGTERM');
      }
    });
  }

  /**
   * Konvertiert OpenAI messages Array zu plain text
   * Kombiniert alle messages zu einem Text-String
   */
  _convertMessagesToText(messages) {
    const textParts = [];

    for (const msg of messages) {
      // Role-basierte Formatierung (optional)
      if (msg.role === 'system') {
        textParts.push(`System: ${msg.content}`);
      } else if (msg.role === 'user') {
        textParts.push(msg.content);
      } else if (msg.role === 'assistant') {
        textParts.push(`Assistant: ${msg.content}`);
      }
    }

    // Join mit Newlines
    return textParts.join('\n\n');
  }
}

module.exports = new ClaudeStreamingExecutor();
