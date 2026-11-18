import fs from 'node:fs';
import path from 'node:path';
import { createBackendApp } from './server/createApp';

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const distDir = path.resolve('dist');
  const hasDist = fs.existsSync(path.join(distDir, 'index.html'));

  const { app } = createBackendApp({
    serveStatic: isProduction && hasDist,
    distDir,
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!hasDist) {
    console.warn('dist/index.html not found; serving API endpoints only.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.info(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'server_started',
        port: PORT,
        mode: isProduction ? 'production' : 'development',
      })
    );
  });
}

void startServer();
