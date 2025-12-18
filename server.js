#!/usr/bin/env node

/**
 * Claude Code API Server
 *
 * Produktionsreifer API-Server für Claude Code Integration mit n8n.
 * Stellt OpenAI-kompatible Endpoints bereit und fungiert als Proxy
 * zwischen n8n und Claude Code CLI.
 *
 * Hauptfunktionen:
 * - OpenAI-kompatibles API-Format
 * - Flexible Input/Output Formate (text, json, stream-json)
 * - Rate Limiting und Authentifizierung
 * - Strukturiertes Logging
 * - Graceful Shutdown
 * - Process-Management für Claude CLI
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./logger');
const claudeExecutor = require('./claude-executor');
const claudeStreamingExecutor = require('./claude-executor-streaming');
const {
  requestIdMiddleware,
  timingMiddleware,
  authMiddleware,
  validateChatCompletionRequest,
  errorHandler,
  notFoundHandler
} = require('./middleware');

// Express App initialisieren
const app = express();

// Trust Proxy (wichtig wenn hinter Nginx)
app.set('trust proxy', 1);

// Body Parser Middleware mit Size-Limit
app.use(express.json({ limit: config.server.requestSizeLimit }));
app.use(express.urlencoded({ extended: true, limit: config.server.requestSizeLimit }));

// Request-ID und Timing Middleware
app.use(requestIdMiddleware);
app.use(timingMiddleware);

// Request-Logging
app.use((req, res, next) => {
  logger.logRequest(req);
  next();
});

// Rate Limiting konfigurieren
if (config.rateLimit.enabled) {
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        path: req.path,
        requestId: req.id
      });
      res.status(429).json({
        error: {
          message: 'Too many requests, please try again later',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      });
    },
    skip: (req) => {
      // Health-Check von Rate-Limiting ausschließen
      return req.path === '/health';
    }
  });

  app.use(limiter);
  logger.info('Rate limiting enabled', {
    windowMs: config.rateLimit.windowMs,
    maxRequests: config.rateLimit.maxRequests
  });
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * Health Check Endpoint
 * GET /health
 *
 * Wird von Monitoring-Systemen genutzt um Server-Status zu prüfen
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: require('./package.json').version
  });
});

/**
 * OpenAI-kompatibler Chat Completions Endpoint (ERWEITERT)
 * POST /v1/chat/completions
 *
 * Hauptendpoint für n8n Integration - kompatibel mit OpenAI API
 *
 * ERWEITERTE PARAMETER:
 * - input_format: "text" (default) | "stream-json"
 * - output_format: "text" (default) | "json" | "stream-json"
 * - stream: boolean (deprecated, use output_format="stream-json")
 */
app.post('/v1/chat/completions',
  authMiddleware,
  validateChatCompletionRequest,
  async (req, res, next) => {
    try {
      // Extrahiere Format-Parameter (mit Backward-Compatibility)
      const input_format = req.body.input_format || 'text';
      const output_format = req.body.output_format || (req.body.stream ? 'stream-json' : 'json');

      // Validierung
      const validInputFormats = ['text', 'stream-json'];
      const validOutputFormats = ['text', 'json', 'stream-json'];

      if (!validInputFormats.includes(input_format)) {
        return res.status(400).json({
          error: {
            message: `Invalid input_format. Must be one of: ${validInputFormats.join(', ')}`,
            type: 'invalid_request_error',
            code: 'invalid_input_format'
          }
        });
      }

      if (!validOutputFormats.includes(output_format)) {
        return res.status(400).json({
          error: {
            message: `Invalid output_format. Must be one of: ${validOutputFormats.join(', ')}`,
            type: 'invalid_request_error',
            code: 'invalid_output_format'
          }
        });
      }

      logger.info('Processing chat completion request', {
        requestId: req.id,
        model: req.body.model,
        messageCount: req.body.messages?.length,
        input_format,
        output_format
      });

      // SSE STREAMING: Nutze Streaming-Executor
      if (output_format === 'stream-json') {
        await claudeStreamingExecutor.executeStreaming(req.body, res, input_format);
        return;
      }

      // NON-STREAMING: Nutze regulären Executor
      const response = await claudeExecutor.execute(req.body, {
        input_format,
        output_format
      });

      // Response zurückgeben
      res.json(response);

      logger.info('Chat completion successful', {
        requestId: req.id,
        finishReason: response.choices[0]?.finish_reason,
        totalTokens: response.usage?.total_tokens
      });
    } catch (error) {
      // Error an Error-Handler weiterleiten
      error.statusCode = 500;
      error.type = 'claude_execution_error';
      next(error);
    }
  }
);

