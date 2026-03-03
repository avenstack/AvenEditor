import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApiApp, getApiConfig, registerApiErrorHandler } from './apiApp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, 'dist');

const runtime = getApiConfig(8787);

const start = async () => {
  const { app, config } = await createApiApp(runtime);
  const hasDist = await fs
    .stat(distDir)
    .then((stat) => stat.isDirectory())
    .catch(() => false);

  if (hasDist) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    console.warn('[aveneditor-api] dist folder not found, serving API only');
  }

  registerApiErrorHandler(app);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[aveneditor-api] listening on :${config.port}`);
    console.log(`[aveneditor-api] mode: ${hasDist ? 'fullstack (ui+api)' : 'api-only'}`);
    console.log(`[aveneditor-api] allowed root: ${config.allowedRoot || '(not restricted)'}`);
    console.log(`[aveneditor-api] session ttl: ${config.sessionTtlSeconds}s`);
  });
};

void start();
