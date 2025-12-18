# Claude Code API Server

Production-ready API server that provides OpenAI-compatible and Anthropic-compatible endpoints for Claude Code CLI integration.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)

## Features

- 🔄 **Dual API Format Support**: OpenAI `/v1/chat/completions` and Anthropic `/v1/messages` endpoints
- 🚀 **Streaming Support**: Server-Sent Events (SSE) for real-time responses
- 🔐 **Session Management**: Automatic session isolation with Claude's `--session-id`
- ⚡ **Rate Limiting**: Built-in request throttling
- 📊 **Multiple Output Formats**: Text, JSON, and streaming JSON
- 🔧 **Production-Ready**: Graceful shutdown, structured logging, health checks

## Quick Start

\`\`\`bash
# Clone the repository
git clone https://github.com/marcoFPO/claude-code-api-server.git
cd claude-code-api-server

# Install dependencies
npm install

# Start the server
node server.js
\`\`\`

Server will be running at \`http://localhost:3001\`

## Installation

### Prerequisites

- Node.js >= 16.0.0
- Claude Code CLI installed and configured
- (Optional) Redis for advanced session management

### Configure Environment

The server can be configured via environment variables. All settings have sensible defaults.

**Optional Configuration:**
\`\`\`env
PORT=3001                      # Server port (default: 3001)
HOST=0.0.0.0                   # Server host (default: 0.0.0.0)
CLAUDE_CLI_PATH=claude         # Path to Claude CLI (default: claude)
CLAUDE_DEFAULT_MODEL=sonnet    # Default model (default: sonnet)
RATE_LIMIT_ENABLED=true        # Enable rate limiting (default: true)
\`\`\`

See `config.js` for all available configuration options.

## API Endpoints

### OpenAI Format - Chat Completions

\`\`\`bash
POST /v1/chat/completions
\`\`\`

**Request:**
\`\`\`json
{
  "model": "sonnet",
  "messages": [{"role": "user", "content": "Hello!"}],
  "max_tokens": 2048
}
\`\`\`

### Anthropic Format - Messages

\`\`\`bash
POST /v1/messages
\`\`\`

**Request:**
\`\`\`json
{
  "model": "sonnet",
  "messages": [{"role": "user", "content": "Hello!"}],
  "max_tokens": 2048
}
\`\`\`

### Health Check

\`\`\`bash
GET /health
\`\`\`

## Usage Examples

### Python

\`\`\`python
import requests

response = requests.post(
    "http://localhost:3001/v1/chat/completions",
    json={"model": "sonnet", "messages": [{"role": "user", "content": "Hello"}]}
)
print(response.json()["choices"][0]["message"]["content"])
\`\`\`

### JavaScript

\`\`\`javascript
const axios = require('axios');

const response = await axios.post('http://localhost:3001/v1/chat/completions', {
  model: 'sonnet',
  messages: [{role: 'user', content: 'Hello'}]
});
console.log(response.data.choices[0].message.content);
\`\`\`

### cURL

\`\`\`bash
curl -X POST http://localhost:3001/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"sonnet","messages":[{"role":"user","content":"Hello"}]}'
\`\`\`

## Documentation

See [docs/claude-code-api-documentation.md](docs/claude-code-api-documentation.md) for complete API reference.

## License

MIT License - see LICENSE file for details.

## Support

- **Issues:** [GitHub Issues](https://github.com/marcoFPO/claude-code-api-server/issues)
- **Documentation:** Full API docs in \`docs/\` folder

---

**Made with ❤️ for the Claude Code community**
