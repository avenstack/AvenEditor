import React, { useState } from 'react';
import { useEditorStore, FileItem, FolderItem } from '../store';
import { 
  Plus, 
  FileText, 
  Trash2, 
  Edit2, 
  Search, 
  Clock, 
  Folder, 
  ChevronLeft, 
  FolderPlus,
  Server
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmDialog } from './ConfirmDialog';

interface FileListProps {
  onOpenServerWorkspace?: () => void;
}

export const FileList: React.FC<FileListProps> = ({ onOpenServerWorkspace }) => {
  const { 
    files, 
    folders, 
    currentFolderId, 
    remote,
    setActiveFile, 
    setCurrentFolder, 
    addFile, 
    deleteFile, 
    renameFile,
    addFolder,
    deleteFolder,
    renameFolder
  } = useEditorStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);

  // Filter items based on current folder and search query
  const currentFiles = files.filter(f => f.parentId === currentFolderId);
  const currentFolders = folders.filter(f => f.parentId === currentFolderId);

  const sortByName = <T extends { name: string }>(left: T, right: T) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true });

  const filteredFiles = currentFiles.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort(sortByName);
  const filteredFolders = currentFolders.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort(sortByName);
  const isCurrentFolderLoading =
    remote.connected && remote.isListing && remote.listingParentId === currentFolderId;

  const handleCreateFile = () => {
    const name = `Untitled-${files.length + 1}.md`;
    addFile(name, currentFolderId);
  };

  const handleCreateFolder = () => {
    const name = `New Folder ${folders.length + 1}`;
    addFolder(name, currentFolderId);
  };

  const startRenameFile = (file: FileItem) => {
    setEditingId(file.id);
    setEditName(file.name);
    setIsRenamingFolder(false);
  };

  const startRenameFolder = (folder: FolderItem) => {
    setEditingId(folder.id);
    setEditName(folder.name);
    setIsRenamingFolder(true);
  };

  const submitRename = (id: string) => {
    if (editName.trim()) {
      if (isRenamingFolder) {
        renameFolder(id, editName.trim());
      } else {
        renameFile(id, editName.trim());
      }
    }
    setEditingId(null);
  };

  const currentFolder = folders.find(f => f.id === currentFolderId);

  return (
    <div className="flex flex-col h-screen min-h-0 bg-editor-bg">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            {currentFolderId && (
              <button 
                onClick={() => setCurrentFolder(currentFolder?.parentId || null)}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-3xl font-bold text-white tracking-tight">
              {currentFolder ? currentFolder.name : 'Files'}
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenServerWorkspace && (
              <button
                onClick={onOpenServerWorkspace}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
                title="Server Workspace"
              >
                <Server className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={handleCreateFolder}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search files and folders..."
            className="w-full bg-editor-surface border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-1 focus:ring-accent transition-all outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 no-scrollbar">
        <div className="space-y-2 pb-24">
          <AnimatePresence mode="popLayout">
            {/* Folders */}
            {filteredFolders.map((folder) => (
              <motion.div
                key={folder.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative flex items-center bg-editor-surface/40 hover:bg-editor-surface rounded-2xl p-4 transition-all cursor-pointer border border-transparent hover:border-white/5"
                onClick={() => editingId !== folder.id && setCurrentFolder(folder.id)}
              >
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center mr-4">
                  <Folder className="w-5 h-5 text-yellow-500" />
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === folder.id && isRenamingFolder ? (
                    <input
                      autoFocus
                      className="bg-transparent border-b border-accent text-white outline-none w-full"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => submitRename(folder.id)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename(folder.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 className="text-white font-medium truncate">{folder.name}</h3>
                  )}
                  <div className="flex items-center text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDistanceToNow(folder.updatedAt)} ago
                  </div>
                </div>

                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenameFolder(folder);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: folder.id, name: folder.name, type: 'folder' });
                    }}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Files */}
            {filteredFiles.map((file) => (
              <motion.div
                key={file.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative flex items-center bg-editor-surface/40 hover:bg-editor-surface rounded-2xl p-4 transition-all cursor-pointer border border-transparent hover:border-white/5"
                onClick={() => editingId !== file.id && setActiveFile(file.id)}
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mr-4">
                  <FileText className="w-5 h-5 text-accent" />
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === file.id && !isRenamingFolder ? (
                    <input
                      autoFocus
                      className="bg-transparent border-b border-accent text-white outline-none w-full"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => submitRename(file.id)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename(file.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <h3 className="text-white font-medium truncate">{file.name}</h3>
                  )}
                  <div className="flex items-center text-xs text-gray-500 mt-1">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDistanceToNow(file.updatedAt)} ago
                  </div>
                </div>

                <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRenameFile(file);
                    }}
                    className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: file.id, name: file.name, type: 'file' });
                    }}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isCurrentFolderLoading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl p-4 bg-editor-surface/40 border border-white/5 animate-pulse"
                >
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-xl bg-white/10 mr-4" />
                    <div className="flex-1">
                      <div className="h-4 w-2/3 bg-white/10 rounded mb-2" />
                      <div className="h-3 w-1/3 bg-white/10 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isCurrentFolderLoading && filteredFiles.length === 0 && filteredFolders.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No items found
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={handleCreateFile}
        className="fixed bottom-8 right-8 w-14 h-14 bg-accent text-editor-bg rounded-2xl shadow-lg shadow-accent/20 flex items-center justify-center active:scale-95 transition-transform z-10"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title={`Delete ${deleteConfirm?.type === 'folder' ? 'Folder' : 'File'}`}
        message={
          deleteConfirm?.type === 'folder' 
            ? `Are you sure you want to delete the folder "${deleteConfirm.name}" and all its contents? This action cannot be undone.`
            : `Are you sure you want to delete the file "${deleteConfirm?.name}"?`
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteConfirm) {
            if (deleteConfirm.type === 'folder') {
              deleteFolder(deleteConfirm.id);
            } else {
              deleteFile(deleteConfirm.id);
            }
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
        isDanger={true}
      />
    </div>
  );
};
