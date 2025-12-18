# Claude Code API Server - Vollständige Dokumentation

**Server:** http://10.1.1.105:3001
**Version:** 1.0.0
**Basis-URL:** http://10.1.1.105:3001

---

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Anthropic API Format - /v1/messages](#anthropic-api-format---v1messages)
3. [OpenAI API Format - /v1/chat/completions](#openai-api-format---v1chatcompletions)
4. [Root Cause Analysis - /api/rca](#root-cause-analysis---apirca)
5. [Authentifizierung](#authentifizierung)
6. [Fehlerbehandlung](#fehlerbehandlung)
7. [Session Management](#session-management)
8. [Rate Limiting](#rate-limiting)

---

## Übersicht

Der Claude Code API Server bietet zwei API-Formate für maximale Kompatibilität:

| Endpunkt | Format | Verwendung |
|----------|--------|------------|
| `/v1/messages` | Anthropic API | Legacy-Workflows, Anthropic SDK Kompatibilität |
| `/v1/chat/completions` | OpenAI API | Moderne Workflows, OpenAI SDK Kompatibilität |
| `/api/rca` | Vereinfacht | Root Cause Analysis Use-Cases |

**Beide Endpunkte nutzen den gleichen Claude Code Backend und Session Manager.**

---

## Anthropic API Format - /v1/messages

### Endpunkt

```
POST http://10.1.1.105:3001/v1/messages
```

### Request Format

#### Headers

| Header | Erforderlich | Beschreibung |
|--------|--------------|--------------|
| `Content-Type` | Ja | Muss `application/json` sein |
| `X-Request-ID` | Optional | Eindeutige Request-ID für Tracking und Session-Isolation |
| `anthropic-version` | Optional | API-Version (wird ignoriert, aber akzeptiert) |
| `x-api-key` | Optional | API-Key für Authentication (falls aktiviert) |

#### Body Parameter

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|-----|--------------|----------|--------------|
| `model` | string | Nein | `"sonnet"` | Claude Modell: `"opus"`, `"sonnet"`, `"haiku"` |
| `messages` | array | **Ja** | - | Array von Nachrichten im Anthropic Format |
| `max_tokens` | integer | Nein | `2048` | Maximale Anzahl der Output-Tokens (1-8192) |
| `temperature` | float | Nein | `0.7` | Kreativität (0.0 = deterministisch, 1.0 = kreativ) |
| `metadata` | object | Nein | `{}` | Zusätzliche Metadaten (z.B. `user_id` für Session-Tracking) |

#### Messages Array Format

Jede Nachricht im `messages` Array:

```json
{
  "role": "user" | "assistant",
  "content": "string"
}
```

### Response Format

```json
{
  "id": "msg-<session-id>-<timestamp>",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Die Antwort von Claude..."
    }
  ],
  "model": "sonnet",
  "stop_reason": "end_turn" | "max_tokens",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 123,
    "output_tokens": 456
  }
}
```

### Beispiele

#### Beispiel 1: Einfache Frage

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: user-123-$(date +%s)" \
  -d '{
    "model": "sonnet",
    "max_tokens": 1024,
    "temperature": 0.7,
    "messages": [
      {
        "role": "user",
        "content": "Erkläre in 2 Sätzen was Docker ist."
      }
    ]
  }'
```

**Response:**
```json
{
  "id": "msg-user-123-1734185905",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Docker ist eine Plattform zur Containerisierung von Anwendungen, die es ermöglicht, Software mit allen Abhängigkeiten in isolierten, portablen Containern zu verpacken. Diese Container laufen konsistent auf jedem System, unabhängig von der Umgebung."
    }
  ],
  "model": "sonnet",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 18,
    "output_tokens": 52
  }
}
```

#### Beispiel 2: Code-Generierung

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "max_tokens": 2048,
    "temperature": 0.2,
    "messages": [
      {
        "role": "user",
        "content": "Schreibe eine Python-Funktion die prüft ob eine Zahl prim ist."
      }
    ]
  }'
```

#### Beispiel 3: Konversations-Context

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: conversation-xyz" \
  -d '{
    "model": "sonnet",
    "messages": [
      {
        "role": "user",
        "content": "Was ist die Hauptstadt von Deutschland?"
      },
      {
        "role": "assistant",
        "content": "Die Hauptstadt von Deutschland ist Berlin."
      },
      {
        "role": "user",
        "content": "Wie viele Einwohner hat sie?"
      }
    ]
  }'
```

**Wichtig:** Durch die gleiche `X-Request-ID` nutzt Claude die gleiche Session und hat den vorherigen Kontext.

---

## OpenAI API Format - /v1/chat/completions

### Endpunkt

```
POST http://10.1.1.105:3001/v1/chat/completions
```

### Request Format

#### Headers

| Header | Erforderlich | Beschreibung |
|--------|--------------|--------------|
| `Content-Type` | Ja | Muss `application/json` sein |
| `X-Request-ID` | Optional | Session-ID für Context-Sharing |
| `Authorization` | Optional | `Bearer <token>` oder `Bearer <api-key>` (falls Auth aktiviert) |

#### Body Parameter

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|-----|--------------|----------|--------------|
| `model` | string | Nein | `"sonnet"` | Claude Modell: `"opus"`, `"sonnet"`, `"haiku"` |
| `messages` | array | **Ja** | - | Array von Nachrichten im OpenAI Format |
| `max_tokens` | integer | Nein | `2048` | Maximale Anzahl der Output-Tokens |
| `temperature` | float | Nein | `0.7` | Kreativität (0.0-1.0) |
| `input_format` | string | Nein | `"text"` | Input-Format: `"text"` oder `"stream-json"` |
| `output_format` | string | Nein | `"json"` | Output-Format: `"text"`, `"json"`, `"stream-json"` |
| `stream` | boolean | Nein | `false` | **Deprecated** - Nutze `output_format: "stream-json"` |

#### Messages Array Format

```json
{
  "role": "system" | "user" | "assistant",
  "content": "string"
}
```

**Hinweis:** `system` Messages werden als erste User-Message behandelt.

### Response Format

#### Standard Response (output_format: "json")

```json
{
  "id": "chatcmpl-<session-id>-<timestamp>",
  "object": "chat.completion",
  "created": 1734185905,
  "model": "sonnet",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Die Antwort von Claude..."
      },
      "finish_reason": "stop" | "length"
    }
  ],
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 456,
    "total_tokens": 579
  }
}
```

#### Streaming Response (output_format: "stream-json")

**Content-Type:** `text/event-stream`

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1734185905,"model":"sonnet","choices":[{"index":0,"delta":{"role":"assistant","content":"Die"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1734185905,"model":"sonnet","choices":[{"index":0,"delta":{"content":" Antwort"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1734185905,"model":"sonnet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### Beispiele

#### Beispiel 1: Einfache Completion

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      {
        "role": "user",
        "content": "Was ist 2+2?"
      }
    ],
    "max_tokens": 100,
    "temperature": 0.1
  }'
```