/**
 * Spezifischer RCA (Root Cause Analysis) Endpoint
 * POST /api/rca
 *
 * Optimiert für Root Cause Analysis Use-Cases
 * Akzeptiert vereinfachtes Input-Format
 */
/**
 * Anthropic API Kompatibilitäts-Endpoint
 * POST /v1/messages
 *
 * Akzeptiert Anthropic API Format und konvertiert zu OpenAI Format
 * Ermöglicht Backward-Compatibility für bestehende n8n Workflows
 */
app.post('/v1/messages',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { model, messages, max_tokens, temperature, metadata } = req.body;

      // Validierung
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          error: {
            message: 'messages array is required',
            type: 'invalid_request_error',
            code: 'missing_messages'
          }
        });
      }

      logger.info('Processing Anthropic API request (compatibility layer)', {
        requestId: req.id,
        model: model,
        messageCount: messages.length
      });

      // Konvertiere Anthropic Format -> OpenAI Format
      const openAiRequest = {
        model: model || config.claude.defaultModel,
        messages: messages, // Messages sind bereits kompatibel
        max_tokens: max_tokens || config.claude.defaultMaxTokens,
        temperature: temperature !== undefined ? temperature : config.claude.defaultTemperature
      };

      // Nutze bestehenden Executor mit JSON output
      const response = await claudeExecutor.execute(openAiRequest, {
        input_format: 'text',
        output_format: 'json'
      });

      // Konvertiere OpenAI Response -> Anthropic Format
      const anthropicResponse = {
        id: `msg-${response.id}`,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: response.choices[0]?.message?.content || ''
          }
        ],
        model: response.model,
        stop_reason: response.choices[0]?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
        stop_sequence: null,
        usage: {
          input_tokens: response.usage?.prompt_tokens || 0,
          output_tokens: response.usage?.completion_tokens || 0
        }
      };

      res.json(anthropicResponse);

      logger.info('Anthropic API request successful', {
        requestId: req.id,
        totalTokens: anthropicResponse.usage.input_tokens + anthropicResponse.usage.output_tokens
      });
    } catch (error) {
      error.statusCode = 500;
      error.type = 'anthropic_api_error';
      next(error);
    }
  }
);


app.post('/api/rca',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { prompt, model, max_tokens, temperature } = req.body;

      // Validierung
      if (!prompt) {
        return res.status(400).json({
          error: {
            message: 'prompt field is required',
            type: 'invalid_request_error',
            code: 'missing_prompt'
          }
        });
      }

      logger.info('Processing RCA request', {
        requestId: req.id,
        promptLength: prompt.length
      });

      // In OpenAI-Format konvertieren
      const openAiRequest = {
        model: model || config.claude.defaultModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: max_tokens || config.claude.defaultMaxTokens,
        temperature: temperature !== undefined ? temperature : config.claude.defaultTemperature
      };

      // Claude Code ausführen (JSON output für RCA)
      const response = await claudeExecutor.execute(openAiRequest, {
        input_format: 'text',
        output_format: 'json'
      });

      // Vereinfachte Response für RCA
      res.json({
        id: response.id,
        analysis: response.choices[0]?.message?.content || '',
        model: response.model,
        created: response.created,
        usage: response.usage
      });

      logger.info('RCA analysis successful', {
        requestId: req.id,
        totalTokens: response.usage?.total_tokens
      });
    } catch (error) {
      error.statusCode = 500;
      error.type = 'rca_execution_error';
      next(error);
    }
  }
);

