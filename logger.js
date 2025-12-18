/**
 * Winston-based Structured Logging
 *
 * Provides configurable logging with JSON format for production
 * and colorized console output for development.
 */

const winston = require('winston');
const config = require('./config');

// Custom Format für entwicklungsfreundliche Ausgabe
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// JSON Format für Produktion (besser für Log-Aggregation)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Logger erstellen
const logger = winston.createLogger({
  level: config.logging.level,
  format: config.logging.format === 'json' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'claude-code-api' },
  transports: [
    // Console-Transport für stdout/stderr
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

// Optional: File-Transport für Produktion (auskommentiert, da systemd journal bevorzugt)
/*
if (config.isProduction) {
  logger.add(new winston.transports.File({
    filename: '/var/log/claude-code-api/error.log',
    level: 'error'
  }));
  logger.add(new winston.transports.File({
    filename: '/var/log/claude-code-api/combined.log'
  }));
}
*/

// Helper-Funktionen für strukturiertes Logging
logger.logRequest = (req, additionalInfo = {}) => {
  if (!config.logging.requestLogging) return;

  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id,
    ...additionalInfo
  });
};

logger.logResponse = (req, res, responseTime, additionalInfo = {}) => {
  if (!config.logging.responseLogging) return;

  logger.info('Response sent', {
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    requestId: req.id,
    ...additionalInfo
  });
};

logger.logClaudeProcess = (event, data = {}) => {
  logger.debug('Claude process event', {
    event,
    ...data
  });
};

logger.logError = (error, context = {}) => {
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    ...context
  });
};

module.exports = logger;
