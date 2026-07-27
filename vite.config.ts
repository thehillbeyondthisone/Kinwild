import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only capture endpoint: POST a base64 image body to /__shot?name=foo
 * and it lands in .shots/foo.jpg. Lets tooling grab WebGL frames without
 * relying on window compositing.
 */
function shotPlugin(): Plugin {
  return {
    name: 'shot-endpoint',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w-]/g, '');
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          const dir = path.resolve('.shots');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, name + '.jpg'), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [shotPlugin()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
