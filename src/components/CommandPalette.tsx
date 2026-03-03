import React, { useState, useEffect } from 'react';
import { Search, FilePlus, Trash, Eye, Edit, Columns, X } from 'lucide-react';
import { useEditorStore } from '../store';
import { motion, AnimatePresence } from 'motion/react';

export const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { setViewMode, toggleZenMode, addFile, setActiveFile } = useEditorStore();
  const [query, setQuery] = useState('');

  const commands = [
    { id: 'new-md', label: 'New Markdown File', icon: FilePlus, action: () => addFile('New File.md') },
    { id: 'view-edit', label: 'Switch to Edit Mode', icon: Edit, action: () => setViewMode('edit') },
    { id: 'view-preview', label: 'Switch to Preview Mode', icon: Eye, action: () => setViewMode('preview') },
    { id: 'view-split', label: 'Switch to Split Mode', icon: Columns, action: () => setViewMode('split') },
    { id: 'toggle-zen', label: 'Toggle Zen Mode', icon: Search, action: () => toggleZenMode() },
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: -20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: -20 }}
        className="w-full max-w-lg bg-editor-surface rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-white/5">
          <Search className="w-5 h-5 text-gray-500 mr-3" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command..."
            className="flex-1 bg-transparent border-none outline-none text-white text-lg"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button onClick={onClose} className="p-1 hover:bg-white/5 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 no-scrollbar">
          {filtered.map(cmd => (
            <button
              key={cmd.id}
              onClick={() => { cmd.action(); onClose(); }}
              className="w-full flex items-center px-4 py-3 rounded-xl hover:bg-accent hover:text-editor-bg group transition-all text-left"
            >
              <cmd.icon className="w-5 h-5 mr-4 text-accent group-hover:text-editor-bg" />
              <span className="font-medium">{cmd.label}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-8 text-center text-gray-500">No commands found</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
