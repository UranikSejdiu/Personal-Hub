const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const files = new Map([
  ['/', [path.join(__dirname, 'index.html'), 'text/html; charset=utf-8']],
  ['/index.html', [path.join(__dirname, 'index.html'), 'text/html; charset=utf-8']],
  ['/styles.css', [path.join(__dirname, 'styles.css'), 'text/css; charset=utf-8']],
  ['/app.js', [path.join(__dirname, 'app.js'), 'text/javascript; charset=utf-8']],
]);
for (const name of ['Urbanist-Regular.ttf', 'Urbanist-Medium.ttf', 'Urbanist-SemiBold.ttf', 'Urbanist-Bold.ttf']) files.set(`/apps/tasks/assets/fonts/${name}`, [path.join(root, 'apps/tasks/assets/fonts', name), 'font/ttf']);
http.createServer((request, response) => {
  const file = files.get(new URL(request.url, 'http://localhost').pathname);
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file[0]).pipe(response);
}).listen(4183, '127.0.0.1', () => console.log('Tasks UI prototype: http://127.0.0.1:4183'));