/**
 * Server Info Endpoint
 * GET /
 *
 * Gibt grundlegende Informationen über den Server zurück
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Claude Code API Server',
    version: require('./package.json').version,
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint'
      },
      {
        path: '/v1/chat/completions',
        method: 'POST',
        description: 'OpenAI-compatible chat completions endpoint',
        parameters: {
          input_format: 'text (default) | stream-json',
          output_format: 'text | json (default) | stream-json',
          stream: 'boolean (deprecated, use output_format)'
        }
      },
      {
        path: '/api/rca',
        method: 'POST',
        description: 'Root Cause Analysis endpoint (always uses json output)'
      }
    ],
    documentation: 'See README.md for API documentation',
    config: {
      rateLimitEnabled: config.rateLimit.enabled,
      authEnabled: config.auth.enabled,
      claudeModel: config.claude.defaultModel,
      supportedInputFormats: ['text', 'stream-json'],
      supportedOutputFormats: ['text', 'json', 'stream-json']
    }
  });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 Handler (muss vor dem Error-Handler kommen)
app.use(notFoundHandler);

// Globaler Error-Handler
app.use(errorHandler);

// ============================================================================
// SERVER START & SHUTDOWN
// ============================================================================

let server;

/**
 * Startet den HTTP Server
 */
function startServer() {
  server = app.listen(config.server.port, config.server.host, () => {
    logger.info('Server started successfully', {
      port: config.server.port,
      host: config.server.host,
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      pid: process.pid
    });

    logger.info('Configuration', {
      claudePath: config.claude.cliPath,
      defaultModel: config.claude.defaultModel,
      timeout: `${config.claude.timeout}ms`,
      rateLimitEnabled: config.rateLimit.enabled,
      authEnabled: config.auth.enabled,
      supportedFormats: {
        input: ['text', 'stream-json'],
        output: ['text', 'json', 'stream-json']
      }
    });
  });

  // Server Error-Handler
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${config.server.port} is already in use`);
    } else {
      logger.logError(error, { phase: 'server-start' });
    }
    process.exit(1);
  });
}

/**
 * Graceful Shutdown
 *
 * Behandelt SIGTERM und SIGINT Signale für sauberes Herunterfahren:
 * - Stoppt die Annahme neuer Requests
 * - Wartet auf laufende Requests
 * - Schließt Server sauber
 */
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  if (!server) {
    logger.info('Server not running, exiting immediately');
    process.exit(0);
  }

  // Timeout für Shutdown
  const shutdownTimeout = setTimeout(() => {
    logger.warn('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, config.server.shutdownTimeout);

  // Server schließen (keine neuen Connections mehr)
  server.close((err) => {
    clearTimeout(shutdownTimeout);

    if (err) {
      logger.logError(err, { phase: 'shutdown' });
      process.exit(1);
    }

    logger.info('Server closed successfully');
    process.exit(0);
  });

  // Bei aktiven Connections: loggen
  server.getConnections((err, count) => {
    if (err) {
      logger.logError(err, { phase: 'get-connections' });
    } else {
      logger.info(`Waiting for ${count} active connections to close`);
    }
  });
}

// Signal-Handler registrieren
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled Promise Rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason,
    promise: promise
  });
  // In Produktion nicht crashen, nur loggen
  if (!config.isProduction) {
    process.exit(1);
  }
});

// Uncaught Exceptions
process.on('uncaughtException', (error) => {
  logger.logError(error, { phase: 'uncaught-exception' });
  // Bei uncaught exceptions immer beenden (unsicherer Zustand)
  process.exit(1);
});

// Server starten
startServer();

// Export für Tests
module.exports = app;
