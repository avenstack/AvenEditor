import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { IgnoreMatcher, createIgnoreMatcher } from './ignore.js';

type FileType = 'markdown' | 'javascript' | 'typescript' | 'html' | 'css' | 'json' | 'python' | 'yaml';

interface SessionData {
  workspace: string;
  expiresAt: number;
}

interface FileMeta {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
  type: FileType;
  contentHash: string;
}

interface FolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
}

const compareByName = <T extends { name: string }>(left: T, right: T): number =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true });

interface AuthenticatedRequest extends express.Request {
  session: SessionData;
  token: string;
}

export interface ApiConfig {
  port: number;
  accessKey: string;
  allowOrigin: string;
  allowedRoot: string | null;
  sessionTtlMs: number;
  maxTreeEntries: number;
  maxFileSizeBytes: number;
  ignoreFile: string | undefined;
  ignoredDirsEnv: string;
  historyEnabled: boolean;
  historyDir: string;
  readOnly: boolean;
}

const envValue = (name: string): string | undefined => process.env[`AVENEDITOR_${name}`];

export const getApiConfig = (defaultPort: number): ApiConfig => ({
  port: Number(process.env.PORT || defaultPort),
  accessKey: envValue('ACCESS_KEY') || '',
  allowOrigin: envValue('ALLOW_ORIGIN') || '*',
  allowedRoot: envValue('WORKSPACE_ROOT')
    ? path.resolve(envValue('WORKSPACE_ROOT')!)
    : null,
  sessionTtlMs: Number(envValue('SESSION_TTL_MS') || 8 * 60 * 60 * 1000),
  maxTreeEntries: Number(envValue('MAX_TREE_ENTRIES') || 5000),
  maxFileSizeBytes: Number(envValue('MAX_FILE_SIZE_BYTES') || 1024 * 1024),
  ignoreFile: envValue('IGNORE_FILE'),
  ignoredDirsEnv: envValue('IGNORE_DIRS') || 'node_modules,.git,dist',
  historyEnabled: (envValue('HISTORY_ENABLED') || 'true').toLowerCase() === 'true',
  historyDir: envValue('HISTORY_DIR') || '.history',
  readOnly: (envValue('READ_ONLY') || 'true').toLowerCase() === 'true',
});

const normalizeId = (id: string): string => id.replace(/\\/g, '/').replace(/^\/+/, '').trim();

const parentIdOf = (id: string): string | null => {
  const normalized = normalizeId(id);
  const slash = normalized.lastIndexOf('/');
  if (slash <= -1) {
    return null;
  }
  return normalized.slice(0, slash);
};

const toId = (workspace: string, absolutePath: string): string =>
  path.relative(workspace, absolutePath).split(path.sep).join('/');

const getFileType = (name: string): FileType => {
  if (name.endsWith('.js')) return 'javascript';
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'typescript';
  if (name.endsWith('.html')) return 'html';
  if (name.endsWith('.css')) return 'css';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.py')) return 'python';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
  return 'markdown';
};

const isSafeName = (name: string): boolean =>
  !!name && name !== '.' && name !== '..' && !/[\\/]/.test(name) && !/\0/.test(name);

const secureCompare = (received: string, expected: string): boolean => {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

const ensureDirectory = async (dirPath: string): Promise<void> => {
  const stat = await fs.stat(dirPath);
  if (!stat.isDirectory()) {
    throw new Error('Workspace must be a directory.');
  }
};

const resolveWorkspace = async (workspaceInput: string, allowedRoot: string | null): Promise<string> => {
  const workspace = path.resolve(workspaceInput);
  if (allowedRoot) {
    const rel = path.relative(allowedRoot, workspace);
    const outsideRoot = rel.startsWith('..') || path.isAbsolute(rel);
    if (outsideRoot) {
      throw new Error('Workspace is outside allowed root.');
    }
  }
  await ensureDirectory(workspace);
  return workspace;
};

const resolveEntryPath = (workspace: string, id: string): string => {
  const normalized = normalizeId(id);
  if (!normalized) {
    throw new Error('Invalid path id.');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment.length === 0)) {
    throw new Error('Path traversal is not allowed.');
  }
  const absolute = path.resolve(workspace, normalized);
  const rel = path.relative(workspace, absolute);
  const outsideWorkspace = rel.startsWith('..') || path.isAbsolute(rel);
  if (outsideWorkspace) {
    throw new Error('Path is outside workspace.');
  }
  return absolute;
};

