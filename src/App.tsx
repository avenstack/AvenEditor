import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from './store';
import { useShallow } from 'zustand/react/shallow';
import { FileList } from './components/FileList';
import { Editor, EditorHandle } from './components/Editor';
import { Preview } from './components/Preview';
import { Toolbar } from './components/Toolbar';
import { CommandPalette } from './components/CommandPalette';
import { CodeRunner } from './components/CodeRunner';
import { ConfirmDialog } from './components/ConfirmDialog';
import { RenameDialog } from './components/RenameDialog';
import { ServerConnectDialog } from './components/ServerConnectDialog';
import { 
  ChevronLeft, 
  MoreHorizontal, 
  Maximize2, 
  Minimize2, 
  Check, 
  Circle,
  AlertCircle,
  Eye,
  Edit3,
  Columns,
  Terminal,
  Download,
  Trash2,
  Type as TypeIcon,
  Server as ServerIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AutoSaveEventDetail = {
  fileId: string;
  savedAt: number;
};

export default function App() {
  const {
    files,
    activeFileId,
    setActiveFile,
    updateFileContent,
    deleteFile,
    renameFile,
    viewMode,
    setViewMode,
    isZenMode,
    toggleZenMode,
    remoteConnected,
    remoteToken,
    remoteReadOnly,
    remoteLastError,
    refreshServerTree,
    loadServerFileContent,
  } = useEditorStore(
    useShallow((state) => ({
      files: state.files,
      activeFileId: state.activeFileId,
      setActiveFile: state.setActiveFile,
      updateFileContent: state.updateFileContent,
      deleteFile: state.deleteFile,
      renameFile: state.renameFile,
      viewMode: state.viewMode,
      setViewMode: state.setViewMode,
      isZenMode: state.isZenMode,
      toggleZenMode: state.toggleZenMode,
      remoteConnected: state.remote.connected,
      remoteToken: state.remote.token,
      remoteReadOnly: state.remote.readOnly,
      remoteLastError: state.remote.lastError,
      refreshServerTree: state.refreshServerTree,
      loadServerFileContent: state.loadServerFileContent,
    }))
  );

  const [isSaving, setIsSaving] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showServerDialog, setShowServerDialog] = useState(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const editorRef = useRef<EditorHandle>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const activeFile = files.find(f => f.id === activeFileId);
  const isCodeFile = activeFile?.type !== 'markdown' && activeFile?.type !== 'json';

  const handleExport = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
    setShowMenu(false);
  };

  const handleDelete = () => {
    if (activeFileId) {
      deleteFile(activeFileId);
      setShowDeleteConfirm(false);
      setShowMenu(false);
    }
  };

  const handleRename = () => {
    setShowRenameDialog(true);
    setShowMenu(false);
  };

  const handleRenameConfirm = (newName: string) => {
    if (activeFileId && newName !== activeFile?.name) {
      renameFile(activeFileId, newName);
    }
    setShowRenameDialog(false);
  };

  // Auto-save feedback
  useEffect(() => {
    if (activeFile) {
      setIsSaving(true);
      const timer = setTimeout(() => setIsSaving(false), 800);
      if (showMenu) setShowMenu(false);
      return () => clearTimeout(timer);
    }
  }, [activeFile?.content]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!showMenu) return;

    const handleOutsidePress = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        menuTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setShowMenu(false);
    };

    document.addEventListener('mousedown', handleOutsidePress);
    document.addEventListener('touchstart', handleOutsidePress);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePress);
      document.removeEventListener('touchstart', handleOutsidePress);
    };
  }, [showMenu]);

  useEffect(() => {
    if (!remoteConnected || !remoteToken) {
      return;
    }
    if (files.length === 0) {
      void refreshServerTree(activeFileId);
      return;
    }
    if (activeFileId) {
      void loadServerFileContent(activeFileId);
    }
  }, [remoteConnected, remoteToken, files.length, activeFileId, refreshServerTree, loadServerFileContent]);

  useEffect(() => {
    let raf = 0;
    const handleAutoSave = (event: Event) => {
      if (!activeFileId) {
        return;
      }
      const detail = (event as CustomEvent<AutoSaveEventDetail>).detail;
      if (!detail || detail.fileId !== activeFileId) {
        return;
      }
      if (raf) {
        cancelAnimationFrame(raf);
      }
      raf = requestAnimationFrame(() => {
        editorRef.current?.restoreFocusAfterAutoSave(detail.savedAt);
      });
    };
    window.addEventListener('aveneditor:autosave', handleAutoSave as EventListener);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      window.removeEventListener('aveneditor:autosave', handleAutoSave as EventListener);
    };
  }, [activeFileId]);

  useEffect(() => {
    if (remoteReadOnly || !remoteLastError) {
      return;
    }
    setSyncToastMessage(remoteLastError);
    const timer = setTimeout(() => setSyncToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [remoteReadOnly, remoteLastError]);

  if (!activeFileId) {
    return (
      <>
        <FileList onOpenServerWorkspace={() => setShowServerDialog(true)} />
        <ServerConnectDialog
          isOpen={showServerDialog}
          onClose={() => setShowServerDialog(false)}
        />
        <AnimatePresence>
          {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
        </AnimatePresence>
      </>
    );
  }

  const handleInsert = (text: string) => {
    if (remoteReadOnly) {
      return;
    }
    if (editorRef.current) {
      editorRef.current.insertText(text);
    }
  };
  const hasSyncIssue = !remoteReadOnly && !!remoteLastError;

  return (
    <div className="h-screen flex flex-col bg-editor-bg text-gray-300">
      {/* Header */}
      <AnimatePresence>
        {!isZenMode && (
          <motion.header
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="h-14 flex items-center justify-between px-4 border-b border-white/5 z-20 bg-editor-bg/80 backdrop-blur-md"
          >
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setActiveFile(null)}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white truncate max-w-[120px]">
                  {activeFile?.name}
                </span>
                <div className="flex items-center space-x-1">
                  {hasSyncIssue ? (
                    <AlertCircle className="w-2.5 h-2.5 text-red-400" />
                  ) : remoteReadOnly ? (
                    <AlertCircle className="w-2.5 h-2.5 text-red-400" />
                  ) : isSaving ? (
                    <Circle className="w-2 h-2 text-accent animate-pulse fill-accent" />
                  ) : (
                    <Check className="w-2 h-2 text-green-500" />
                  )}
                  <span className={cn("text-[10px]", hasSyncIssue || remoteReadOnly ? "text-red-300" : "text-gray-500")}>
                    {hasSyncIssue ? 'Sync issue' : remoteReadOnly ? 'Read-only' : isSaving ? 'Saving...' : 'Saved'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center bg-editor-surface rounded-xl p-1">
              <button
                onClick={() => setViewMode('edit')}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  viewMode === 'edit' ? "bg-accent text-editor-bg" : "text-gray-500"
                )}
              >
                <Edit3 className="w-4 h-4" />
              </button>
              {(activeFile?.type === 'markdown' || isCodeFile) && (
                <button
                  onClick={() => setViewMode('split')}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === 'split' ? "bg-accent text-editor-bg" : "text-gray-500"
                  )}
                >
                  {isCodeFile ? <Terminal className="w-4 h-4" /> : <Columns className="w-4 h-4" />}
                </button>
              )}
              {activeFile?.type === 'markdown' && (
                <button
                  onClick={() => setViewMode('preview')}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === 'preview' ? "bg-accent text-editor-bg" : "text-gray-500"
                  )}
                >
                  <Eye className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-1 relative">
              {remoteConnected && (
                <span
                  className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                  title="Connected to server workspace"
                />
              )}
              <button 
                onClick={() => setShowCommandPalette(true)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-500"
              >
                <Terminal className="w-5 h-5" />
              </button>
              <button 
                onClick={toggleZenMode}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-500"
              >
                {isZenMode ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </button>
              <button 
                ref={menuTriggerRef}
                onClick={() => setShowMenu(!showMenu)}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  showMenu ? "bg-accent text-editor-bg" : "text-gray-500 hover:bg-white/5"
                )}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {/* Dropdown Menu */}
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-editor-surface border border-white/10 rounded-2xl shadow-2xl z-40 overflow-hidden"
                  >
                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => {
                          setShowServerDialog(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm transition-colors text-left"
                      >
                        <ServerIcon className="w-4 h-4 mr-3 text-gray-400" />
                        Server Workspace
                      </button>
                      <button
                        onClick={handleRename}
                        className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm transition-colors text-left"
                      >
                        <TypeIcon className="w-4 h-4 mr-3 text-gray-400" />
                        Rename
                      </button>
                      <button
                        onClick={handleExport}
                        className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm transition-colors text-left"
                      >
                        <Download className="w-4 h-4 mr-3 text-gray-400" />
                        Export File
                      </button>
                      <div className="h-px bg-white/5 mx-2 my-1" />
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(true);
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-500 text-sm transition-colors text-left"
                      >
                        <Trash2 className="w-4 h-4 mr-3" />
                        Delete File
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className={cn(
          "flex-1 flex min-h-0",
          viewMode === 'split' ? "flex-col" : "flex-row"
        )}>
          {/* Editor Area */}
          {(viewMode === 'edit' || viewMode === 'split') && (
            <div className={cn(
              "flex-1 min-h-0 min-w-0",
              viewMode === 'split' && "h-1/2 border-b border-white/5"
            )}>
              <Editor 
                ref={editorRef}
                content={activeFile?.content || ''} 
                type={activeFile?.type || 'markdown'}
                readOnly={remoteReadOnly}
                onChange={(val) => {
                  if (remoteReadOnly) {
                    return;
                  }
                  updateFileContent(activeFileId, val);
                }} 
              />
            </div>
          )}

          {/* Preview Area */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className={cn(
              "flex-1 min-h-0 min-w-0",
              viewMode === 'split' && "h-1/2"
            )}>
              {activeFile?.type === 'markdown' ? (
                <Preview content={activeFile?.content || ''} />
              ) : isCodeFile ? (
                <CodeRunner 
                  code={activeFile?.content || ''} 
                  type={activeFile?.type as any} 
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-600 italic">
                  No preview available for this file type
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zen Mode Toggle (Floating when UI hidden) */}
        {isZenMode && (
          <button 
            onClick={toggleZenMode}
            className="fixed top-4 right-4 p-3 bg-accent/10 hover:bg-accent/20 text-accent rounded-full backdrop-blur-md transition-all z-50"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        )}

        {/* Toolbar */}
        <AnimatePresence>
          {!isZenMode && viewMode !== 'preview' && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="z-20"
            >
              <Toolbar onInsert={handleInsert} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Command Palette Overlay */}
      <AnimatePresence>
        {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {syncToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="fixed left-1/2 -translate-x-1/2 bottom-20 z-[120] max-w-[92vw] bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 backdrop-blur-md shadow-lg shadow-red-500/10"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
              <span className="text-sm text-red-200">{syncToastMessage}</span>
              <button
                onClick={() => {
                  setShowServerDialog(true);
                  setSyncToastMessage(null);
                }}
                className="text-xs font-semibold text-red-200 hover:text-white transition-colors"
              >
                Reconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RenameDialog
        isOpen={showRenameDialog}
        currentName={activeFile?.name || ''}
        onConfirm={handleRenameConfirm}
        onCancel={() => setShowRenameDialog(false)}
      />
      <ServerConnectDialog
        isOpen={showServerDialog}
        onClose={() => setShowServerDialog(false)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete File"
        message={`Are you sure you want to delete "${activeFile?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isDanger={true}
      />
    </div>
  );
}
