/**
 * Express Middleware Collection
 *
 * Provides authentication, request validation, error handling,
 * request ID tracking, and timing middleware for API server.
 */

const { v4: uuidv4 } = require('uuid');
const config = require('./config');
const logger = require('./logger');

/**
 * Middleware: Request-ID für Tracking
 */
function requestIdMiddleware(req, res, next) {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
}

/**
 * Middleware: Request-Timing
 */
function timingMiddleware(req, res, next) {
  req.startTime = Date.now();

  // Response-Ende abfangen für Logging
  const originalSend = res.send;
  res.send = function (data) {
    const responseTime = Date.now() - req.startTime;
    logger.logResponse(req, res, responseTime);
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Middleware: API-Key-Authentifizierung
 */
function authMiddleware(req, res, next) {
  // Wenn Auth deaktiviert ist, skip
  if (!config.auth.enabled) {
    return next();
  }

  const providedKey = req.get(config.auth.headerName);

  if (!providedKey) {
    logger.warn('Missing API key', {
      ip: req.ip,
      path: req.path,
      requestId: req.id
    });
    return res.status(401).json({
      error: {
        message: 'Missing API key',
        type: 'authentication_error',
        code: 'missing_api_key'
      }
    });
  }

  if (providedKey !== config.auth.apiKey) {
    logger.warn('Invalid API key', {
      ip: req.ip,
      path: req.path,
      requestId: req.id
    });
    return res.status(401).json({
      error: {
        message: 'Invalid API key',
        type: 'authentication_error',
        code: 'invalid_api_key'
      }
    });
  }

  next();
}

/**
 * Middleware: Request-Validierung für Chat Completions
 */
function validateChatCompletionRequest(req, res, next) {
  const { model, messages } = req.body;

  // Validierung: messages ist erforderlich
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: {
        message: 'messages field is required and must be a non-empty array',
        type: 'invalid_request_error',
        code: 'invalid_messages'
      }
    });
  }

  // Validierung: Jede Message braucht role und content
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg.role || !msg.content) {
      return res.status(400).json({
        error: {
          message: `Message at index ${i} missing required fields 'role' or 'content'`,
          type: 'invalid_request_error',
          code: 'invalid_message_format'
        }
      });
    }

    // Validierung: role muss valide sein
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({
        error: {
          message: `Message at index ${i} has invalid role '${msg.role}'. Must be 'system', 'user', or 'assistant'`,
          type: 'invalid_request_error',
          code: 'invalid_role'
        }
      });
    }
  }

  // Optional: Model-Validierung (warnen bei unbekannten Modellen)
  if (model && !model.includes('claude')) {
    logger.warn('Non-Claude model requested', {
      model,
      requestId: req.id
    });
  }

  next();
}

/**
 * Middleware: Error-Handler
 */
function errorHandler(err, req, res, next) {
  logger.logError(err, {
    requestId: req.id,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  // Default error response
  const status = err.statusCode || 500;
  const errorResponse = {
    error: {
      message: err.message || 'Internal server error',
      type: err.type || 'internal_error',
      code: err.code || 'unknown_error'
    }
  };

  // Bei Produktions-Modus keine Stack Traces ausgeben
  if (config.isDevelopment && err.stack) {
    errorResponse.error.stack = err.stack;
  }

  res.status(status).json(errorResponse);
}

/**
 * Middleware: 404 Not Found Handler
 */
function notFoundHandler(req, res) {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    ip: req.ip,
    requestId: req.id
  });

  res.status(404).json({
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      type: 'not_found_error',
      code: 'route_not_found'
    }
  });
}

module.exports = {
  requestIdMiddleware,
  timingMiddleware,
  authMiddleware,
  validateChatCompletionRequest,
  errorHandler,
  notFoundHandler
};
