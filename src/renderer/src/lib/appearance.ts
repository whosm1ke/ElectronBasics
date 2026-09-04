// appearance.ts — pushes the current theme/density/accent/blur/UI-scale
// state onto the DOM, plus the sound/notification side-effects that don't
// belong to any single UI surface. Reads useUiStore.ts (Phase 8: this used
// to still read modules/state.js/dom.js directly, deferred until Settings
// — the fields' one and only writer — was itself ported; see
// SettingsModal.tsx). applyAppearance() is subscribed once below so it
// reruns automatically on every store change, in addition to being
// callable directly (e.g. once at renderer boot).
import { dom } from '../../modules/dom';
import { openHistory } from '../store/useHistoryStore';
import { useUiStore } from '../store/useUiStore';

export function applyAppearance(): void {
  const { theme, accentColor, density, blur, uiScale } = useUiStore.getState();

  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;

  if (accentColor) document.documentElement.style.setProperty('--accent', accentColor);
  else document.documentElement.style.removeProperty('--accent');

  document.documentElement.dataset.density = density;
  document.documentElement.style.setProperty('--app-shell-blur', `${blur}px`);

  // Scale the whole UI while still exactly covering the window: lay out at
  // 100%/s size, then transform-scale by s back up to 100%. A plain CSS
  // `zoom` left a gap at s<1 that exposed the transparent window's own
  // (black, on Windows) base paint — see main/window.ts's hasShadow/
  // thickFrame comment for the same class of compositing quirk.
  const s = uiScale / 100;
  // dom.js's byId() helpers are typed HTMLElement | null (they're plain
  // document.getElementById calls); every one of them corresponds to a
  // real, always-present element in index.html, so a non-null assertion
  // here is accurate, not a suppressed bug.
  dom.appShell!.style.width = `${100 / s}%`;
  dom.appShell!.style.height = `${100 / s}vh`;
  dom.appShell!.style.transform = `scale(${s})`;
}

// Re-applies automatically whenever theme/accent/density/blur/uiScale
// change from anywhere (SettingsModal.tsx's controls) — callers no longer
// need to remember to call applyAppearance() after every store write.
useUiStore.subscribe(applyAppearance);

export function updateSegmentedActive(container: Element, value: string): void {
  container.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.value === value);
  });
}

/** Synthesizes a short success/failure beep — no audio asset files needed. */
export function playTone(success: boolean): void {
  if (!useUiStore.getState().soundEnabled) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = success ? 880 : 220;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
    osc.onended = () => ctx.close();
  } catch (err) {
    console.error('Failed to play tone:', err);
  }
}

/** Shows a native OS notification, only when the window isn't the focused/watched surface. Clicking it brings the launcher forward and opens run history — otherwise a notification (especially one reporting a failure) is a dead end with nothing to click through to. */
export function maybeNotify(title: string, body: string): void {
  if (!useUiStore.getState().notificationsEnabled || document.hasFocus()) return;
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      const notif = new Notification(title, { body });
      notif.onclick = () => {
        window.electronAPI.showWindow();
        openHistory();
      };
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  } catch (err) {
    console.error('Failed to show notification:', err);
  }
}
