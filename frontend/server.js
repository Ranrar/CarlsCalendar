/**
 * Minimal static file server with ANSI-coloured request logs.
 *
 * Colours:
 *   2xx → green
 *   3xx → cyan
 *   4xx → yellow
 *   5xx → red (bold)
 */

'use strict';

const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, 'dist');
const PORT = process.env.PORT ?? 4173;

// ── MIME types ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain',
  '.xml':  'application/xml',
};

// ── ANSI helpers ──────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  cyan:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[1;31m',   // bold red for 5xx
  dim:    '\x1b[2m',
};

function statusColor(code) {
  if (code >= 500) return C.red;
  if (code >= 400) return C.yellow;
  if (code >= 300) return C.cyan;
  return C.green;
}

function log(req, status, ms) {
  const col   = statusColor(status);
  const ts    = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const ip    = req.headers['x-real-ip'] ?? req.socket.remoteAddress ?? '-';
  console.log(
    ` HTTP  ${C.dim}${ts}${C.reset} ${ip} ${req.method} ${req.url} → ${col}${status}${C.reset} ${C.dim}(${ms}ms)${C.reset}`
  );
}

// ── Request handler ───────────────────────────────────────────
function serve(req, res) {
  const start   = Date.now();
  const url     = req.url.split('?')[0];          // strip query string
  const decoded = decodeURIComponent(url);
  let   filePath = path.join(DIST, decoded);

  // Security: prevent path traversal
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403); res.end();
    log(req, 403, Date.now() - start);
    return;
  }

  // Try to stat the resolved path; fall back to index.html (SPA)
  function tryFile(fp, fallbackToSpa) {
    fs.stat(fp, (err, stat) => {
      if (!err && stat.isDirectory()) {
        return tryFile(path.join(fp, 'index.html'), fallbackToSpa);
      }
      if (err || !stat.isFile()) {
        if (fallbackToSpa) return tryFile(path.join(DIST, 'index.html'), false);
        res.writeHead(404); res.end('Not found');
        log(req, 404, Date.now() - start);
        return;
      }

      const ext  = path.extname(fp).toLowerCase();
      const mime = MIME[ext] ?? 'application/octet-stream';

      // Cache-control: immutable for hashed assets, no-cache for HTML
      const isHashed = /\.[a-f0-9]{8,}\.\w+$/.test(fp);
      const cc = isHashed
        ? 'public, max-age=31536000, immutable'
        : 'no-cache, must-revalidate';

      // ETag / conditional GET
      const etag = `"${stat.size}-${stat.mtimeMs}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        log(req, 304, Date.now() - start);
        return;
      }

      res.writeHead(200, {
        'Content-Type':  mime,
        'Content-Length': stat.size,
        'Cache-Control':  cc,
        'ETag':           etag,
      });

      if (req.method === 'HEAD') { res.end(); log(req, 200, Date.now() - start); return; }

      const stream = fs.createReadStream(fp);
      stream.on('error', () => { res.destroy(); });
      stream.pipe(res);
      res.on('finish', () => log(req, 200, Date.now() - start));
    });
  }

  tryFile(filePath, true);
}

// ── Start ─────────────────────────────────────────────────────
http.createServer(serve).listen(PORT, () => {
  console.log(`${C.green}✓ Frontend serving dist/ on port ${PORT}${C.reset}`);
});
