import type { FileType } from './store';

export interface SessionResponse {
  token: string;
  workspace: string;
  expiresAt: number;
  readOnly?: boolean;
}

export interface RemoteFileMeta {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
  type: FileType;
  contentHash: string;
}

export interface RemoteFolderMeta {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
}

export interface RemoteTreeResponse {
  files: RemoteFileMeta[];
  folders: RemoteFolderMeta[];
}

export interface RemoteFolderListResponse {
  files: RemoteFileMeta[];
  folders: RemoteFolderMeta[];
  parentId: string | null;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: unknown;
}

const trimBaseUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return window.location.origin;
  }
  return trimmed.replace(/\/+$/, '');
};

const buildUrl = (baseUrl: string, pathname: string, params?: Record<string, string>): string => {
  const root = trimBaseUrl(baseUrl);
  const url = new URL(pathname, `${root}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

const request = async <T>(
  baseUrl: string,
  pathname: string,
  options: RequestOptions,
  params?: Record<string, string>
): Promise<T> => {
  const response = await fetch(buildUrl(baseUrl, pathname, params), {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }
  return payload;
};

export const createSession = async (
  baseUrl: string,
  workspace: string,
  key: string
): Promise<SessionResponse> =>
  request<SessionResponse>(baseUrl, '/api/session', {
    method: 'POST',
    body: { workspace, key },
  });

export const closeSession = async (baseUrl: string, token: string): Promise<void> => {
  await request<{ ok: true }>(baseUrl, '/api/session', {
    method: 'DELETE',
    token,
  });
};

export const fetchTree = async (baseUrl: string, token: string): Promise<RemoteTreeResponse> =>
  request<RemoteTreeResponse>(baseUrl, '/api/fs/tree', {
    method: 'GET',
    token,
  });

export const fetchFolderEntries = async (
  baseUrl: string,
  token: string,
  parentId: string | null
): Promise<RemoteFolderListResponse> =>
  request<RemoteFolderListResponse>(
    baseUrl,
    '/api/fs/list',
    {
      method: 'GET',
      token,
    },
    parentId ? { parentId } : undefined
  );

export const fetchFileContent = async (
  baseUrl: string,
  token: string,
  id: string
): Promise<{ content: string; updatedAt: number; contentHash: string }> =>
  request<{ content: string; updatedAt: number; contentHash: string }>(
    baseUrl,
    '/api/fs/file',
    {
      method: 'GET',
      token,
    },
    { id }
  );

export const fetchFileBlob = async (baseUrl: string, token: string, id: string): Promise<Blob> => {
  const response = await fetch(buildUrl(baseUrl, '/api/fs/file/raw', { id }), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return response.blob();
};

export const writeFileContent = async (
  baseUrl: string,
  token: string,
  id: string,
  content: string
): Promise<{ updatedAt: number; contentHash: string }> => {
  return request<{ ok: true; updatedAt: number; contentHash: string }>(baseUrl, '/api/fs/file', {
    method: 'PUT',
    token,
    body: { id, content },
  });
};

export const createRemoteFile = async (
  baseUrl: string,
  token: string,
  name: string,
  parentId: string | null
): Promise<{ id: string }> =>
  request<{ id: string }>(baseUrl, '/api/fs/file', {
    method: 'POST',
    token,
    body: { name, parentId },
  });

export const createRemoteFolder = async (
  baseUrl: string,
  token: string,
  name: string,
  parentId: string | null
): Promise<{ id: string }> =>
  request<{ id: string }>(baseUrl, '/api/fs/folder', {
    method: 'POST',
    token,
    body: { name, parentId },
  });

export const deleteRemoteFile = async (baseUrl: string, token: string, id: string): Promise<void> => {
  await request<{ ok: true }>(
    baseUrl,
    '/api/fs/file',
    {
      method: 'DELETE',
      token,
    },
    { id }
  );
};

export const deleteRemoteFolder = async (baseUrl: string, token: string, id: string): Promise<void> => {
  await request<{ ok: true }>(
    baseUrl,
    '/api/fs/folder',
    {
      method: 'DELETE',
      token,
    },
    { id }
  );
};

export const renameRemoteFile = async (
  baseUrl: string,
  token: string,
  id: string,
  name: string
): Promise<{ id: string }> =>
  request<{ id: string }>(baseUrl, '/api/fs/file/rename', {
    method: 'PATCH',
    token,
    body: { id, name },
  });

export const renameRemoteFolder = async (
  baseUrl: string,
  token: string,
  id: string,
  name: string
): Promise<{ id: string }> =>
  request<{ id: string }>(baseUrl, '/api/fs/folder/rename', {
    method: 'PATCH',
    token,
    body: { id, name },
  });
