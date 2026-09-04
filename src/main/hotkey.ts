// hotkey.ts — the single place that calls globalShortcut.register/unregister,
// so the "currently active accelerator" is never tracked in two places.
import { globalShortcut } from 'electron';
import { toggleWindow } from './window';
import { setTrayTooltip } from './tray';

let currentHotkey: string | null = null;

/** Tries to register `accelerator` as the toggle hotkey, replacing any current one. Returns success. */
export function registerHotkey(accelerator: string): boolean {
  const previous = currentHotkey;
  if (previous) {
    try {
      globalShortcut.unregister(previous);
    } catch (err) {
      console.error(err);
    }
  }
  try {
    if (globalShortcut.register(accelerator, toggleWindow)) {
      currentHotkey = accelerator;
      setTrayTooltip(`Snippet Runner — ${accelerator} to toggle`);
      return true;
    }
  } catch (err) {
    console.error(`Failed to register hotkey ${accelerator}:`, err);
  }
  // Roll back to whatever was working before.
  currentHotkey = null;
  if (previous) {
    try {
      if (globalShortcut.register(previous, toggleWindow)) currentHotkey = previous;
    } catch (err) {
      console.error(err);
    }
  }
  return false;
}

export function getCurrentHotkey(): string | null {
  return currentHotkey;
}
