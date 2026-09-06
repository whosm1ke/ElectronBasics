// Mirrors DEFAULT_APP_SETTINGS in src/main/storage/app-settings.js. Not
// snippet data, not a renderer/localStorage UI preference (theme, density,
// etc. stay in localStorage) — small app-level state the main process owns.
export interface AppSettings {
  hotkey: string; // an Electron accelerator string, e.g. 'Control+Shift+Space'
  hasShownTrayHint: boolean;
  // The launcher window's last user-resized size — null until the user ever
  // resizes it (window.ts then falls back to WINDOW_WIDTH/HEIGHT). Only
  // width/height are kept, not position — the window re-centers itself on
  // every show (see window.ts's showWindow()), which is intentional
  // launcher behavior independent of resizing.
  windowSize: { width: number; height: number } | null;
}
