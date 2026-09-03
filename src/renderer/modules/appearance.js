// appearance.js — pushes the current theme/density/accent/blur/UI-scale
// state onto the DOM, plus the sound/notification side-effects that don't
// belong to any single UI surface. The Settings modal (settings-modal.js)
// owns the *controls* that change `state`; this module only applies it.
import { state } from './state.js';
import { dom } from './dom.js';
import { openHistory } from './history-drawer.js';

export function applyAppearance() {
  if (state.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = state.theme;

  if (state.accentColor) document.documentElement.style.setProperty('--accent', state.accentColor);
  else document.documentElement.style.removeProperty('--accent');

  document.documentElement.dataset.density = state.density;
  document.documentElement.style.setProperty('--app-shell-blur', `${state.blur}px`);

  // Scale the whole UI while still exactly covering the window: lay out at
  // 100%/s size, then transform-scale by s back up to 100%. A plain CSS
  // `zoom` left a gap at s<1 that exposed the transparent window's own
  // (black, on Windows) base paint — see main/window.js's hasShadow/
  // thickFrame comment for the same class of compositing quirk.
  const s = state.uiScale / 100;
  dom.appShell.style.width = `${100 / s}%`;
  dom.appShell.style.height = `${100 / s}vh`;
  dom.appShell.style.transform = `scale(${s})`;
}

export function updateSegmentedActive(container, value) {
  container.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

/** Synthesizes a short success/failure beep — no audio asset files needed. */
export function playTone(success) {
  if (!state.soundEnabled) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
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
export function maybeNotify(title, body) {
  if (!state.notificationsEnabled || document.hasFocus()) return;
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
