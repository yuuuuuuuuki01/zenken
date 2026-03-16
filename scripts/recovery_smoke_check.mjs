#!/usr/bin/env node

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

function parseArgs(argv) {
  const args = { baseUrl: 'https://localhost:8081', timeoutMs: 8000, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--base-url' && argv[i + 1]) {
      args.baseUrl = argv[i + 1];
      i += 1;
    } else if (v === '--timeout-ms' && argv[i + 1]) {
      args.timeoutMs = Number(argv[i + 1]);
      i += 1;
    } else if (v === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

function requestJson(url, timeoutMs) {
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

async function main() {
  const { baseUrl, timeoutMs, dryRun } = parseArgs(process.argv.slice(2));

  const checks = [
    { name: 'Version endpoint', path: '/v1/version', expectJson: 'version' },
    { name: 'Recovery health endpoint', path: '/health/recovery', expectJson: 'recovery' },
    { name: 'Admin UI', path: '/admin/', expectJson: false },
    { name: 'Client portal UI', path: '/client-portal/', expectJson: false },
    { name: 'Worker portal UI', path: '/worker-portal/', expectJson: false }
  ];

  console.log('[Recovery Smoke] Base URL:', baseUrl);
  console.log('[Recovery Smoke] Timeout:', timeoutMs, 'ms');

  if (dryRun) {
    console.log('[Recovery Smoke] Dry run mode. Planned checks:');
    checks.forEach((c) => console.log(` - ${c.name}: ${c.path}`));
    process.exit(0);
  }

  let failures = 0;

  for (const check of checks) {
    const target = `${baseUrl}${check.path}`;
    try {
      const res = await requestJson(target, timeoutMs);
      const ok = res.statusCode >= 200 && res.statusCode < 400;
      if (!ok) {
        failures += 1;
        console.error(`❌ ${check.name} failed: HTTP ${res.statusCode} (${target})`);
        continue;
      }

      if (check.expectJson) {
        try {
          const parsed = JSON.parse(res.body);
          if (check.expectJson === 'version') {
            if (!parsed.version) {
              failures += 1;
              console.error(`❌ ${check.name} invalid payload: missing version key (${target})`);
              continue;
            }
            console.log(`✅ ${check.name} OK: version=${parsed.version}`);
          } else if (check.expectJson === 'recovery') {
            const hasNodeCount = typeof parsed.connectedNodes === 'number';
            const hasTaskCount = typeof parsed.activeTasks === 'number';
            if (!hasNodeCount || !hasTaskCount) {
              failures += 1;
              console.error(`❌ ${check.name} invalid payload: missing connectedNodes/activeTasks (${target})`);
              continue;
            }
            console.log(`✅ ${check.name} OK: nodes=${parsed.connectedNodes}, activeTasks=${parsed.activeTasks}`);
          }
        } catch {
          failures += 1;
          console.error(`❌ ${check.name} invalid JSON (${target})`);
        }
      } else {
        console.log(`✅ ${check.name} OK: HTTP ${res.statusCode}`);
      }
    } catch (err) {
      failures += 1;
      console.error(`❌ ${check.name} error (${target}):`, err.message || err);
    }
  }

  if (failures > 0) {
    console.error(`\n[Recovery Smoke] ${failures} checks failed.`);
    process.exit(1);
  }

  console.log('\n[Recovery Smoke] All checks passed.');
}

main().catch((err) => {
  console.error('[Recovery Smoke] Unhandled error:', err);
  process.exit(1);
});
