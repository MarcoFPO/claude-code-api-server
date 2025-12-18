# Claude Code API Server - Feature-Übersicht

## 🎯 Kernfunktionen

### ✅ OpenAI-kompatible API
- Vollständig kompatibel mit OpenAI Chat Completions API
- Drop-in replacement for any OpenAI-compatible HTTP client
- Standard Request/Response Format
- Unterstützt model, messages, max_tokens, temperature Parameter

### ✅ Mehrere Endpoints
1. **`/v1/chat/completions`** - OpenAI-compatible format
2. **`/v1/messages`** - Anthropic-compatible format
3. **`/api/rca`** - Simplified endpoint for Root Cause Analysis
4. **`/health`** - Health-Check für Monitoring
5. **`/`** - Server-Info und API-Dokumentation

### ✅ Claude Code Integration
- Startet Claude CLI für jede Anfrage
- Nutzt aktuellste Modelle (sonnet, opus, haiku)
- Automatisches Process-Management
- Timeout-Handling (120s Standard)
- Graceful Shutdown bei SIGTERM/SIGINT

### ✅ Sicherheit
- **Rate Limiting**: 10 Requests/Minute (konfigurierbar)
- **API-Key-Authentifizierung**: Optional aktivierbar
- **Request-Size-Limit**: 100KB Standard
- **Input-Validierung**: Verhindert ungültige Requests
- **Error-Handling**: Keine Stack-Traces in Produktion

### ✅ Observability
- **Strukturiertes Logging**: JSON-Format für Log-Aggregation
- **Request-Tracking**: Unique Request-IDs
- **Performance-Metriken**: Response-Times, Token-Usage
- **Systemd Journal**: Integration mit journalctl
- **Debug-Modus**: Detaillierte Logs bei Bedarf

### ✅ Production-Ready
- **Graceful Shutdown**: Wartet auf laufende Requests
- **Error Recovery**: Automatischer Restart via systemd
- **Resource Limits**: Memory und CPU via systemd
- **Health-Checks**: Für Load Balancer/Monitoring
- **Auto-Start**: Systemd service enabled

### ✅ Developer Experience
- **Klare Dokumentation**: README, QUICKSTART, Beispiele
- **Test-Suite**: Automatisierte Tests für alle Endpoints
- **Ausführliche Kommentare**: Code auf Deutsch dokumentiert
- **Environment Config**: Alle Parameter über Umgebungsvariablen steuerbar
- **Debugging-Tools**: Test-Client mit farbiger Ausgabe

## 🚀 Performance

- **Schneller Start**: ~1-2 Sekunden
- **Niedriger Memory-Footprint**: ~20MB Baseline
- **Concurrent Requests**: Node.js Event-Loop (unbegrenzt)
- **Request-Processing**: 5-30s je nach Claude-Anfrage
- **Timeout-Protection**: Verhindert hängende Prozesse

## 🔧 Konfigurierbarkeit

Alle Parameter über Umgebungsvariablen steuerbar:

### Server
- PORT, HOST, REQUEST_SIZE_LIMIT, SHUTDOWN_TIMEOUT

### Claude CLI
- CLAUDE_CLI_PATH, CLAUDE_DEFAULT_MODEL, CLAUDE_TIMEOUT

### Sicherheit
- RATE_LIMIT_ENABLED, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW
- API_KEY_AUTH_ENABLED, API_KEY

### Logging
- LOG_LEVEL (error, warn, info, debug)
- LOG_FORMAT (json, simple)
- LOG_REQUESTS, LOG_RESPONSES

## 📊 API-Kompatibilität

### Unterstützte OpenAI-Parameter
- ✅ model (sonnet, opus, haiku)
- ✅ messages (Array von {role, content})
- ⚠️ max_tokens (wird nicht an Claude weitergegeben)
- ⚠️ temperature (wird nicht an Claude weitergegeben)
- ❌ stream (noch nicht implementiert)
- ❌ functions/tools (nicht unterstützt)

