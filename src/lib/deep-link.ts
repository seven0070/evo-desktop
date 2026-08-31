import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isTauriRuntime } from './tauri-bridge';

export interface DeepLinkPayload {
  action: 'navigate' | 'prompt' | 'mission';
  tab?: 'chat' | 'missions' | 'trust' | 'settings';
  prompt?: string;
  missionId?: string;
}

export function parseDeepLink(rawUrl: string): DeepLinkPayload | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'evo:') return null;

    const host = url.hostname || url.pathname.replace(/^\/\//, '').split('/')[0];
    const params = url.searchParams;

    if (host === 'navigate' || host === 'tab') {
      const tab = params.get('tab') as DeepLinkPayload['tab'];
      return { action: 'navigate', tab };
    }

    if (host === 'prompt' || host === 'chat') {
      const prompt = params.get('query') || params.get('message') || params.get('prompt') || '';
      return { action: 'prompt', prompt };
    }

    if (host === 'mission') {
      const missionId = params.get('id') || params.get('mission_id') || '';
      return { action: 'mission', missionId };
    }

    return null;
  } catch (err) {
    console.error('Failed to parse deep link URL:', rawUrl, err);
    return null;
  }
}

export async function setupDeepLinks(
  onPayload: (payload: DeepLinkPayload) => void
): Promise<(() => void) | undefined> {
  if (!isTauriRuntime()) return undefined;

  async function focusWindow() {
    try {
      const win = getCurrentWebviewWindow();
      await win.show();
      await win.unminimize();
      await win.setFocus();
    } catch {
      // Ignore focus errors
    }
  }

  function handleUrls(urls: string[]) {
    for (const url of urls) {
      const payload = parseDeepLink(url);
      if (payload) {
        void focusWindow();
        onPayload(payload);
      }
    }
  }

  try {
    // Check initial launch URLs
    const initialUrls = await getCurrent();
    if (initialUrls && initialUrls.length > 0) {
      handleUrls(initialUrls);
    }

    // Listen for runtime deep-links
    const unlisten = await onOpenUrl((urls) => {
      handleUrls(urls);
    });

    return unlisten;
  } catch (err) {
    console.warn('Deep link initialization failed:', err);
    return undefined;
  }
}
