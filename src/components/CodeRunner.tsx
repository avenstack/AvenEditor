import React, { useEffect, useState } from 'react';
import { Play, Terminal as TerminalIcon, XCircle, Trash2 } from 'lucide-react';

interface CodeRunnerProps {
  code: string;
  type: 'javascript' | 'typescript' | 'html' | 'python';
}

export const CodeRunner: React.FC<CodeRunnerProps> = ({ code, type }) => {
  const [logs, setLogs] = useState<{ type: string; content: string }[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [srcDoc, setSrcDoc] = useState('');
  const [runKey, setRunKey] = useState(0);

  const runCode = async () => {
    setLogs([]);

    if (type === 'python') {
      setIsInitializing(true);
      setLogs([{ type: 'info', content: 'Loading Python runtime (Pyodide)...' }]);
    }

    // Create a sandbox script that overrides console.log
    const script = `
      <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"></script>
      <script>
        const originalLog = console.log;
        const sendToParent = (type, content) => {
          window.parent.postMessage({
            type: 'CONSOLE_LOG',
            logType: type,
            content: typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content)
          }, '*');
        };

        console.log = (...args) => {
          originalLog(...args);
          sendToParent('log', args.join(' '));
        };
        console.error = (...args) => sendToParent('error', args.join(' '));

        window.onerror = (msg) => sendToParent('error', msg);

        async function run() {
          try {
            if ("${type}" === "python") {
              let pyodide = await loadPyodide({
                stdout: (text) => sendToParent('log', text),
                stderr: (text) => sendToParent('error', text),
              });
              window.parent.postMessage({ type: 'PYODIDE_READY' }, '*');
              await pyodide.runPythonAsync(\`${code.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
            } else if ("${type}" === "html") {
              // HTML already injected
            } else {
              ${code}
            }
          } catch (e) {
            console.error(e.message);
          }
        }
        
        if ("${type}" !== "html") run();
      </script>
    `;

    const content = type === 'html' ? code + script : `<html><body>${script}</body></html>`;
    setSrcDoc(content);
    setRunKey(prev => prev + 1);
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CONSOLE_LOG') {
        setLogs(prev => [...prev, { type: event.data.logType, content: event.data.content }]);
      } else if (event.data?.type === 'PYODIDE_READY') {
        setIsInitializing(false);
        setLogs(prev => prev.filter(l => l.type !== 'info'));
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="h-full flex flex-col bg-editor-bg border-t border-white/5">
      <div className="flex items-center justify-between px-4 py-2 bg-editor-surface/50 border-b border-white/5">
        <div className="flex items-center space-x-2 text-xs font-medium text-gray-400">
          <TerminalIcon className="w-3 h-3" />
          <span>CONSOLE</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setLogs([])}
            className="p-1.5 hover:bg-white/5 rounded-lg text-gray-500 transition-colors"
            title="Clear console"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={runCode}
            className="flex items-center space-x-2 px-3 py-1 bg-accent text-editor-bg rounded-lg text-xs font-bold active:scale-95 transition-all"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>RUN</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1 no-scrollbar">
        {logs.map((log, i) => (
          <div key={i} className={cn(
            "flex items-start space-x-2 py-1 border-b border-white/5 last:border-0",
            log.type === 'error' ? "text-red-400" : log.type === 'warn' ? "text-yellow-400" : "text-gray-300"
          )}>
            <span className="opacity-50 select-none">[{i + 1}]</span>
            <span className="whitespace-pre-wrap break-all">{log.content}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-gray-600 italic text-center py-8">
            Click RUN to execute code
          </div>
        )}
      </div>

      {/* Hidden sandbox iframe */}
      <iframe 
        key={runKey}
        srcDoc={srcDoc}
        className="hidden" 
        sandbox="allow-scripts" 
      />
    </div>
  );
};

// Helper for App.tsx to use cn
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
