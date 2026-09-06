// storage/app-settings.ts — small app-level preferences: the custom hotkey,
// the first-run tray-hint flag, and the launcher window's last resized size.
// Not snippet data, not a UI preference — its own tiny file.
import fs from 'node:fs';
import { APP_SETTINGS_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { AppSettings } from '@shared/types';

export const DEFAULT_APP_SETTINGS: AppSettings = { hotkey: 'Control+Shift+Space', hasShownTrayHint: false, windowSize: null };

export function readAppSettings(): AppSettings {
  if (!fs.existsSync(APP_SETTINGS_FILE)) return { ...DEFAULT_APP_SETTINGS };
  const parsed = readJsonFileSafe<Partial<AppSettings>>(APP_SETTINGS_FILE, {}, (v) => Boolean(v) && typeof v === 'object');
  return { ...DEFAULT_APP_SETTINGS, ...parsed };
}

export function writeAppSettings(settings: AppSettings): void {
  try {
    writeJsonFileAtomic(APP_SETTINGS_FILE, settings);
  } catch (err) {
    console.error('Failed to write app settings:', err);
  }
}
