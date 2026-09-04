// storage/app-settings.ts — small app-level preferences: the custom hotkey
// and the first-run tray-hint flag. Not snippet data, not a UI preference —
// its own tiny file.
import fs from 'node:fs';
import path from 'node:path';
import { APP_SETTINGS_FILE } from '../paths';
import { readJsonFileSafe } from '../json-file';
import type { AppSettings } from '@shared/types';

export const DEFAULT_APP_SETTINGS: AppSettings = { hotkey: 'Control+Shift+Space', hasShownTrayHint: false };

export function readAppSettings(): AppSettings {
  if (!fs.existsSync(APP_SETTINGS_FILE)) return { ...DEFAULT_APP_SETTINGS };
  const parsed = readJsonFileSafe<Partial<AppSettings>>(APP_SETTINGS_FILE, {}, (v) => Boolean(v) && typeof v === 'object');
  return { ...DEFAULT_APP_SETTINGS, ...parsed };
}

export function writeAppSettings(settings: AppSettings): void {
  try {
    fs.mkdirSync(path.dirname(APP_SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write app settings:', err);
  }
}
