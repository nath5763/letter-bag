import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { validateOptions } from '../src/shared/engine.js';

const raw = Object.fromEntries(process.argv.slice(2).map(part => {
  const match = /^--(seed|seconds|rack|bag)=(.+)$/.exec(part);
  if (!match) throw Error(`Unknown argument: ${part}`);
  return [match[1], match[2]];
}));
const config = validateOptions(Object.fromEntries(['seconds', 'rack', 'bag'].filter(key => raw[key] !== undefined).map(key => [key, Number(raw[key])])));
const seed = raw.seed || `practice-${Date.now()}`;
const port = 4173;
const root = resolve('src');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };

http.createServer(async (req, res) => {
  try {
    if (req.url === '/practice-config.json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ seed, config }));
      return;
    }
    const pathname = new URL(req.url, `http://localhost:${port}`).pathname;
    if (pathname === '/') { res.writeHead(302, { Location: '/client/game.html' }); res.end(); return; }
    const relative = pathname;
    const path = resolve(root, `.${relative}`);
    if (!path.startsWith(root + '\\') && path !== root) throw Error('bad path');
    const data = await readFile(path);
    res.setHeader('Content-Type', types[extname(path)] || 'text/plain');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Practice: http://127.0.0.1:${port}/`);
  console.log(`Seed: ${seed} | ${config.seconds}s | ${config.rack} rack | ${config.bag} bag`);
});