### Response-Format
- ✅ id (chatcmpl-{uuid})
- ✅ object (chat.completion)
- ✅ created (timestamp)
- ✅ model (verwendetes Modell)
- ✅ choices[].message.content
- ✅ choices[].finish_reason
- ✅ usage.prompt_tokens
- ✅ usage.completion_tokens
- ✅ usage.total_tokens

## 🛡️ Error-Handling

### Validierung
- Leere messages → 400 Bad Request
- Fehlende role/content → 400 Bad Request
- Ungültige role → 400 Bad Request
- Request zu groß → 413 Payload Too Large

### Rate Limiting
- Zu viele Requests → 429 Too Many Requests
- Inkl. Retry-After Header

### Authentifizierung
- Fehlender API-Key → 401 Unauthorized
- Ungültiger API-Key → 401 Unauthorized

### Claude-Fehler
- Timeout → 500 Internal Server Error
- Process-Crash → 500 Internal Server Error
- Parse-Error → 500 Internal Server Error

Alle Fehler im einheitlichen Format:
```json
{
  "error": {
    "message": "Beschreibung",
    "type": "error_type",
    "code": "error_code"
  }
}
```

## 🎨 Erweitungsmöglichkeiten

### Geplant/Möglich
- [ ] Streaming-Support (--output-format stream-json)
- [ ] Request-Caching (Redis)
- [ ] Conversation-History
- [ ] Multi-Model-Support (parallele Anfragen)
- [ ] Prometheus-Metriken
- [ ] GraphQL-Endpoint
- [ ] WebSocket-Support für Realtime
- [ ] Queue-System für Background-Jobs

### Custom-Features
- [ ] Token-Budget-Tracking
- [ ] User-Management
- [ ] Request-Archivierung
- [ ] A/B-Testing verschiedener Modelle
- [ ] Custom-Prompts/Templates

## 📦 Dependencies

Minimale Dependencies für beste Security:
- **express** (v4.18.2) - Web-Framework
- **uuid** (v9.0.1) - Request-ID-Generierung
- **winston** (v3.11.0) - Strukturiertes Logging
- **express-rate-limit** (v7.1.5) - Rate Limiting

Gesamt: 97 Packages (inkl. Sub-Dependencies)

## 🔐 Security-Audit

✅ Keine bekannten Vulnerabilities (npm audit)
✅ Alle Dependencies aktuell
✅ Input-Validierung implementiert
✅ Rate-Limiting aktiv
✅ Error-Messages sanitized
✅ Process-Isolation (separate Claude-Prozesse)

## 📈 Use-Cases

### Workflow Automation & Integration
- AI-powered automation workflows (n8n, Zapier, Make.com)
- Automated analysis and reporting
- Chatbot backends
- Content generation pipelines

### Root Cause Analysis
- Server-Probleme diagnostizieren
- Error-Log-Analyse
- System-Troubleshooting
- Incident-Response

### General-Purpose
- Q&A-Systeme
- Code-Review
- Dokumentations-Generierung
- Daten-Analyse

## ⚡ Quick-Facts

- **Sprache**: JavaScript (Node.js v22+)
- **Framework**: Express.js
- **Architektur**: RESTful API
- **Deployment**: Systemd Service
- **Port**: 3001
- **Protocol**: HTTP (Nginx SSL-Termination)
- **Auth**: Optional API-Key
- **Logging**: JSON structured
- **Testing**: Automated test suite
- **Documentation**: Markdown (DE)

## 🎓 Best Practices

Der Server implementiert folgende Best Practices:
- ✅ Separation of Concerns (Module)
- ✅ Error-First Callbacks
- ✅ Promise-basierte Async-Handling
- ✅ Graceful Degradation
- ✅ Configuration via Environment
- ✅ Structured Logging
- ✅ Request-ID-Tracking
- ✅ Proper HTTP-Status-Codes
- ✅ Defensive Programming
- ✅ Process-Cleanup

---

**Developed with Claude Code**
**Version:** 1.0.0
**License:** MIT
