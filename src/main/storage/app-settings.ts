// storage/app-settings.ts — small app-level preferences: the custom hotkey,
// the first-run tray-hint flag, and the launcher window's last resized size.
// Not snippet data, not a UI preference — its own tiny file.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { APP_SETTINGS_FILE } from '../paths';
import { readJsonFileSafe, writeJsonFileAtomic } from '../json-file';
import type { AppSettings } from '@shared/types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hotkey: 'Control+Shift+Space',
  hasShownTrayHint: false,
  windowSize: null,
  trigger: { enabled: false, port: 7411, token: '' },
};

export function readAppSettings(): AppSettings {
  if (!fs.existsSync(APP_SETTINGS_FILE)) return { ...DEFAULT_APP_SETTINGS };
  const parsed = readJsonFileSafe<Partial<AppSettings>>(APP_SETTINGS_FILE, {}, (v) => Boolean(v) && typeof v === 'object');
  // A shallow spread would drop trigger.port/token entirely if an
  // older-schema file predates the `trigger` field, or replace the whole
  // sub-object if only part of it was ever saved — merge it one level
  // deeper so a partially-populated or missing `trigger` still backfills
  // cleanly, same spirit as the zod-schema sanitizers elsewhere in this app.
  const trigger = { ...DEFAULT_APP_SETTINGS.trigger, ...(parsed.trigger || {}) };
  if (!trigger.token) trigger.token = crypto.randomBytes(24).toString('hex');
  return { ...DEFAULT_APP_SETTINGS, ...parsed, trigger };
}

export function writeAppSettings(settings: AppSettings): void {
  try {
    writeJsonFileAtomic(APP_SETTINGS_FILE, settings);
  } catch (err) {
    console.error('Failed to write app settings:', err);
  }
}
