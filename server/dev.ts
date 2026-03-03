import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createApiApp, getApiConfig, registerApiErrorHandler } from './apiApp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const enableDevHmr = (process.env.AVENEDITOR_DEV_HMR || 'false').toLowerCase() === 'true';

const runtime = getApiConfig(3000);

const start = async () => {
  const { app, config } = await createApiApp(runtime);

  const vite = await createViteServer({
    root: projectRoot,
    server: { middlewareMode: true, host: '0.0.0.0', hmr: enableDevHmr },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    try {
      if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ error: 'API route not found.' });
        return;
      }

      const url = req.originalUrl;
      const templatePath = path.resolve(projectRoot, 'index.html');
      let template = await fs.readFile(templatePath, 'utf8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });

  registerApiErrorHandler(app);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[aveneditor-dev] fullstack server listening on :${config.port}`);
    console.log(`[aveneditor-dev] UI + API share same origin`);
    console.log(`[aveneditor-dev] vite hmr: ${enableDevHmr ? 'enabled' : 'disabled'}`);
    console.log(`[aveneditor-dev] allowed root: ${config.allowedRoot || '(not restricted)'}`);
  });
};

void start();
