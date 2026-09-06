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
  // External HTTP trigger (src/main/triggerServer.ts) — off by default. A
  // loopback-only server that runs a snippet on `POST /run/:snippetId` when
  // the request carries the matching `token`, so e.g. a CI job or another
  // local script can kick off a snippet without opening the launcher.
  trigger: TriggerConfig;
}

export interface TriggerConfig {
  enabled: boolean;
  port: number; // 1024-65535
  token: string; // opaque, regenerable — required on every request
}
