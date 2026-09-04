// tray.ts — the system tray icon, its context menu, and the one-time
// first-run hint notification pointing new users at the hotkey/tray.
import { Tray, Menu, app, Notification, type NativeImage } from 'electron';
import { toggleWindow } from './window';
import { writeAppSettings } from './storage/app-settings';
import type { AppSettings } from '@shared/types';

let tray: Tray | null = null;

export function createTray(appIcon: NativeImage): Tray {
  tray = new Tray(appIcon);
  tray.setToolTip('Snippet Runner — Ctrl+Shift+Space to toggle');

  const menu = Menu.buildFromTemplate([
    { label: 'Show / Hide launcher', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Quit Snippet Runner',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleWindow);
  return tray;
}

/** Called by hotkey.ts whenever the active accelerator changes. */
export function setTrayTooltip(text: string): void {
  if (tray) tray.setToolTip(text);
}

/** Shows a one-time native notification pointing new users at the hotkey/tray, then never again. */
export function maybeShowTrayHint(appSettings: AppSettings, activeHotkeyLabel: string | null): void {
  if (appSettings.hasShownTrayHint) return;
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Snippet Runner is running',
        body: `Press ${activeHotkeyLabel || 'Ctrl+Shift+Space'} anytime to open it, or use the tray icon.`,
      }).show();
    }
  } catch (err) {
    console.error('Failed to show tray hint notification:', err);
  }
  writeAppSettings({ ...appSettings, hasShownTrayHint: true });
}