**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1734185905,
  "model": "sonnet",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "2 + 2 = 4"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 8,
    "completion_tokens": 7,
    "total_tokens": 15
  }
}
```

#### Beispiel 2: System Prompt

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      {
        "role": "system",
        "content": "Du bist ein hilfsbereiter DevOps-Experte."
      },
      {
        "role": "user",
        "content": "Wie deploye ich eine Node.js App?"
      }
    ]
  }'
```

#### Beispiel 3: Streaming Response

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -N \
  -d '{
    "model": "sonnet",
    "messages": [
      {
        "role": "user",
        "content": "Schreibe eine kurze Geschichte."
      }
    ],
    "output_format": "stream-json"
  }'
```

**Response:** Server-Sent Events (SSE) Stream

#### Beispiel 4: Text Output Format

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [
      {
        "role": "user",
        "content": "Sage Hallo"
      }
    ],
    "output_format": "text"
  }'
```

**Response:** Plain text (kein JSON)
```
Hallo! Wie kann ich dir helfen?
```

---

## Root Cause Analysis - /api/rca

### Endpunkt

```
POST http://10.1.1.105:3001/api/rca
```

### Request Format

Vereinfachtes Format für Root Cause Analysis Use-Cases.

#### Body Parameter

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|-----|--------------|----------|--------------|
| `prompt` | string | **Ja** | - | RCA Prompt mit Incident-Details |
| `model` | string | Nein | `"sonnet"` | Claude Modell |
| `max_tokens` | integer | Nein | `2048` | Maximale Output-Tokens |
| `temperature` | float | Nein | `0.7` | Kreativität |

