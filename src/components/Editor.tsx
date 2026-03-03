import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import { useEditorStore, FileType } from '../store';

export interface EditorHandle {
  insertText: (text: string) => void;
  focus: () => void;
  restoreFocusAfterAutoSave: (savedAt: number) => boolean;
}

interface EditorProps {
  content: string;
  type: FileType;
  readOnly: boolean;
  onChange: (value: string) => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(({ content, type, readOnly, onChange }, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const suppressChangeRef = useRef(false);
  const lastBlurAtRef = useRef<number | null>(null);
  const lastPointerAtRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      if (readOnly) {
        return;
      }
      if (viewRef.current) {
        const { state, dispatch } = viewRef.current;
        const main = state.selection.main;
        dispatch({
          changes: { from: main.from, to: main.to, insert: text },
          selection: { anchor: main.from + text.length },
          scrollIntoView: true,
          userEvent: 'input.type',
        });
        viewRef.current.focus();
      }
    },
    focus: () => {
      viewRef.current?.focus();
    },
    restoreFocusAfterAutoSave: (savedAt: number) => {
      const view = viewRef.current;
      if (!view) return false;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && view.dom.contains(activeEl)) {
        return false;
      }
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable)
      ) {
        return false;
      }

      const lastBlurAt = lastBlurAtRef.current;
      if (!lastBlurAt || Math.abs(savedAt - lastBlurAt) > 900) {
        return false;
      }

      const lastPointerAt = lastPointerAtRef.current;
      const likelyIntentionalBlur = !!lastPointerAt && lastBlurAt - lastPointerAt < 220;
      if (likelyIntentionalBlur) {
        return false;
      }

      view.focus();
      return true;
    },
  }));

  useEffect(() => {
    const handlePointer = () => {
      lastPointerAtRef.current = Date.now();
    };
    window.addEventListener('mousedown', handlePointer, true);
    window.addEventListener('touchstart', handlePointer, true);
    return () => {
      window.removeEventListener('mousedown', handlePointer, true);
      window.removeEventListener('touchstart', handlePointer, true);
    };
  }, []);

  const getLanguageExtension = (type: FileType) => {
    switch (type) {
      case 'javascript':
      case 'typescript':
        return javascript({ typescript: type === 'typescript' });
      case 'html':
        return html();
      case 'css':
        return css();
      case 'json':
        return json();
      case 'python':
        return python();
      case 'yaml':
        return yaml();
      case 'markdown':
      default:
        return markdown({ base: markdownLanguage });
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        getLanguageExtension(type),
        ...(type === 'markdown' ? [EditorView.lineWrapping] : []),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !suppressChangeRef.current) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          blur: () => {
            lastBlurAtRef.current = Date.now();
            return false;
          },
          focus: () => {
            lastBlurAtRef.current = null;
            return false;
          },
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '16px' },
          '.cm-scroller': {
            overflowY: 'auto',
            overflowX: type === 'markdown' ? 'hidden' : 'auto',
          },
          '.cm-content': { padding: '20px 0' },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [type, readOnly]); // Re-init if language type or editable mode changes

  // Update content if it changes externally (e.g. file switch)
  useEffect(() => {
    if (viewRef.current && content !== viewRef.current.state.doc.toString()) {
      suppressChangeRef.current = true;
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: content },
      });
      suppressChangeRef.current = false;
    }
  }, [content]);

  return (
    <div 
      ref={editorRef} 
      className="h-full w-full min-w-0 overflow-hidden bg-editor-bg"
    />
  );
});
