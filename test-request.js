#!/usr/bin/env node

/**
 * Test-Client für Claude Code API Server
 *
 * Sendet Test-Requests an den Server um die Funktionalität zu prüfen
 */

const http = require('http');

// Konfiguration
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || null;

// ANSI Color Codes für Terminal-Output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Sendet einen HTTP-Request an den Server
 */
function sendRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Test 1: Health Check
 */
async function testHealthCheck() {
  console.log(`\n${colors.bright}${colors.blue}=== Test 1: Health Check ===${colors.reset}`);

  try {
    const response = await sendRequest({
      hostname: HOST,
      port: PORT,
      path: '/health',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`${colors.green}✓ Status: ${response.statusCode}${colors.reset}`);
    console.log(`${colors.cyan}Response:${colors.reset}`);
    console.log(JSON.stringify(response.body, null, 2));

    return response.statusCode === 200;
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test 2: Server Info
 */
async function testServerInfo() {
  console.log(`\n${colors.bright}${colors.blue}=== Test 2: Server Info ===${colors.reset}`);

  try {
    const response = await sendRequest({
      hostname: HOST,
      port: PORT,
      path: '/',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`${colors.green}✓ Status: ${response.statusCode}${colors.reset}`);
    console.log(`${colors.cyan}Response:${colors.reset}`);
    console.log(JSON.stringify(response.body, null, 2));

    return response.statusCode === 200;
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test 3: Chat Completion (Einfach)
 */
async function testChatCompletion() {
  console.log(`\n${colors.bright}${colors.blue}=== Test 3: Chat Completion ===${colors.reset}`);

  const headers = {
    'Content-Type': 'application/json'
  };

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const requestData = {
    model: 'sonnet', // Model-Alias (sonnet, opus, haiku)
    messages: [
      {
        role: 'user',
        content: 'Hallo! Bitte antworte kurz: Was ist 2+2?'
      }
    ],
    max_tokens: 100,
    temperature: 0.3
  };

  console.log(`${colors.cyan}Request:${colors.reset}`);
  console.log(JSON.stringify(requestData, null, 2));

  try {
    const startTime = Date.now();

    const response = await sendRequest({
      hostname: HOST,
      port: PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: headers
    }, requestData);

    const duration = Date.now() - startTime;

    console.log(`${colors.green}✓ Status: ${response.statusCode}${colors.reset}`);
    console.log(`${colors.yellow}Duration: ${duration}ms${colors.reset}`);
    console.log(`${colors.cyan}Response:${colors.reset}`);
    console.log(JSON.stringify(response.body, null, 2));

    if (response.body.choices && response.body.choices[0]) {
      console.log(`\n${colors.bright}${colors.cyan}Claude's Answer:${colors.reset}`);
      console.log(response.body.choices[0].message.content);
    }

    return response.statusCode === 200;
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test 4: RCA Endpoint
 */
async function testRCAEndpoint() {
  console.log(`\n${colors.bright}${colors.blue}=== Test 4: RCA Endpoint ===${colors.reset}`);

  const headers = {
    'Content-Type': 'application/json'
  };

  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const requestData = {
    prompt: 'Analysiere kurz: Ein Server antwortet nicht. Was könnten die Ursachen sein?',
    max_tokens: 200
  };

  console.log(`${colors.cyan}Request:${colors.reset}`);
  console.log(JSON.stringify(requestData, null, 2));

  try {
    const startTime = Date.now();

    const response = await sendRequest({
      hostname: HOST,
      port: PORT,
      path: '/api/rca',
      method: 'POST',
      headers: headers
    }, requestData);

    const duration = Date.now() - startTime;

    console.log(`${colors.green}✓ Status: ${response.statusCode}${colors.reset}`);
    console.log(`${colors.yellow}Duration: ${duration}ms${colors.reset}`);
    console.log(`${colors.cyan}Response:${colors.reset}`);
    console.log(JSON.stringify(response.body, null, 2));

    if (response.body.analysis) {
      console.log(`\n${colors.bright}${colors.cyan}RCA Analysis:${colors.reset}`);
      console.log(response.body.analysis);
    }

    return response.statusCode === 200;
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test 5: Error-Handling (ungültige Request)
 */
async function testErrorHandling() {
  console.log(`\n${colors.bright}${colors.blue}=== Test 5: Error Handling ===${colors.reset}`);

  const requestData = {
    model: 'sonnet',
    messages: [] // Leeres Array sollte Fehler verursachen
  };

  console.log(`${colors.cyan}Request (invalid):${colors.reset}`);
  console.log(JSON.stringify(requestData, null, 2));

  try {
    const response = await sendRequest({
      hostname: HOST,
      port: PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, requestData);

    console.log(`${colors.green}✓ Status: ${response.statusCode}${colors.reset}`);
    console.log(`${colors.cyan}Response:${colors.reset}`);
    console.log(JSON.stringify(response.body, null, 2));

    return response.statusCode === 400; // Erwarten Fehler
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Haupt-Funktion: Führt alle Tests aus
 */
async function runAllTests() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Claude Code API Server - Test Suite            ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  console.log(`Server: ${colors.yellow}${HOST}:${PORT}${colors.reset}`);
  console.log(`API-Key: ${colors.yellow}${API_KEY ? 'Configured' : 'None'}${colors.reset}`);

  const results = [];

  // Tests ausführen
  results.push({ name: 'Health Check', passed: await testHealthCheck() });
  results.push({ name: 'Server Info', passed: await testServerInfo() });
  results.push({ name: 'Chat Completion', passed: await testChatCompletion() });
  results.push({ name: 'RCA Endpoint', passed: await testRCAEndpoint() });
  results.push({ name: 'Error Handling', passed: await testErrorHandling() });

  // Zusammenfassung
  console.log(`\n${colors.bright}${colors.cyan}=== Test Summary ===${colors.reset}`);
  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    const icon = result.passed ? `${colors.green}✓` : `${colors.red}✗`;
    console.log(`${icon} ${result.name}${colors.reset}`);
  });

  console.log(`\n${colors.bright}Result: ${passed}/${total} tests passed${colors.reset}`);

  if (passed === total) {
    console.log(`${colors.green}${colors.bright}All tests passed! 🎉${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}${colors.bright}Some tests failed.${colors.reset}\n`);
    process.exit(1);
  }
}

// Tests starten
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
