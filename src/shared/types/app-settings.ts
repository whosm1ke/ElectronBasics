// Mirrors DEFAULT_APP_SETTINGS in src/main/storage/app-settings.js. Not
// snippet data, not a renderer/localStorage UI preference (theme, density,
// etc. stay in localStorage) — small app-level state the main process owns.
export interface AppSettings {
  hotkey: string; // an Electron accelerator string, e.g. 'Control+Shift+Space'
  hasShownTrayHint: boolean;
}
