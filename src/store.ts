import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  closeSession,
  createRemoteFile,
  createRemoteFolder,
  createSession,
  deleteRemoteFile,
  deleteRemoteFolder,
  fetchFolderEntries,
  fetchFileContent,
  renameRemoteFile,
  renameRemoteFolder,
  writeFileContent,
} from './serverApi';

export type FileType =
  | 'markdown'
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'json'
  | 'python'
  | 'yaml';

export interface FileItem {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
  type: FileType;
  parentId: string | null;
  contentHash?: string;
  isLoaded?: boolean;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  updatedAt: number;
}

export interface RemoteState {
  connected: boolean;
  apiBaseUrl: string;
  workspace: string;
  token: string | null;
  expiresAt: number | null;
  readOnly: boolean;
  lastError: string | null;
  isListing: boolean;
  listingParentId: string | null;
}

interface RemoteCacheEntry {
  content: string;
  updatedAt: number;
  contentHash?: string;
}

interface EditorStore {
  files: FileItem[];
  folders: FolderItem[];
  activeFileId: string | null;
  currentFolderId: string | null;
  viewMode: 'edit' | 'split' | 'preview';
  isZenMode: boolean;
  remote: RemoteState;
  remoteFileCache: Record<string, RemoteCacheEntry>;
  pendingRemoteWrites: Record<string, true>;

  addFile: (name: string, parentId?: string | null) => void;
  deleteFile: (id: string) => void;
  updateFileContent: (id: string, content: string) => void;
  renameFile: (id: string, name: string) => void;

  addFolder: (name: string, parentId?: string | null) => void;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;

  setActiveFile: (id: string | null) => void;
  setCurrentFolder: (id: string | null) => void;
  setViewMode: (mode: 'edit' | 'split' | 'preview') => void;
  toggleZenMode: () => void;

  connectToServer: (apiBaseUrl: string, workspace: string, key: string) => Promise<{ ok: boolean; error?: string }>;
  disconnectFromServer: () => Promise<void>;
  refreshServerTree: (preferredActiveFileId?: string | null) => Promise<void>;
  loadServerFolderEntries: (parentId: string | null, preferredActiveFileId?: string | null) => Promise<void>;
  loadServerFileContent: (id: string) => Promise<void>;
  clearRemoteError: () => void;
}

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
const isReadOnlyError = (message: string): boolean =>
  message.toLowerCase().includes('read-only mode is enabled');
const isValidSessionExpiry = (expiresAt: number | null): expiresAt is number =>
  typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > Date.now();

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearSaveTimer = (id: string): void => {
  const timer = saveTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    saveTimers.delete(id);
  }
};

const scheduleRemoteSave = (id: string, run: () => Promise<void>): void => {
  clearSaveTimer(id);
  const timer = setTimeout(() => {
    void run().finally(() => saveTimers.delete(id));
  }, 600);
  saveTimers.set(id, timer);
};

const initialWelcomeFile: FileItem = {
  id: 'welcome',
  name: 'Welcome.md',
  content:
    '# Welcome to AvenEditor\n\nThis is a mobile-first editor designed for speed and focus.\n\n## Features\n- **Fast** cold start\n- **Auto-save** always\n- **Zen Mode** for focus\n- **Markdown** support\n\nTry swiping or using the toolbar below!',
  updatedAt: Date.now(),
  type: 'markdown',
  parentId: null,
  isLoaded: true,
};

