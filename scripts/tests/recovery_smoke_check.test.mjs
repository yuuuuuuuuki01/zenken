import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseArgs, validateJsonPayload, runChecks } from '../recovery_smoke_check.mjs';

test('parseArgs parses valid inputs', () => {
  const args = parseArgs(['--base-url', 'http://127.0.0.1:9999', '--timeout-ms', '1500']);
  assert.equal(args.baseUrl, 'http://127.0.0.1:9999');
  assert.equal(args.timeoutMs, 1500);
  assert.equal(args.dryRun, false);
});

test('parseArgs rejects invalid timeout', () => {
  assert.throws(() => parseArgs(['--timeout-ms', 'abc']), /Invalid --timeout-ms/);
});

test('parseArgs rejects unknown flags', () => {
  assert.throws(() => parseArgs(['--wat']), /Unknown argument/);
});

test('validateJsonPayload validates version and recovery payloads', () => {
  assert.equal(validateJsonPayload('version', JSON.stringify({ version: 'v1.0.0' })), 'version=v1.0.0');
  assert.equal(
    validateJsonPayload('recovery', JSON.stringify({ status: 'ok', connectedNodes: 1, activeTasks: 2 })),
    'nodes=1, activeTasks=2'
  );
  assert.throws(() => validateJsonPayload('version', JSON.stringify({ nope: true })), /missing version key/);
});

test('runChecks passes against mock server', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/version') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ version: 'v1.2.3' }));
      return;
    }
    if (req.url === '/health/recovery') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', connectedNodes: 0, activeTasks: 0 }));
      return;
    }
    if (['/admin/', '/client-portal/', '/worker-portal/'].includes(req.url || '')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>ok</html>');
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    const results = await runChecks({ baseUrl, timeoutMs: 1500 });
    assert.equal(results.length, 5);
    assert.equal(results.every((r) => r.ok), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