### Response Format

```json
{
  "id": "chatcmpl-...",
  "analysis": "Die Root Cause Analysis...",
  "model": "sonnet",
  "created": 1734185905,
  "usage": {
    "prompt_tokens": 123,
    "completion_tokens": 456,
    "total_tokens": 579
  }
}
```

### Beispiel

**Request:**
```bash
curl -X POST http://10.1.1.105:3001/api/rca \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Analysiere folgendes Problem: Webserver antwortet mit 502 Bad Gateway. Load: 0.5, Memory: 20% frei, Disk: 50% frei. Nginx-Logs zeigen: upstream timeout nach 60s.",
    "model": "sonnet",
    "max_tokens": 1024
  }'
```

**Response:**
```json
{
  "id": "chatcmpl-rca-123",
  "analysis": "**Root Cause Analysis:**\n\nDas Problem ist ein Timeout zwischen Nginx und dem Backend-Service...",
  "model": "sonnet",
  "created": 1734185905,
  "usage": {
    "prompt_tokens": 45,
    "completion_tokens": 234,
    "total_tokens": 279
  }
}
```

---

## Authentifizierung

### Übersicht

Der Server unterstützt optionale Authentifizierung. Wenn aktiviert:

#### JWT Token Authentication

1. **Login:**
```bash
curl -X POST http://10.1.1.105:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "demo",
    "password": "demo123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "demo",
    "name": "Demo User"
  }
}
```

2. **API Request mit Token:**
```bash
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

#### API Key Authentication

```bash
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Authorization: Bearer demo-api-key" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

**Hinweis:** Aktuell ist Authentication **deaktiviert** (`authEnabled: false`).

---

## Fehlerbehandlung

### Fehler-Response Format

Alle Fehler folgen diesem Format:

```json
{
  "error": {
    "message": "Fehlerbeschreibung",
    "type": "error_type",
    "code": "error_code"
  }
}
```

### HTTP Status Codes

| Code | Bedeutung | Beispiel |
|------|-----------|----------|
| `200` | Success | Request erfolgreich verarbeitet |
| `400` | Bad Request | Fehlende oder ungültige Parameter |
| `401` | Unauthorized | Authentication fehlgeschlagen |
| `404` | Not Found | Endpunkt existiert nicht |
| `429` | Too Many Requests | Rate-Limit überschritten |
| `500` | Internal Server Error | Server-Fehler oder Claude-Execution-Fehler |

### Häufige Fehler

#### 1. Fehlende Messages

**Request:**
```json
{
  "model": "sonnet"
}
```

**Response:** `400 Bad Request`
```json
{
  "error": {
    "message": "messages array is required",
    "type": "invalid_request_error",
    "code": "missing_messages"
  }
}
```

#### 2. Rate Limit Exceeded

**Response:** `429 Too Many Requests`
```json
{
  "error": {
    "message": "Too many requests, please try again later",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
```

**Headers:**
```
RateLimit-Limit: 60
RateLimit-Remaining: 0
RateLimit-Reset: 60
```

#### 3. Claude Execution Error

**Response:** `500 Internal Server Error`
```json
{
  "error": {
    "message": "Claude process exited with code 1: ...",
    "type": "claude_execution_error",
    "code": "unknown_error"
  }
}
```

---

## Session Management

### Konzept

Der Server nutzt Claude's `--session-id` Feature für persistente Conversations:

- **Session-ID:** Wird aus `X-Request-ID` Header oder `metadata.user_id` generiert
- **Session-Isolation:** Jede Session hat ihren eigenen Context
- **Automatische Erstellung:** Sessions werden on-demand erstellt
- **Timeout:** Inaktive Sessions werden nach 30 Minuten bereinigt

### Session-Verwaltung

#### Session-Liste abrufen