const createToken = (): string => crypto.randomBytes(32).toString('hex');
const hashText = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const hashFileBytes = async (absolutePath: string): Promise<string> => {
  const data = await fs.readFile(absolutePath);
  return crypto.createHash('sha256').update(data).digest('hex');
};
const hashForLargeFile = (mtimeMs: number, size: number): string => hashText(`meta:${mtimeMs}:${size}`);

interface TextDiffPatch {
  start: number;
  removed: string;
  added: string;
}

const buildTextDiffPatch = (before: string, after: string): TextDiffPatch | null => {
  if (before === after) {
    return null;
  }
  let start = 0;
  const beforeLen = before.length;
  const afterLen = after.length;
  while (start < beforeLen && start < afterLen && before[start] === after[start]) {
    start += 1;
  }

  let beforeEnd = beforeLen - 1;
  let afterEnd = afterLen - 1;
  while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    start,
    removed: before.slice(start, beforeEnd + 1),
    added: after.slice(start, afterEnd + 1),
  };
};

const writeHistoryDiff = async (
  workspace: string,
  historyDir: string,
  fileId: string,
  before: string,
  after: string
): Promise<void> => {
  const patch = buildTextDiffPatch(before, after);
  if (!patch) {
    return;
  }

  const normalizedFileId = fileId.replace(/\\/g, '/');
  const normalizedHistoryDir = historyDir.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalizedFileId.startsWith(`${normalizedHistoryDir}/`) || normalizedFileId === normalizedHistoryDir) {
    return;
  }

  const fileSegments = normalizedFileId.split('/');
  const filename = fileSegments.pop() || 'unknown';
  const historyFolder = path.join(workspace, historyDir, ...fileSegments, `${filename}.history`);
  await fs.mkdir(historyFolder, { recursive: true });

  const now = Date.now();
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-');
  const recordPath = path.join(historyFolder, `${stamp}-${crypto.randomBytes(3).toString('hex')}.json`);
  const payload = {
    fileId: normalizedFileId,
    savedAt: now,
    beforeHash: hashText(before),
    afterHash: hashText(after),
    patch,
  };
  await fs.writeFile(recordPath, JSON.stringify(payload), 'utf8');
};

