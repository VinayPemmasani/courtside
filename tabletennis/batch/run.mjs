// Usage: node batch/run.mjs manifest.json outDir
// manifest: [{player, hand, file, slowmo, sampleFps?, start?, end?, source, license}]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createServer } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
const [manifestPath, outDir] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const root = resolve(new URL('..', import.meta.url).pathname);
mkdirSync(join(root, 'public/clips'), { recursive: true });
const server = await createServer({ root, server: { port: 1420 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await page.goto('http://localhost:1420/batch.html');
await page.waitForFunction(() => window.batchReady, null, { timeout: 120000 });
mkdirSync(outDir, { recursive: true });
const results = [];
for (const c of manifest) {
  const name = basename(c.file);
  copyFileSync(c.file, join(root, 'public/clips', name));
  console.log('analysing', c.player, name);
  const r = await page.evaluate(([u, o]) => window.runClip(u, o), [`/clips/${encodeURIComponent(name)}`, { sampleFps: c.sampleFps ?? 30, slowmo: c.slowmo ?? 1, hand: c.hand, start: c.start, end: c.end }]);
  results.push({ player: c.player, hand: c.hand, clip: name, source: c.source, license: c.license, slowmo: c.slowmo ?? 1, ...r });
}
writeFileSync(join(outDir, 'raw-results.json'), JSON.stringify(results, null, 2));
await browser.close(); await server.close();