const isDescendantPath = (id: string, parentId: string): boolean => id === parentId || id.startsWith(`${parentId}/`);
let folderListingRequestId = 0;
const makeRemoteCacheKey = (workspace: string, id: string): string => `${workspace}::${id}`;
const removeWorkspaceCacheByPath = (
  cache: Record<string, RemoteCacheEntry>,
  workspace: string,
  pathId: string
): Record<string, RemoteCacheEntry> => {
  const prefix = `${workspace}::`;
  const nextCache = { ...cache };
  for (const key of Object.keys(nextCache)) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    const id = key.slice(prefix.length);
    if (isDescendantPath(id, pathId)) {
      delete nextCache[key];
    }
  }
  return nextCache;
};

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      files: [initialWelcomeFile],
      folders: [],
      activeFileId: initialWelcomeFile.id,
      currentFolderId: null,
      viewMode: 'edit',
      isZenMode: false,
      remoteFileCache: {},
      pendingRemoteWrites: {},
      remote: {
        connected: false,
        apiBaseUrl: '',
        workspace: '',
        token: null,
        expiresAt: null,
        readOnly: false,
        lastError: null,
        isListing: false,
        listingParentId: null,
      },

      addFile: (name, parentId) => {
        const state = get();
        if (state.remote.connected && state.remote.token) {
          void (async () => {
            try {
              const targetParent = parentId !== undefined ? parentId : null;
              const created = await createRemoteFile(
                state.remote.apiBaseUrl,
                state.remote.token!,
                name,
                targetParent
              );
              await get().loadServerFolderEntries(targetParent, created.id);
            } catch (error) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  lastError: (error as Error).message,
                },
              }));
            }
          })();
          return;
        }

        const type = getFileType(name);
        const newFile: FileItem = {
          id: Math.random().toString(36).substring(7),
          name,
          content: '',
          updatedAt: Date.now(),
          type,
          parentId: parentId !== undefined ? parentId : null,
          isLoaded: true,
        };
        set((prev) => ({
          files: [newFile, ...prev.files],
          activeFileId: newFile.id,
        }));
      },

      deleteFile: (id) => {
        const state = get();
        clearSaveTimer(id);
        if (state.remote.connected && state.remote.token) {
          void (async () => {
            try {
              const targetFile = state.files.find((f) => f.id === id);
              const targetParent = targetFile?.parentId ?? state.currentFolderId ?? null;
              await deleteRemoteFile(state.remote.apiBaseUrl, state.remote.token!, id);
              const cacheKey = makeRemoteCacheKey(state.remote.workspace, id);
              set((prev) => {
                const nextCache = { ...prev.remoteFileCache };
                delete nextCache[cacheKey];
                return { remoteFileCache: nextCache };
              });
              await get().loadServerFolderEntries(targetParent);
              if (state.activeFileId === id) {
                set({ activeFileId: null });
              }
            } catch (error) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  lastError: (error as Error).message,
                },
              }));
            }
          })();
          return;
        }

        set((prev) => ({
          files: prev.files.filter((f) => f.id !== id),
          activeFileId: prev.activeFileId === id ? null : prev.activeFileId,
        }));
      },

      updateFileContent: (id, content) => {
        const remoteState = get().remote;
        set((prev) => ({
          files: prev.files.map((f) =>
            f.id === id
              ? {
                  ...f,
                  content,
                  updatedAt: remoteState.connected ? f.updatedAt : Date.now(),
                  isLoaded: true,
                }
              : f
          ),
          remoteFileCache:
            remoteState.connected && remoteState.workspace
              ? {
                  ...prev.remoteFileCache,
                  [makeRemoteCacheKey(remoteState.workspace, id)]: {
                    content,
                    updatedAt: Date.now(),
                    contentHash: undefined,
                  },
                }
              : prev.remoteFileCache,
          pendingRemoteWrites:
            remoteState.connected && remoteState.workspace
              ? {
                  ...prev.pendingRemoteWrites,
                  [makeRemoteCacheKey(remoteState.workspace, id)]: true,
                }
              : prev.pendingRemoteWrites,
        }));

        const state = get();
        if (!(state.remote.connected && state.remote.token)) {
          return;
        }

        scheduleRemoteSave(id, async () => {
          const latest = get().files.find((file) => file.id === id);
          const remoteNow = get().remote;
          if (!latest || !(remoteNow.connected && remoteNow.token)) {
            return;
          }

          try {
            const saved = await writeFileContent(remoteNow.apiBaseUrl, remoteNow.token, id, latest.content);
            const savedAt = Date.now();
            const cacheKey = makeRemoteCacheKey(remoteNow.workspace, id);
            set((prev) => {
              const nextPending = { ...prev.pendingRemoteWrites };
              delete nextPending[cacheKey];
              return {
                remoteFileCache: {
                  ...prev.remoteFileCache,
                  [cacheKey]: {
                    content: latest.content,
                    updatedAt: saved.updatedAt,
                    contentHash: saved.contentHash,
                  },
                },
                pendingRemoteWrites: nextPending,
                remote: {
                  ...prev.remote,
                  readOnly: false,
                },
              };
            });
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('aveneditor:autosave', {
                  detail: { fileId: id, savedAt },
                })
              );
            }
          } catch (error) {
            const message = (error as Error).message;
            if (message.toLowerCase().includes('unauthorized') || message.includes('401')) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  connected: false,
                  token: null,
                  expiresAt: null,
                  lastError: 'Session expired. Auto-save paused. Please reconnect.',
                  isListing: false,
                  listingParentId: null,
                },
              }));
              return;
            }
            if (isReadOnlyError(message)) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  readOnly: true,
                  lastError: null,
                },
              }));
              return;
            }
            set((prev) => ({
              remote: {
                ...prev.remote,
                lastError: message,
              },
            }));
          }
        });
      },

      renameFile: (id, name) => {
        const state = get();
        if (state.remote.connected && state.remote.token) {
          void (async () => {
            try {
              const targetFile = state.files.find((f) => f.id === id);
              const targetParent = targetFile?.parentId ?? state.currentFolderId ?? null;
              const renamed = await renameRemoteFile(state.remote.apiBaseUrl, state.remote.token!, id, name);
              const oldKey = makeRemoteCacheKey(state.remote.workspace, id);
              const newKey = makeRemoteCacheKey(state.remote.workspace, renamed.id);
              set((prev) => {
                const nextCache = { ...prev.remoteFileCache };
                const existing = nextCache[oldKey];
                delete nextCache[oldKey];
                if (existing) {
                  nextCache[newKey] = existing;
                }
                return { remoteFileCache: nextCache };
              });
              await get().loadServerFolderEntries(targetParent, renamed.id);
            } catch (error) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  lastError: (error as Error).message,
                },
              }));
            }
          })();
          return;
        }

        const type = getFileType(name);
        set((prev) => ({
          files: prev.files.map((f) => (f.id === id ? { ...f, name, type, updatedAt: Date.now() } : f)),
        }));
      },

      addFolder: (name, parentId) => {
        const state = get();
        if (state.remote.connected && state.remote.token) {
          void (async () => {
            try {
              const targetParent = parentId !== undefined ? parentId : null;
              await createRemoteFolder(
                state.remote.apiBaseUrl,
                state.remote.token!,
                name,
                targetParent
              );
              await get().loadServerFolderEntries(targetParent);
            } catch (error) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  lastError: (error as Error).message,
                },
              }));
            }
          })();
          return;
        }

        const newFolder: FolderItem = {
          id: Math.random().toString(36).substring(7),
          name,
          parentId: parentId !== undefined ? parentId : null,
          updatedAt: Date.now(),
        };
        set((prev) => ({
          folders: [newFolder, ...prev.folders],
        }));
      },

      deleteFolder: (id) => {
        const state = get();
        if (state.remote.connected && state.remote.token) {
          void (async () => {
            try {
              const targetFolder = state.folders.find((f) => f.id === id);
              const targetParent = targetFolder?.parentId ?? null;
              await deleteRemoteFolder(state.remote.apiBaseUrl, state.remote.token!, id);
              set((prev) => ({
                files: prev.files.filter((file) => !isDescendantPath(file.id, id)),
                folders: prev.folders.filter((folder) => !isDescendantPath(folder.id, id)),
                remoteFileCache: removeWorkspaceCacheByPath(prev.remoteFileCache, state.remote.workspace, id),
                currentFolderId:
                  prev.currentFolderId && isDescendantPath(prev.currentFolderId, id)
                    ? targetParent
                    : prev.currentFolderId,
                activeFileId:
                  prev.activeFileId && isDescendantPath(prev.activeFileId, id)
                    ? null
                    : prev.activeFileId,
              }));
              await get().loadServerFolderEntries(targetParent);
            } catch (error) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  lastError: (error as Error).message,
                },
              }));
            }
          })();
          return;
        }

        set((prev) => ({
          folders: prev.folders.filter((f) => f.id !== id),
          files: prev.files.filter((f) => f.parentId !== id),
        }));
      },

      renameFolder: (id, name) => {
        const state = get();
        if (state.remote.connected && state.remote.token) {
          void (async () => {
            try {
              const targetFolder = state.folders.find((f) => f.id === id);
              const targetParent = targetFolder?.parentId ?? null;
              await renameRemoteFolder(state.remote.apiBaseUrl, state.remote.token!, id, name);
              set((prev) => ({
                files: prev.files.filter((file) => !isDescendantPath(file.id, id)),
                folders: prev.folders.filter((folder) => !isDescendantPath(folder.id, id)),
                remoteFileCache: removeWorkspaceCacheByPath(prev.remoteFileCache, state.remote.workspace, id),
                currentFolderId:
                  prev.currentFolderId && isDescendantPath(prev.currentFolderId, id)
                    ? targetParent
                    : prev.currentFolderId,
                activeFileId:
                  prev.activeFileId && isDescendantPath(prev.activeFileId, id)
                    ? null
                    : prev.activeFileId,
              }));
              await get().loadServerFolderEntries(targetParent);
            } catch (error) {
              set((prev) => ({
                remote: {
                  ...prev.remote,
                  lastError: (error as Error).message,
                },
              }));
            }
          })();
          return;
        }

        set((prev) => ({
          folders: prev.folders.map((f) => (f.id === id ? { ...f, name, updatedAt: Date.now() } : f)),
        }));
      },

      setActiveFile: (id) => {
        set({ activeFileId: id });
        if (!id) {
          return;
        }
        void get().loadServerFileContent(id);
      },

      setCurrentFolder: (id) => {
        set({ currentFolderId: id });
        const state = get();
        if (state.remote.connected && state.remote.token) {
          void get().loadServerFolderEntries(id);
        }
      },
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleZenMode: () => set((prev) => ({ isZenMode: !prev.isZenMode })),

      connectToServer: async (apiBaseUrl, workspace, key) => {
        try {
          const session = await createSession(apiBaseUrl, workspace, key);
          const sessionReadOnly = !!session.readOnly;
          set((prev) => ({
            files: [],
            folders: [],
            activeFileId: null,
            currentFolderId: null,
            remoteFileCache: {},
            pendingRemoteWrites: {},
            remote: {
              ...prev.remote,
              connected: true,
              apiBaseUrl: apiBaseUrl.trim(),
              workspace: session.workspace,
              token: session.token,
              expiresAt: session.expiresAt,
              readOnly: sessionReadOnly,
              lastError: null,
              isListing: false,
              listingParentId: null,
            },
          }));
          await get().loadServerFolderEntries(null);
          const syncError = get().remote.lastError;
          if (syncError) {
            return { ok: false, error: syncError };
          }
          return { ok: true };
        } catch (error) {
          set((prev) => ({
            remote: {
              ...prev.remote,
              connected: false,
              token: null,
              expiresAt: null,
              readOnly: false,
              lastError: (error as Error).message,
              isListing: false,
              listingParentId: null,
            },
          }));
          return { ok: false, error: (error as Error).message };
        }
      },

      disconnectFromServer: async () => {
        const state = get();
        for (const key of Array.from(saveTimers.keys())) {
          clearSaveTimer(key);
        }
        if (state.remote.connected && state.remote.token) {
          try {
            await closeSession(state.remote.apiBaseUrl, state.remote.token);
          } catch {
            // Ignore network/session close failures during disconnect.
          }
        }
        set((prev) => ({
          remote: {
            ...prev.remote,
            connected: false,
            token: null,
            expiresAt: null,
            readOnly: false,
            lastError: null,
            isListing: false,
            listingParentId: null,
          },
          remoteFileCache: prev.remoteFileCache,
          pendingRemoteWrites: {},
        }));
      },

      refreshServerTree: async (preferredActiveFileId) => {
        const currentParent = get().currentFolderId ?? null;
        await get().loadServerFolderEntries(currentParent, preferredActiveFileId);
      },

      loadServerFolderEntries: async (parentId, preferredActiveFileId) => {
        const state = get();
        if (!(state.remote.connected && state.remote.token)) {
          return;
        }
        const workspace = state.remote.workspace;
        const requestId = ++folderListingRequestId;
        set((prev) => ({
          remote: {
            ...prev.remote,
            isListing: true,
            listingParentId: parentId,
          },
        }));
        try {
          const listing = await fetchFolderEntries(state.remote.apiBaseUrl, state.remote.token, parentId);
          if (requestId !== folderListingRequestId) {
            return;
          }
          const latestCache = get().remoteFileCache;
          const pendingWrites = get().pendingRemoteWrites;
          const files: FileItem[] = listing.files.map((file) => {
            const cacheKey = makeRemoteCacheKey(workspace, file.id);
            const cache = latestCache[cacheKey];
            const hasPendingWrite = !!pendingWrites[cacheKey];
            const cacheHit = !!cache && !!cache.contentHash && cache.contentHash === file.contentHash;
            return {
              ...file,
              content: hasPendingWrite ? cache?.content ?? '' : cacheHit ? cache.content : '',
              isLoaded: hasPendingWrite || cacheHit,
            };
          });

          const nextActive = preferredActiveFileId
            ? files.some((file) => file.id === preferredActiveFileId)
              ? preferredActiveFileId
              : null
            : null;

          set((prev) => ({
            files: [
              ...prev.files.filter((file) => file.parentId !== listing.parentId),
              ...files,
            ],
            folders: [
              ...prev.folders.filter((folder) => folder.parentId !== listing.parentId),
              ...listing.folders,
            ],
            activeFileId: parentId === prev.currentFolderId ? nextActive : prev.activeFileId,
            currentFolderId: prev.currentFolderId,
            remote: {
              ...prev.remote,
              lastError: null,
              isListing: false,
              listingParentId: null,
            },
          }));

          if (nextActive) {
            await get().loadServerFileContent(nextActive);
          }
        } catch (error) {
          if (requestId !== folderListingRequestId) {
            return;
          }
          const message = (error as Error).message;
          if (message.toLowerCase().includes('unauthorized')) {
            set((prev) => ({
              remote: {
                ...prev.remote,
                connected: false,
                token: null,
                expiresAt: null,
                lastError: 'Session expired. Please reconnect in Server Workspace.',
                isListing: false,
                listingParentId: null,
              },
            }));
            return;
          }
          set((prev) => ({
            remote: {
              ...prev.remote,
              lastError: message,
              isListing: false,
              listingParentId: null,
            },
          }));
        }
      },

      loadServerFileContent: async (id) => {
        const state = get();
        if (!(state.remote.connected && state.remote.token)) {
          return;
        }
        const target = state.files.find((file) => file.id === id);
        if (!target) {
          return;
        }
        const cacheKey = makeRemoteCacheKey(state.remote.workspace, id);
        const cache = state.remoteFileCache[cacheKey];
        const hasPendingWrite = !!state.pendingRemoteWrites[cacheKey];
        if (hasPendingWrite) {
          return;
        }
        const cacheStillValid =
          !!cache && !!cache.contentHash && !!target.contentHash && cache.contentHash === target.contentHash;
        if (target.isLoaded && cacheStillValid) {
          return;
        }
        try {
          const remoteFile = await fetchFileContent(state.remote.apiBaseUrl, state.remote.token, id);
          set((prev) => ({
            files: prev.files.map((file) =>
              file.id === id
                ? {
                    ...file,
                    content: remoteFile.content,
                    updatedAt: remoteFile.updatedAt,
                    contentHash: remoteFile.contentHash,
                    isLoaded: true,
                  }
                : file
            ),
            remoteFileCache: {
              ...prev.remoteFileCache,
              [cacheKey]: {
                content: remoteFile.content,
                updatedAt: remoteFile.updatedAt,
                contentHash: remoteFile.contentHash,
              },
            },
            remote: {
              ...prev.remote,
              lastError: null,
            },
          }));
        } catch (error) {
          const message = (error as Error).message;
          if (message.toLowerCase().includes('unauthorized')) {
            set((prev) => ({
              remote: {
                ...prev.remote,
                connected: false,
                token: null,
                expiresAt: null,
                lastError: 'Session expired. Please reconnect in Server Workspace.',
                isListing: false,
                listingParentId: null,
              },
            }));
            return;
          }
          set((prev) => ({
            remote: {
              ...prev.remote,
              lastError: message,
            },
          }));
        }
      },

      clearRemoteError: () =>
        set((prev) => ({
          remote: {
            ...prev.remote,
            lastError: null,
          },
        })),
    }),
    {
      name: 'aven-editor-storage',
      partialize: (state) => {
        const canReuseSession =
          !!state.remote.token &&
          state.remote.connected &&
          isValidSessionExpiry(state.remote.expiresAt);
        return {
          files: state.files,
          folders: state.folders,
          activeFileId: state.activeFileId,
          currentFolderId: state.currentFolderId,
          viewMode: state.viewMode,
          isZenMode: state.isZenMode,
          remoteFileCache: state.remoteFileCache,
          remote: {
            ...state.remote,
            connected: canReuseSession,
            token: canReuseSession ? state.remote.token : null,
            expiresAt: canReuseSession ? state.remote.expiresAt : null,
            isListing: false,
            listingParentId: null,
            lastError: null,
          },
        };
      },
    }
  )
);
