// Augments Electron's `app` with the custom `isQuitting` flag this app sets
// itself (window.js's close handler, tray.js's Quit item, updater.js's
// quitAndInstall, index.js's before-quit handler) to distinguish "hide the
// window" from "actually exit" — see CLAUDE.md's window-setup section.
// electron.d.ts declares App inside the ambient `Electron` namespace and
// re-exports it from the 'electron' module via `export =` — augmenting
// `declare module 'electron' { interface App {} }` does NOT merge with it
// (that would create an unrelated, separate App type), so this augments the
// namespace directly instead.
declare namespace Electron {
  interface App {
    isQuitting?: boolean;
  }
}
