import { useState, useEffect } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Minus, Square, Copy, X } from 'lucide-react';
import { isTauriRuntime } from '@/lib/tauri-bridge';

export function CustomTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauri = isTauriRuntime();

  useEffect(() => {
    if (!isTauri) return;

    let unlistenResize: (() => void) | undefined;

    async function initWindowState() {
      try {
        const appWindow = getCurrentWebviewWindow();
        setIsMaximized(await appWindow.isMaximized());
        unlistenResize = await appWindow.onResized(async () => {
          setIsMaximized(await appWindow.isMaximized());
        });
      } catch (err) {
        console.error('Failed to listen to window resize:', err);
      }
    }

    initWindowState();

    return () => {
      if (unlistenResize) unlistenResize();
    };
  }, [isTauri]);

  const handleMinimize = async () => {
    if (!isTauri) return;
    try {
      await getCurrentWebviewWindow().minimize();
    } catch (err) {
      console.error('Minimize failed:', err);
    }
  };

  const handleToggleMaximize = async () => {
    if (!isTauri) return;
    try {
      const appWindow = getCurrentWebviewWindow();
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    } catch (err) {
      console.error('Toggle maximize failed:', err);
    }
  };

  const handleClose = async () => {
    if (!isTauri) return;
    try {
      // Closes to system tray
      await getCurrentWebviewWindow().hide();
    } catch (err) {
      console.error('Hide failed:', err);
    }
  };

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={handleToggleMaximize}
      className="h-10 w-full bg-slate-950 border-b border-slate-800/80 flex items-center justify-between px-3 select-none z-50 text-slate-300"
    >
      {/* App Branding & Status */}
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-[#FF3C00] shadow-[0_0_8px_#FF3C00]" />
        <span className="font-semibold text-xs tracking-wide text-slate-200">
          EVO Desktop
        </span>
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          v1.1.0
        </span>
      </div>

      {/* Center Drag Region */}
      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Window Control Buttons */}
      <div className="flex items-center -mr-3 h-full">
        <button
          onClick={handleMinimize}
          title="Minimize"
          className="h-full px-3.5 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleToggleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
          className="h-full px-3.5 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 rotate-180" />
          ) : (
            <Square className="w-3 h-3" />
          )}
        </button>

        <button
          onClick={handleClose}
          title="Close to Tray"
          className="h-full px-4 flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