export const createApiApp = async (config: ApiConfig) => {
  const app = express();
  const sessions = new Map<string, SessionData>();

  // Create ignore matcher on startup
  const ignoreMatcher = await createIgnoreMatcher(config.ignoreFile, config.ignoredDirsEnv);

  const getSessionFromAuthHeader = (authorization?: string): { token: string; session: SessionData } | null => {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return null;
    }
    const token = authorization.slice('Bearer '.length).trim();
    const session = sessions.get(token);
    if (!session) {
      return null;
    }
    if (Date.now() > session.expiresAt) {
      sessions.delete(token);
      return null;
    }
    return { token, session };
  };

  const authMiddleware: express.RequestHandler = (req, res, next) => {
    const auth = getSessionFromAuthHeader(req.header('authorization'));
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    (req as AuthenticatedRequest).token = auth.token;
    (req as AuthenticatedRequest).session = auth.session;
    next();
  };

  const readOnlyMiddleware: express.RequestHandler = (req, res, next) => {
    if (config.readOnly) {
      res.status(403).json({ error: 'Read-only mode is enabled. Write operations are not allowed.' });
      return;
    }
    next();
  };

  const buildTree = async (workspace: string): Promise<{ files: FileMeta[]; folders: FolderMeta[] }> => {
    const files: FileMeta[] = [];
    const folders: FolderMeta[] = [];
    let seen = 0;

    const walk = async (currentDir: string, relativeDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue;
        }

        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

        // Check if this path should be ignored
        if (ignoreMatcher.matches(relativePath, entry.isDirectory())) {
          continue;
        }

        seen += 1;
        if (seen > config.maxTreeEntries) {
          throw new Error(`Workspace has too many entries (>${config.maxTreeEntries}).`);
        }

        const absolute = path.join(currentDir, entry.name);
        const stat = await fs.stat(absolute);
        const id = toId(workspace, absolute);

      if (entry.isDirectory()) {
        folders.push({
          id,
          name: entry.name,
          parentId: parentIdOf(id),
          updatedAt: stat.mtimeMs,
        });
        await walk(absolute, relativePath);
      } else if (entry.isFile()) {
        const hash =
          stat.size > config.maxFileSizeBytes
            ? hashForLargeFile(stat.mtimeMs, stat.size)
            : await hashFileBytes(absolute);
        files.push({
          id,
          name: entry.name,
          parentId: parentIdOf(id),
          updatedAt: stat.mtimeMs,
          type: getFileType(entry.name),
          contentHash: hash,
        });
      }
      }
    };

    await walk(workspace, '');
    files.sort(compareByName);
    folders.sort(compareByName);
    return { files, folders };
  };

  const listDirectory = async (
    workspace: string,
    parentId: string | null
  ): Promise<{ files: FileMeta[]; folders: FolderMeta[]; parentId: string | null }> => {
    const targetDir = parentId ? resolveEntryPath(workspace, parentId) : workspace;
    await ensureDirectory(targetDir);

    const entries = await fs.readdir(targetDir, { withFileTypes: true });
    if (entries.length > config.maxTreeEntries) {
      throw new Error(`Current directory has too many entries (>${config.maxTreeEntries}).`);
    }

    const files: FileMeta[] = [];
    const folders: FolderMeta[] = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const absolute = path.join(targetDir, entry.name);
      const id = toId(workspace, absolute);

      // Check if this path should be ignored
      if (ignoreMatcher.matches(id, entry.isDirectory())) {
        continue;
      }

      const stat = await fs.stat(absolute);

      if (entry.isDirectory()) {
        folders.push({
          id,
          name: entry.name,
          parentId,
          updatedAt: stat.mtimeMs,
        });
        continue;
      }
      if (entry.isFile()) {
        const hash =
          stat.size > config.maxFileSizeBytes
            ? hashForLargeFile(stat.mtimeMs, stat.size)
            : await hashFileBytes(absolute);
        files.push({
          id,
          name: entry.name,
          parentId,
          updatedAt: stat.mtimeMs,
          type: getFileType(entry.name),
          contentHash: hash,
        });
      }
    }

    files.sort(compareByName);
    folders.sort(compareByName);
    return { files, folders, parentId };
  };

  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, now: Date.now() });
  });

  app.post('/api/session', async (req, res) => {
    try {
      const workspace = String(req.body?.workspace || '').trim();
      const key = String(req.body?.key || '');
      if (!workspace || !key) {
        res.status(400).json({ error: 'workspace and key are required.' });
        return;
      }
      if (!config.accessKey) {
        res.status(500).json({ error: 'Server access key is not configured.' });
        return;
      }
      if (!secureCompare(key, config.accessKey)) {
        res.status(401).json({ error: 'Invalid key.' });
        return;
      }

      const resolvedWorkspace = await resolveWorkspace(workspace, config.allowedRoot);
      const token = createToken();
      sessions.set(token, {
        workspace: resolvedWorkspace,
        expiresAt: Date.now() + config.sessionTtlMs,
      });

      res.json({
        token,
        workspace: resolvedWorkspace,
        expiresAt: Date.now() + config.sessionTtlMs,
        readOnly: config.readOnly,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/session', authMiddleware, (req, res) => {
    const typed = req as AuthenticatedRequest;
    sessions.delete(typed.token);
    res.json({ ok: true });
  });

  app.get('/api/fs/tree', authMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const tree = await buildTree(typed.session.workspace);
      res.json(tree);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/fs/list', authMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const rawParent = req.query.parentId;
      const parentId = rawParent ? normalizeId(String(rawParent)) : null;
      const result = await listDirectory(typed.session.workspace, parentId);
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get('/api/fs/file', authMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const id = String(req.query.id || '');
      const absolute = resolveEntryPath(typed.session.workspace, id);
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) {
        res.status(400).json({ error: 'Path is not a file.' });
        return;
      }
      if (stat.size > config.maxFileSizeBytes) {
        res.status(413).json({ error: `File too large (>${config.maxFileSizeBytes} bytes).` });
        return;
      }
      const content = await fs.readFile(absolute, 'utf8');
      const hash = hashText(content);
      res.json({ content, updatedAt: stat.mtimeMs, contentHash: hash });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.put('/api/fs/file', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const id = String(req.body?.id || '');
      const content = String(req.body?.content ?? '');
      const absolute = resolveEntryPath(typed.session.workspace, id);
      const previousContent = await fs.readFile(absolute, 'utf8').catch(() => '');
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, content, 'utf8');
      if (config.historyEnabled) {
        await writeHistoryDiff(typed.session.workspace, config.historyDir, id, previousContent, content);
      }
      const stat = await fs.stat(absolute);
      res.json({ ok: true, updatedAt: stat.mtimeMs, contentHash: hashText(content) });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post('/api/fs/file', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const parentId = req.body?.parentId ? normalizeId(String(req.body.parentId)) : null;
      const name = String(req.body?.name || '').trim();
      const content = String(req.body?.content ?? '');

      if (!isSafeName(name)) {
        res.status(400).json({ error: 'Invalid file name.' });
        return;
      }

      const parentAbsolute = parentId
        ? resolveEntryPath(typed.session.workspace, parentId)
        : typed.session.workspace;
      await ensureDirectory(parentAbsolute);

      const absolute = path.join(parentAbsolute, name);
      const id = toId(typed.session.workspace, absolute);
      const existing = await fs
        .stat(absolute)
        .then(() => true)
        .catch(() => false);
      if (existing) {
        res.status(409).json({ error: 'File already exists.' });
        return;
      }

    await fs.writeFile(absolute, content, 'utf8');
    const stat = await fs.stat(absolute);
    res.json({
      id,
      name,
      parentId: parentIdOf(id),
      updatedAt: stat.mtimeMs,
      type: getFileType(name),
      contentHash: hashText(content),
    });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/fs/file/rename', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const id = String(req.body?.id || '');
      const name = String(req.body?.name || '').trim();
      if (!isSafeName(name)) {
        res.status(400).json({ error: 'Invalid file name.' });
        return;
      }

      const currentAbsolute = resolveEntryPath(typed.session.workspace, id);
      const stat = await fs.stat(currentAbsolute);
      if (!stat.isFile()) {
        res.status(400).json({ error: 'Path is not a file.' });
        return;
      }

      const nextAbsolute = path.join(path.dirname(currentAbsolute), name);
      const nextId = toId(typed.session.workspace, nextAbsolute);
      await fs.rename(currentAbsolute, nextAbsolute);
      res.json({ ok: true, id: nextId, name });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/fs/file', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const id = String(req.query.id || '');
      const absolute = resolveEntryPath(typed.session.workspace, id);
      const stat = await fs.stat(absolute);
      if (!stat.isFile()) {
        res.status(400).json({ error: 'Path is not a file.' });
        return;
      }
      await fs.rm(absolute);
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post('/api/fs/folder', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const parentId = req.body?.parentId ? normalizeId(String(req.body.parentId)) : null;
      const name = String(req.body?.name || '').trim();
      if (!isSafeName(name)) {
        res.status(400).json({ error: 'Invalid folder name.' });
        return;
      }

      const parentAbsolute = parentId
        ? resolveEntryPath(typed.session.workspace, parentId)
        : typed.session.workspace;
      await ensureDirectory(parentAbsolute);

      const absolute = path.join(parentAbsolute, name);
      const id = toId(typed.session.workspace, absolute);
      await fs.mkdir(absolute, { recursive: false });
      const stat = await fs.stat(absolute);
      res.json({
        id,
        name,
        parentId: parentIdOf(id),
        updatedAt: stat.mtimeMs,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/fs/folder/rename', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const id = String(req.body?.id || '');
      const name = String(req.body?.name || '').trim();
      if (!isSafeName(name)) {
        res.status(400).json({ error: 'Invalid folder name.' });
        return;
      }

      const currentAbsolute = resolveEntryPath(typed.session.workspace, id);
      const stat = await fs.stat(currentAbsolute);
      if (!stat.isDirectory()) {
        res.status(400).json({ error: 'Path is not a folder.' });
        return;
      }

      const nextAbsolute = path.join(path.dirname(currentAbsolute), name);
      const nextId = toId(typed.session.workspace, nextAbsolute);
      await fs.rename(currentAbsolute, nextAbsolute);
      res.json({ ok: true, id: nextId, name });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/fs/folder', authMiddleware, readOnlyMiddleware, async (req, res) => {
    try {
      const typed = req as AuthenticatedRequest;
      const id = String(req.query.id || '');
      const absolute = resolveEntryPath(typed.session.workspace, id);
      const stat = await fs.stat(absolute);
      if (!stat.isDirectory()) {
        res.status(400).json({ error: 'Path is not a folder.' });
        return;
      }
      await fs.rm(absolute, { recursive: true, force: false });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt <= now) {
        sessions.delete(token);
      }
    }
  }, 60 * 1000).unref();

  return { app, config };
};

export const registerApiErrorHandler = (app: express.Express): void => {
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message || 'Unexpected server error.' });
  });
};
