import { LazyStore } from '@tauri-apps/plugin-store';
import { isTauriRuntime } from './tauri-bridge';

export interface AppSettings {
  language: string;
  suggestedPrompts: boolean;
  autoApprove: boolean;
  sendUsage: boolean;
  appearance: "Light" | "Dark" | "System";
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'English (US)',
  suggestedPrompts: true,
  autoApprove: false,
  sendUsage: true,
  appearance: 'Light',
};

const STORE_FILE = 'settings.json';
const LOCAL_STORAGE_KEY = 'evo_desktop_settings';

let lazyStore: LazyStore | null = null;

function getStore(): LazyStore | null {
  if (typeof window === 'undefined' || !isTauriRuntime()) {
    return null;
  }
  if (!lazyStore) {
    lazyStore = new LazyStore(STORE_FILE, { autoSave: true });
  }
  return lazyStore;
}

export async function loadStoredSettings(): Promise<AppSettings> {
  const store = getStore();

  if (store) {
    try {
      const language = (await store.get<string>('language')) ?? DEFAULT_SETTINGS.language;
      const suggestedPrompts = (await store.get<boolean>('suggestedPrompts')) ?? DEFAULT_SETTINGS.suggestedPrompts;
      const autoApprove = (await store.get<boolean>('autoApprove')) ?? DEFAULT_SETTINGS.autoApprove;
      const sendUsage = (await store.get<boolean>('sendUsage')) ?? DEFAULT_SETTINGS.sendUsage;
      const appearance = (await store.get<AppSettings['appearance']>('appearance')) ?? DEFAULT_SETTINGS.appearance;

      return {
        language,
        suggestedPrompts,
        autoApprove,
        sendUsage,
        appearance,
      };
    } catch (err) {
      console.warn('Failed to read from tauri-plugin-store, using fallback:', err);
    }
  }

  // Fallback to localStorage for browser preview / SSR
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore localStorage read errors
  }

  return DEFAULT_SETTINGS;
}

export async function saveStoredSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  const store = getStore();

  if (store) {
    try {
      await store.set(key, value);
      await store.save();
      return;
    } catch (err) {
      console.warn(`Failed to save ${key} to tauri-plugin-store:`, err);
    }
  }

  // Fallback to localStorage
  try {
    const current = await loadStoredSettings();
    current[key] = value;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Ignore localStorage write errors
  }
}
