import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { KeyRound, Server, X } from 'lucide-react';
import { useEditorStore } from '../store';

interface ServerConnectDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const getDefaultApiBaseUrl = (): string =>
  typeof window !== 'undefined' ? window.location.origin : '';
const DEFAULT_WORKSPACE = '/workspace';

export const ServerConnectDialog: React.FC<ServerConnectDialogProps> = ({ isOpen, onClose }) => {
  const { remote, connectToServer, disconnectFromServer, refreshServerTree, clearRemoteError } = useEditorStore();
  const [apiBaseUrl, setApiBaseUrl] = useState(remote.apiBaseUrl || getDefaultApiBaseUrl());
  const [workspace, setWorkspace] = useState(remote.workspace || DEFAULT_WORKSPACE);
  const [key, setKey] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setApiBaseUrl(remote.apiBaseUrl || getDefaultApiBaseUrl());
    setWorkspace(remote.workspace || DEFAULT_WORKSPACE);
    setKey('');
    setLocalError(null);
  }, [isOpen, remote.apiBaseUrl, remote.workspace]);

  const handleConnect = async () => {
    if (!workspace.trim()) {
      setLocalError('Working directory is required.');
      return;
    }
    if (!key.trim()) {
      setLocalError('Access key is required.');
      return;
    }

    setConnecting(true);
    setLocalError(null);
    clearRemoteError();

    const result = await connectToServer(apiBaseUrl, workspace, key);
    setConnecting(false);
    if (result.ok) {
      onClose();
      return;
    }
    setLocalError(result.error || 'Failed to connect.');
  };

  const handleRefresh = async () => {
    setConnecting(true);
    setLocalError(null);
    await refreshServerTree();
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    await disconnectFromServer();
    setConnecting(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            className="relative w-full max-w-md bg-editor-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-accent/10 text-accent">
                  <Server className="w-6 h-6" />
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">Server Workspace</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-5">
                Connect to your deployed server with an access key, then edit files directly inside the selected
                working directory.
              </p>

              <div className="space-y-3 mb-4">
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-gray-500">API Base URL</span>
                  <input
                    type="text"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="Leave empty to use current origin"
                    className="mt-1 w-full bg-editor-bg/70 border border-white/10 text-white rounded-2xl px-4 py-3 outline-none transition-all focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                    disabled={connecting}
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-gray-500">Working Directory</span>
                  <input
                    type="text"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    placeholder="/srv/projects/my-repo"
                    className="mt-1 w-full bg-editor-bg/70 border border-white/10 text-white rounded-2xl px-4 py-3 outline-none transition-all focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                    disabled={connecting}
                  />
                </label>
                <label className="block">
                  <span className="text-xs uppercase tracking-wide text-gray-500">Access Key</span>
                  <div className="mt-1 relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="password"
                      value={key}
                      onChange={(e) => setKey(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-editor-bg/70 border border-white/10 text-white rounded-2xl pl-10 pr-4 py-3 outline-none transition-all focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
                      disabled={connecting}
                    />
                  </div>
                </label>
              </div>

              {(localError || remote.lastError) && (
                <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {localError || remote.lastError}
                </div>
              )}

              {remote.connected && (
                <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                  Connected: {remote.workspace}
                </div>
              )}

              <div className="flex flex-col space-y-3">
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] bg-accent text-editor-bg shadow-lg shadow-accent/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {connecting ? 'Connecting...' : remote.connected ? 'Reconnect' : 'Connect'}
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={connecting || !remote.connected}
                  className="w-full py-4 rounded-2xl font-bold text-sm text-gray-300 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Refresh Tree
                </button>
                <button
                  onClick={handleDisconnect}
                  disabled={connecting || !remote.connected}
                  className="w-full py-4 rounded-2xl font-bold text-sm text-red-300 hover:bg-red-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
