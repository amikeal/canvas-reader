import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Adds a strict CSP to the built single-file app. The inlined bundle is allowed by
 * hash (no 'unsafe-inline' for scripts), and connect-src 'none' makes "your file is
 * never uploaded" a browser-enforced property rather than a promise.
 * Build-only: Vite's dev server injects its own client script.
 */
function contentSecurityPolicy(): Plugin {
  let outFile = '';
  return {
    name: 'canvas-reader-csp',
    apply: 'build',
    configResolved(config) {
      outFile = resolve(config.root, config.build.outDir, 'index.html');
    },
    // closeBundle runs after vite-plugin-singlefile has inlined the bundle, so the
    // hash covers the final inline script.
    closeBundle() {
      let html = readFileSync(outFile, 'utf8');
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter((m) => m[1]!.length > 0)
        .map((m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`);
      if (!hashes.length) throw new Error('CSP: no inline script found to hash');
      const csp = [
        "default-src 'none'",
        `script-src ${hashes.join(' ')}`,
        "style-src 'unsafe-inline'",
        'img-src blob: data: https:',
        'media-src blob: https:',
        'frame-src blob: https:',
        'worker-src blob:',
        "connect-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
      ].join('; ');
      if (!html.includes('<meta charset="utf-8" />')) throw new Error('CSP: charset meta not found');
      html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      writeFileSync(outFile, html);
    },
  };
}

// The converter ships as ONE self-contained HTML file (dist/index.html) so it can be
// emailed, put on a USB stick, or opened from disk with no server.
export default defineConfig({
  plugins: [viteSingleFile(), contentSecurityPolicy()],
  // File-change events don't cross the container bind mount, so the dev server
  // would keep serving stale modules. scripts/ctr sets VITE_POLL=1.
  server: { watch: process.env.VITE_POLL === '1' ? { usePolling: true, interval: 300 } : undefined },
  build: {
    target: 'es2022',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
