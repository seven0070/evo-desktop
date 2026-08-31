import { useState, useEffect } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export function UpdateNotification() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    async function checkForUpdates() {
      try {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const foundUpdate = await check();
          if (foundUpdate?.available) {
            setUpdate(foundUpdate);
          }
        }
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    }
    checkForUpdates();
  }, []);

  if (!update) return null;

  async function handleUpdate() {
    if (!update) return;
    setDownloading(true);
    let downloaded = 0;
    let contentLength = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setDownloadProgress(Math.round((downloaded / contentLength) * 100));
          }
        } else if (event.event === 'Finished') {
          setDownloading(false);
        }
      });

      await relaunch();
    } catch (error) {
      console.error('Update failed:', error);
      setDownloading(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 p-4 rounded-xl bg-slate-900/95 text-white shadow-2xl border border-slate-700/80 backdrop-blur-md flex items-center gap-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div>
        <p className="font-semibold text-sm">Update available (v{update.version})</p>
        <p className="text-xs text-slate-400">A new version of EVO Desktop is ready to install.</p>
        {downloading && (
          <div className="w-full bg-slate-700/80 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-200"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={handleUpdate}
        disabled={downloading}
        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium rounded-lg cursor-pointer transition shadow-sm"
      >
        {downloading ? `Updating (${downloadProgress}%)` : 'Update & Restart'}
      </button>
    </div>
  );
}
