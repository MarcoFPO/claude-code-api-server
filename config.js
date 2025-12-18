/**
 * Central Configuration Management
 *
 * Manages all server configuration parameters with environment variable support.
 * Provides defaults for server, Claude CLI, rate limiting, authentication, and logging settings.
 */

module.exports = {
  // Server-Konfiguration
  server: {
    port: parseInt(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
    requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || '100kb',
    shutdownTimeout: parseInt(process.env.SHUTDOWN_TIMEOUT) || 30000 // 30 Sekunden
  },

  // Claude CLI Konfiguration
  claude: {
    cliPath: process.env.CLAUDE_CLI_PATH || 'claude',
    defaultModel: process.env.CLAUDE_DEFAULT_MODEL || 'sonnet', // Model-Alias (sonnet, opus, haiku)
    defaultMaxTokens: parseInt(process.env.CLAUDE_DEFAULT_MAX_TOKENS) || 2000,
    defaultTemperature: parseFloat(process.env.CLAUDE_DEFAULT_TEMPERATURE) || 0.3,
    timeout: parseInt(process.env.CLAUDE_TIMEOUT) || 600000, // 600 Sekunden (10 Minuten)
    noThinking: process.env.CLAUDE_NO_THINKING === 'true' // Default: false für bessere Qualität
  },

  // Rate Limiting Konfiguration
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false', // Default: enabled
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 Minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX) || 10, // 10 Requests pro Minute
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },

  // Authentifizierung
  auth: {
    enabled: process.env.API_KEY_AUTH_ENABLED === 'true', // Default: disabled
    apiKey: process.env.API_KEY || null, // Setze API_KEY Umgebungsvariable
    headerName: process.env.API_KEY_HEADER || 'X-API-Key'
  },

  // Logging-Konfiguration
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || 'json', // 'json' oder 'simple'
    requestLogging: process.env.LOG_REQUESTS !== 'false', // Default: enabled
    responseLogging: process.env.LOG_RESPONSES !== 'false' // Default: enabled
  },

  // Entwicklungsmodus
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};
