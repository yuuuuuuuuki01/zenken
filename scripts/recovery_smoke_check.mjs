#!/usr/bin/env node

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const DEFAULT_BASE_URL = 'https://localhost:8081';
const DEFAULT_TIMEOUT_MS = 8000;

export function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--base-url' && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i += 1;
    } else if (v === '--timeout-ms' && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --timeout-ms value: ${argv[i + 1]}`);
      }
      args.timeoutMs = parsed;
      i += 1;
    } else if (v === '--dry-run') {
      args.dryRun = true;
    } else {
      throw new Error(`Unknown argument: ${v}`);
    }
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(args.baseUrl);
  } catch {
    throw new Error(`Invalid --base-url value: ${args.baseUrl}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported protocol for --base-url: ${parsedUrl.protocol}`);
  }

  return args;
}

export function getChecks() {
  return [
    { name: 'Version endpoint', path: '/v1/version', expectJson: 'version' },
    { name: 'Recovery health endpoint', path: '/health/recovery', expectJson: 'recovery' },
    { name: 'Admin UI', path: '/admin/', expectJson: false },
    { name: 'Client portal UI', path: '/client-portal/', expectJson: false },
    { name: 'Worker portal UI', path: '/worker-portal/', expectJson: false }
  ];
}

export function requestPath(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        timeout: timeoutMs,
        rejectUnauthorized: false
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode || 0, body });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

export function validateJsonPayload(expectJson, body) {
  const parsed = JSON.parse(body);

  if (expectJson === 'version') {
    if (!parsed.version || typeof parsed.version !== 'string') {
      throw new Error('missing version key');
    }
    return `version=${parsed.version}`;
  }

  if (expectJson === 'recovery') {
    const hasNodeCount = typeof parsed.connectedNodes === 'number';
    const hasTaskCount = typeof parsed.activeTasks === 'number';
    const hasStatus = typeof parsed.status === 'string';
    if (!hasNodeCount || !hasTaskCount || !hasStatus) {
      throw new Error('missing connectedNodes/activeTasks/status');
    }
    return `nodes=${parsed.connectedNodes}, activeTasks=${parsed.activeTasks}`;
  }

  return 'json-ok';
}

export async function runChecks(options) {
  const checks = getChecks();
  const results = [];

  for (const check of checks) {
    const target = `${options.baseUrl}${check.path}`;
    try {
      const res = await requestPath(target, options.timeoutMs);
      const okStatus = res.statusCode >= 200 && res.statusCode < 400;
      if (!okStatus) {
        results.push({ check: check.name, ok: false, detail: `HTTP ${res.statusCode}`, target });
        continue;
      }

      if (check.expectJson) {
        try {
          const detail = validateJsonPayload(check.expectJson, res.body);
          results.push({ check: check.name, ok: true, detail, target });
        } catch (e) {
          results.push({ check: check.name, ok: false, detail: `invalid payload: ${e.message}`, target });
        }
      } else {
        results.push({ check: check.name, ok: true, detail: `HTTP ${res.statusCode}`, target });
      }
    } catch (err) {
      results.push({ check: check.name, ok: false, detail: err.message || String(err), target });
    }
  }

  return results;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  console.log('[Recovery Smoke] Base URL:', options.baseUrl);
  console.log('[Recovery Smoke] Timeout:', options.timeoutMs, 'ms');

  const checks = getChecks();
  if (options.dryRun) {
    console.log('[Recovery Smoke] Dry run mode. Planned checks:');
    checks.forEach((c) => console.log(` - ${c.name}: ${c.path}`));
    return 0;
  }

  const results = await runChecks(options);
  let failures = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`✅ ${r.check} OK: ${r.detail}`);
    } else {
      failures += 1;
      console.error(`❌ ${r.check} failed: ${r.detail} (${r.target})`);
    }
  }

  const summary = `[Recovery Smoke] ${results.length - failures}/${results.length} checks passed.`;
  if (failures > 0) {
    console.error(`\n${summary}`);
    return 1;
  }

  console.log(`\n${summary}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      console.error('[Recovery Smoke] Unhandled error:', err.message || err);
      process.exit(1);
    });
}
