# Quick Start Guide

## 1. Server starten

### Sofort produktiv einsetzbar (mit Defaults)

```bash
sudo systemctl restart claude-code-api
sudo systemctl status claude-code-api
```

### Logs verfolgen

```bash
sudo journalctl -u claude-code-api -f
```

## 2. Testen

```bash
# Health Check
curl http://localhost:3001/health

# Vollständiger Test
cd /home/mdoehler/claude-code-api-local
npm test
```

## 3. n8n Integration

### HTTP Request Node konfigurieren:

**Method**: POST
**URL**: `http://localhost:3001/v1/chat/completions`
**Body**:
```json
{
  "model": "claude-3-5-sonnet-20241022",
  "messages": [
    {
      "role": "user",
      "content": "={{ $json.prompt }}"
    }
  ],
  "max_tokens": 2000,
  "temperature": 0.3
}
```

## 4. Optional: Authentifizierung aktivieren

```bash
# API-Key generieren
openssl rand -hex 32

# In systemd service einfügen
sudo systemctl edit claude-code-api
```

Füge hinzu:
```ini
[Service]
Environment="API_KEY_AUTH_ENABLED=true"
Environment="API_KEY=<dein-generierter-key>"
```

Dann:
```bash
sudo systemctl daemon-reload
sudo systemctl restart claude-code-api
```

In n8n dann Header hinzufügen:
- Name: `X-API-Key`
- Value: `<dein-generierter-key>`

## 5. Troubleshooting

```bash
# Service-Status
sudo systemctl status claude-code-api

# Logs
sudo journalctl -u claude-code-api -n 100

# Port prüfen
sudo lsof -i :3001

# Manuell starten (für Debugging)
cd /home/mdoehler/claude-code-api-local
node server.js
```

## 6. Performance-Tuning

Für produktive Umgebung in systemd Service anpassen:

```bash
sudo systemctl edit claude-code-api
```

```ini
[Service]
# Längeres Timeout für komplexe Analysen
Environment="CLAUDE_TIMEOUT=180000"

# Höheres Rate-Limit
Environment="RATE_LIMIT_MAX=20"

# Produktions-Logging
Environment="LOG_LEVEL=info"
Environment="LOG_FORMAT=json"
```

## Das war's! 🚀

Der Server läuft jetzt und ist über `http://localhost:3001` erreichbar.
