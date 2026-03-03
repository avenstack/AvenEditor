import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Type, X } from 'lucide-react';

interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

const getSelectionRange = (name: string): [number, number] => {
  const extensionIndex = name.lastIndexOf('.');
  if (extensionIndex > 0) {
    return [0, extensionIndex];
  }
  return [0, name.length];
};

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  currentName,
  title = 'Rename File',
  message = 'Choose a clear, descriptive filename. Keep the extension if needed.',
  confirmLabel = 'Save Name',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmedName = name.trim();

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName(currentName);

    requestAnimationFrame(() => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.focus();
      const [start, end] = getSelectionRange(currentName);
      inputRef.current.setSelectionRange(start, end);
    });
  }, [isOpen, currentName]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  const handleConfirm = () => {
    if (!trimmedName) {
      return;
    }
    onConfirm(trimmedName);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-editor-surface border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-accent/10 text-accent">
                  <Type className="w-6 h-6" />
                </div>
                <button
                  onClick={onCancel}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">{message}</p>

              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleConfirm();
                  }
                }}
                className="w-full bg-editor-bg/70 border border-white/10 text-white rounded-2xl px-4 py-3 outline-none transition-all focus:border-accent/60 focus:ring-2 focus:ring-accent/20 placeholder:text-gray-500 mb-8"
                placeholder="Enter file name"
              />

              <div className="flex flex-col space-y-3">
                <button
                  onClick={handleConfirm}
                  disabled={!trimmedName}
                  className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] bg-accent text-editor-bg shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {confirmLabel}
                </button>
                <button
                  onClick={onCancel}
                  className="w-full py-4 rounded-2xl font-bold text-sm text-gray-400 hover:bg-white/5 transition-all"
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
