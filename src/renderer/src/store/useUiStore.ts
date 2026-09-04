// useUiStore.ts — appearance/behavior preferences (all local to this
// device): theme, accent, density, blur, UI scale, sound, notifications,
// dev mode. Ported from modules/state.js's appearance fields +
// modules/settings-modal.js's handlers, which used to write both
// state.js *and* localStorage on every change — centralized here via a
// custom persist storage adapter that keeps the exact original individual
// localStorage keys (snippetRunner.theme, snippetRunner.accent, …) rather
// than one combined blob, so an existing install's saved preferences carry
// over untouched.
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';

interface UiState {
  theme: Theme;
  accentColor: string | null;
  density: Density;
  blur: number;
  uiScale: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  devModeEnabled: boolean;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: string | null) => void;
  setDensity: (density: Density) => void;
  setBlur: (blur: number) => void;
  setUiScale: (scale: number) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDevModeEnabled: (enabled: boolean) => void;
}

const KEYS = {
  theme: 'snippetRunner.theme',
  accentColor: 'snippetRunner.accent',
  density: 'snippetRunner.density',
  blur: 'snippetRunner.blur',
  uiScale: 'snippetRunner.scale',
  soundEnabled: 'snippetRunner.sound',
  notificationsEnabled: 'snippetRunner.notifications',
  devModeEnabled: 'snippetRunner.devMode',
} as const;

type PersistedFields = Pick<UiState, keyof typeof KEYS>;

/** Reads/writes the original individual localStorage keys instead of zustand persist's usual single combined-blob key. */
const legacyKeyStorage: PersistStorage<PersistedFields> = {
  getItem: () => {
    const state: PersistedFields = {
      theme: (localStorage.getItem(KEYS.theme) as Theme) || 'system',
      accentColor: localStorage.getItem(KEYS.accentColor) || null,
      density: (localStorage.getItem(KEYS.density) as Density) || 'comfortable',
      blur: Number(localStorage.getItem(KEYS.blur) ?? 28),
      uiScale: Number(localStorage.getItem(KEYS.uiScale) ?? 100),
      soundEnabled: localStorage.getItem(KEYS.soundEnabled) === '1',
      notificationsEnabled: localStorage.getItem(KEYS.notificationsEnabled) === '1',
      devModeEnabled: localStorage.getItem(KEYS.devModeEnabled) === '1',
    };
    return { state, version: 0 };
  },
  setItem: (_name, value) => {
    const s = value.state;
    localStorage.setItem(KEYS.theme, s.theme);
    if (s.accentColor) localStorage.setItem(KEYS.accentColor, s.accentColor);
    else localStorage.removeItem(KEYS.accentColor);
    localStorage.setItem(KEYS.density, s.density);
    localStorage.setItem(KEYS.blur, String(s.blur));
    localStorage.setItem(KEYS.uiScale, String(s.uiScale));
    localStorage.setItem(KEYS.soundEnabled, s.soundEnabled ? '1' : '0');
    localStorage.setItem(KEYS.notificationsEnabled, s.notificationsEnabled ? '1' : '0');
    localStorage.setItem(KEYS.devModeEnabled, s.devModeEnabled ? '1' : '0');
  },
  removeItem: () => {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      accentColor: null,
      density: 'comfortable',
      blur: 28,
      uiScale: 100,
      soundEnabled: false,
      notificationsEnabled: false,
      devModeEnabled: false,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setDensity: (density) => set({ density }),
      setBlur: (blur) => set({ blur }),
      setUiScale: (uiScale) => set({ uiScale }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setDevModeEnabled: (devModeEnabled) => set({ devModeEnabled }),
    }),
    {
      name: 'snippetRunner.ui', // unused by legacyKeyStorage, but required by persist's API
      storage: legacyKeyStorage,
      partialize: (s): PersistedFields => ({
        theme: s.theme,
        accentColor: s.accentColor,
        density: s.density,
        blur: s.blur,
        uiScale: s.uiScale,
        soundEnabled: s.soundEnabled,
        notificationsEnabled: s.notificationsEnabled,
        devModeEnabled: s.devModeEnabled,
      }),
    }
  )
);