```bash
curl -X GET http://10.1.1.105:3001/v1/sessions \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "user-123-1734185905",
      "userId": "demo",
      "model": "sonnet",
      "createdAt": "2025-12-14T12:00:00Z",
      "lastActivity": "2025-12-14T12:15:00Z",
      "status": "active"
    }
  ]
}
```

#### Session beenden

```bash
curl -X DELETE http://10.1.1.105:3001/v1/sessions/user-123-1734185905 \
  -H "Authorization: Bearer <token>"
```

### Best Practices

1. **Konsistente Request-IDs:** Nutze die gleiche `X-Request-ID` für zusammenhängende Conversations
2. **User-spezifische IDs:** Format: `user-<user-id>-<timestamp>` oder `conversation-<id>`
3. **Session-Trennung:** Verschiedene Tasks = verschiedene Request-IDs

**Beispiel:**
```bash
# Conversation A
curl ... -H "X-Request-ID: user-alice-task-1"
curl ... -H "X-Request-ID: user-alice-task-1"  # Gleiche Session

# Conversation B (neue Session)
curl ... -H "X-Request-ID: user-alice-task-2"
```

---

## Rate Limiting

### Konfiguration

- **Window:** 60 Sekunden
- **Max Requests:** 60 pro Window
- **Status:** Aktiviert

### Rate Limit Headers

Jede Response enthält:

```
RateLimit-Policy: 60;w=60
RateLimit-Limit: 60
RateLimit-Remaining: 42
RateLimit-Reset: 18
```

| Header | Beschreibung |
|--------|--------------|
| `RateLimit-Limit` | Max Requests pro Window |
| `RateLimit-Remaining` | Verbleibende Requests |
| `RateLimit-Reset` | Sekunden bis Reset |

### Umgang mit Rate Limits

**Python Beispiel:**
```python
import requests
import time

def call_api_with_retry(url, data, max_retries=3):
    for attempt in range(max_retries):
        response = requests.post(url, json=data)

        if response.status_code == 429:
            reset_time = int(response.headers.get('RateLimit-Reset', 60))
            print(f"Rate limit hit, waiting {reset_time}s...")
            time.sleep(reset_time)
            continue

        return response

    raise Exception("Max retries exceeded")
```

---

## Vergleich: Anthropic vs OpenAI Format

| Feature | `/v1/messages` (Anthropic) | `/v1/chat/completions` (OpenAI) |
|---------|---------------------------|--------------------------------|
| **Request Format** | `messages`, `max_tokens` | `messages`, `max_tokens` |
| **Response Format** | `content: [{type, text}]` | `choices: [{message: {content}}]` |
| **System Messages** | Nicht unterstützt | `role: "system"` |
| **Streaming** | Nicht implementiert | `output_format: "stream-json"` |
| **Stop Reason** | `"end_turn"`, `"max_tokens"` | `"stop"`, `"length"` |
| **Token Counting** | `input_tokens`, `output_tokens` | `prompt_tokens`, `completion_tokens`, `total_tokens` |
| **Verwendung** | Legacy Workflows | Neue Workflows, Streaming |

---

## Tipps & Best Practices

### 1. Model-Auswahl

| Model | Verwendung | Speed | Cost | Quality |
|-------|-----------|-------|------|---------|
| `haiku` | Schnelle Aufgaben, Simple Fragen | ⚡⚡⚡ | 💰 | ⭐⭐ |
| `sonnet` | Standard, gutes Gleichgewicht | ⚡⚡ | 💰💰 | ⭐⭐⭐ |
| `opus` | Komplexe Aufgaben, Code-Generation | ⚡ | 💰💰💰 | ⭐⭐⭐⭐ |

### 2. Temperature Settings

```
0.0 - 0.3   → Deterministisch, Fakten, Code
0.4 - 0.7   → Ausgewogen (Standard)
0.8 - 1.0   → Kreativ, Brainstorming
```

### 3. max_tokens Empfehlungen

```
100-500     → Kurze Antworten
500-1000    → Standard Antworten
1000-2000   → Detaillierte Erklärungen
2000-4096   → Lange Analysen, Code
```

### 4. Prompt Engineering

