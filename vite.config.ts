import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = resolve(__dirname, 'schemaGraph.json');

function schemaMiddleware() {
  return async (req: any, res: any, next: any) => {
    if (req.url !== '/schemaGraph.json') return next();

    if (req.method === 'GET') {
      try {
        const content = await fs.readFile(schemaPath, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.end(content);
      } catch (error) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'schemaGraph.json not found', details: (error as Error).message }));
      }
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await new Promise<string>((resolveBody, rejectBody) => {
          let data = '';
          req.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });
          req.on('end', () => resolveBody(data));
          req.on('error', rejectBody);
        });

        JSON.parse(body);
        await fs.writeFile(schemaPath, body, 'utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (error) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Failed to write schemaGraph.json', details: (error as Error).message }));
      }
      return;
    }

    res.statusCode = 405;
    res.end();
  };
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'schema-file-handler',
      configureServer(server) {
        server.middlewares.use(schemaMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(schemaMiddleware());
      },
    },
  ],
});