**Gut:**
```
Du bist ein DevOps-Experte. Analysiere folgendes Problem:
- System: Ubuntu 22.04
- Service: Nginx
- Problem: 502 Bad Gateway
- Logs: [...]

Gib eine strukturierte Antwort mit:
1. Root Cause
2. Lösung
3. Prevention
```

**Schlecht:**
```
Was ist das Problem?
```

---

## Health Check & Monitoring

### Health Endpoint

```bash
curl http://10.1.1.105:3001/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-14T12:00:00.000Z",
  "uptime": 3600.5,
  "version": "1.0.0"
}
```

### Model List

```bash
curl http://10.1.1.105:3001/v1/models
```

**Response:**
```json
{
  "object": "list",
  "data": [
    {
      "id": "opus",
      "object": "model",
      "created": 1677649963,
      "owned_by": "anthropic"
    },
    {
      "id": "sonnet",
      "object": "model",
      "created": 1677649963,
      "owned_by": "anthropic"
    },
    {
      "id": "haiku",
      "object": "model",
      "created": 1677649963,
      "owned_by": "anthropic"
    }
  ]
}
```

---

## Code-Beispiele

### Python

```python
import requests

# Anthropic Format
def call_anthropic_api(prompt, session_id=None):
    url = "http://10.1.1.105:3001/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "X-Request-ID": session_id or f"python-{int(time.time())}"
    }
    data = {
        "model": "sonnet",
        "max_tokens": 2048,
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    response = requests.post(url, headers=headers, json=data)
    return response.json()

# OpenAI Format
def call_openai_api(prompt):
    url = "http://10.1.1.105:3001/v1/chat/completions"
    data = {
        "model": "sonnet",
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    response = requests.post(url, json=data)
    return response.json()

# Verwendung
result = call_openai_api("Was ist Docker?")
print(result["choices"][0]["message"]["content"])
```

### JavaScript/Node.js

```javascript
const axios = require('axios');

// OpenAI Format
async function callClaudeAPI(prompt) {
  const response = await axios.post('http://10.1.1.105:3001/v1/chat/completions', {
    model: 'sonnet',
    messages: [
      { role: 'user', content: prompt }
    ],
    max_tokens: 2048
  });

  return response.data.choices[0].message.content;
}

// Streaming
async function callClaudeStreaming(prompt) {
  const response = await axios.post(
    'http://10.1.1.105:3001/v1/chat/completions',
    {
      model: 'sonnet',
      messages: [{ role: 'user', content: prompt }],
      output_format: 'stream-json'
    },
    {
      responseType: 'stream'
    }
  );

  response.data.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        const json = JSON.parse(data);
        const content = json.choices[0]?.delta?.content;
        if (content) process.stdout.write(content);
      }
    }
  });
}

// Verwendung
callClaudeAPI('Erkläre Docker').then(console.log);
```

### cURL

```bash
# Einfacher Request
curl -X POST http://10.1.1.105:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Hallo"}]
  }' | jq -r '.choices[0].message.content'

# Mit Session
SESSION_ID="my-session-$(date +%s)"
curl -X POST http://10.1.1.105:3001/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $SESSION_ID" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Erste Frage"}]
  }'

curl -X POST http://10.1.1.105:3001/v1/messages \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: $SESSION_ID" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Folge-Frage"}]
  }'
```

---

## Anhang: Quick Reference

### API Endpoints Cheat Sheet

```bash
# Health Check
GET  /health

# OpenAI Chat (empfohlen für neue Projekte)
POST /v1/chat/completions

# Anthropic Messages (für Legacy Support)
POST /v1/messages

# Root Cause Analysis (vereinfacht)
POST /api/rca

# Model Liste
GET  /v1/models

# Session Management (mit Auth)
GET    /v1/sessions
POST   /v1/sessions
DELETE /v1/sessions/:id
```

### Minimal Requests

**OpenAI:**
```json
{
  "messages": [{"role": "user", "content": "Hello"}]
}
```

**Anthropic:**
```json
{
  "messages": [{"role": "user", "content": "Hello"}]
}
```

**RCA:**
```json
{
  "prompt": "Analyze this..."
}
```

---

**Dokumentation erstellt:** 2025-12-18
**Server Version:** 1.0.0
**Letztes Update:** 2025-12-18
