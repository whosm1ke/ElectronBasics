// settings-modal.js — Appearance / Behavior / Data settings: theme, accent,
// density, blur, UI scale, sound, notifications, developer mode, the custom
// hotkey capture UI, automatic backups, and export/import.
import { dom } from './dom.js';
import { state, ACCENT_PRESETS } from './state.js';
import { applyAppearance, updateSegmentedActive, playTone } from './appearance.js';
import { showToast } from './toast.js';
import { emitSnippetsChanged } from './events.js';

export async function openSettings() {
  dom.settingsOverlay.hidden = false;
  dom.launchOnStartupToggle.checked = await window.electronAPI.getLaunchOnStartup();

  updateSegmentedActive(dom.themeSegmented, state.theme);
  updateSegmentedActive(dom.densitySegmented, state.density);
  dom.accentSwatches.querySelectorAll('.color-swatch').forEach((sw) => {
    sw.classList.toggle('active', state.accentColor === sw.dataset.color);
  });
  dom.accentColorInput.value = state.accentColor || '#6e8bff';
  dom.blurSlider.value = String(state.blur);
  dom.blurValueLabel.textContent = `${state.blur}px`;
  dom.scaleSlider.value = String(state.uiScale);
  dom.scaleValueLabel.textContent = `${state.uiScale}%`;
  dom.soundToggle.checked = state.soundEnabled;
  dom.notificationsToggle.checked = state.notificationsEnabled;
  dom.devModeToggle.checked = state.devModeEnabled;

  const hk = await window.electronAPI.getHotkey();
  dom.hotkeyInput.value = hk.active || hk.saved || '';
  dom.hotkeyStatus.textContent = hk.active ? '' : 'No hotkey is currently active — try setting one below.';

  dom.appVersionLabel.textContent = await window.electronAPI.getAppVersion();
  applyUpdateStatus(state.updateStatus);

  loadBackupsList();
}

export function closeSettings() {
  dom.settingsOverlay.hidden = true;
  dom.searchInput.focus();
}

export function isSettingsOpen() {
  return !dom.settingsOverlay.hidden;
}

function initAccentSwatches() {
  dom.accentSwatches.innerHTML = '';
  ACCENT_PRESETS.forEach((hex) => {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'color-swatch';
    sw.style.background = hex;
    sw.dataset.color = hex;
    sw.title = hex;
    sw.addEventListener('click', () => {
      state.accentColor = hex;
      localStorage.setItem('snippetRunner.accent', hex);
      applyAppearance();
      dom.accentSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.toggle('active', s === sw));
      dom.accentColorInput.value = hex;
    });
    dom.accentSwatches.appendChild(sw);
  });
}
initAccentSwatches();

async function loadBackupsList() {
  const backups = await window.electronAPI.listBackups();
  dom.backupsList.innerHTML = '';
  if (backups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'backups-empty';
    empty.textContent = 'No backups yet — one is captured automatically before your next change.';
    dom.backupsList.appendChild(empty);
    return;
  }
  backups.forEach((b) => {
    const row = document.createElement('div');
    row.className = 'backup-row';
    const time = document.createElement('span');
    time.className = 'backup-row-time';
    time.textContent = new Date(b.mtime).toLocaleString();
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-small';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => restoreBackupFlow(b.fileName));
    row.append(time, restoreBtn);
    dom.backupsList.appendChild(row);
  });
}

async function restoreBackupFlow(fileName) {
  const res = await window.electronAPI.restoreBackup(fileName);
  if (res.ok) {
    state.snippets = res.snippets;
    emitSnippetsChanged();
    showToast('Snippet library restored from backup');
    loadBackupsList();
  } else {
    showToast(res.error || 'Restore failed', 'error');
  }
}

dom.themeSegmented.addEventListener('click', (e) => {
  const btn = e.target.closest('.segmented-btn');
  if (!btn) return;
  state.theme = btn.dataset.value;
  localStorage.setItem('snippetRunner.theme', state.theme);
  applyAppearance();
  updateSegmentedActive(dom.themeSegmented, state.theme);
});

dom.densitySegmented.addEventListener('click', (e) => {
  const btn = e.target.closest('.segmented-btn');
  if (!btn) return;
  state.density = btn.dataset.value;
  localStorage.setItem('snippetRunner.density', state.density);
  applyAppearance();
  updateSegmentedActive(dom.densitySegmented, state.density);
});

dom.accentColorInput.addEventListener('input', () => {
  state.accentColor = dom.accentColorInput.value;
  localStorage.setItem('snippetRunner.accent', state.accentColor);
  applyAppearance();
  dom.accentSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.toggle('active', s.dataset.color === state.accentColor));
});

dom.resetAccentBtn.addEventListener('click', () => {
  state.accentColor = null;
  localStorage.removeItem('snippetRunner.accent');
  applyAppearance();
  dom.accentColorInput.value = '#6e8bff';
  dom.accentSwatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
});

dom.blurSlider.addEventListener('input', () => {
  state.blur = Number(dom.blurSlider.value);
  localStorage.setItem('snippetRunner.blur', String(state.blur));
  dom.blurValueLabel.textContent = `${state.blur}px`;
  applyAppearance();
});

dom.scaleSlider.addEventListener('input', () => {
  state.uiScale = Number(dom.scaleSlider.value);
  localStorage.setItem('snippetRunner.scale', String(state.uiScale));
  dom.scaleValueLabel.textContent = `${state.uiScale}%`;
  applyAppearance();
});

dom.soundToggle.addEventListener('change', () => {
  state.soundEnabled = dom.soundToggle.checked;
  localStorage.setItem('snippetRunner.sound', state.soundEnabled ? '1' : '0');
  if (state.soundEnabled) playTone(true);
});

dom.notificationsToggle.addEventListener('change', () => {
  state.notificationsEnabled = dom.notificationsToggle.checked;
  localStorage.setItem('snippetRunner.notifications', state.notificationsEnabled ? '1' : '0');
  if (state.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});

dom.devModeToggle.addEventListener('change', () => {
  state.devModeEnabled = dom.devModeToggle.checked;
  localStorage.setItem('snippetRunner.devMode', state.devModeEnabled ? '1' : '0');
});

// --- Hotkey capture ---
let capturingHotkey = false;
let capturedAccelerator = '';

dom.hotkeyInput.addEventListener('click', () => {
  capturingHotkey = true;
  capturedAccelerator = '';
  dom.hotkeyInput.classList.add('capturing');
  dom.hotkeyInput.value = 'Press a shortcut…';
  dom.hotkeyStatus.textContent = '';
});

dom.hotkeyInput.addEventListener('keydown', (e) => {
  if (!capturingHotkey) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    capturingHotkey = false;
    dom.hotkeyInput.classList.remove('capturing');
    dom.hotkeyInput.value = capturedAccelerator || '';
    return;
  }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
  const parts = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  capturedAccelerator = parts.join('+');
  dom.hotkeyInput.value = capturedAccelerator;
  capturingHotkey = false;
  dom.hotkeyInput.classList.remove('capturing');
});

dom.hotkeyInput.addEventListener('blur', () => {
  capturingHotkey = false;
  dom.hotkeyInput.classList.remove('capturing');
});

dom.saveHotkeyBtn.addEventListener('click', async () => {
  if (!capturedAccelerator) {
    dom.hotkeyStatus.textContent = 'Click the field and press a shortcut first.';
    return;
  }
  const res = await window.electronAPI.setHotkey(capturedAccelerator);
  if (res.ok) {
    dom.hotkeyStatus.textContent = `Saved — ${res.active} now toggles the launcher.`;
  } else {
    dom.hotkeyStatus.textContent = res.error || 'Could not save that shortcut.';
    dom.hotkeyInput.value = res.active || '';
  }
});

dom.launchOnStartupToggle.addEventListener('change', async () => {
  const enabled = await window.electronAPI.setLaunchOnStartup(dom.launchOnStartupToggle.checked);
  showToast(enabled ? 'Will launch at Windows startup' : 'Removed from Windows startup');
});

dom.exportBtn.addEventListener('click', async () => {
  const res = await window.electronAPI.exportSnippets();
  if (res.ok) showToast(`Exported to ${res.filePath}`);
  else if (res.error) showToast(res.error, 'error');
});

dom.importBtn.addEventListener('click', async () => {
  const res = await window.electronAPI.importSnippets();
  if (res.ok) {
    state.snippets = res.snippets;
    emitSnippetsChanged();
    showToast(`Imported ${res.importedCount} snippet(s)`);
  } else if (res.error) {
    showToast(res.error, 'error');
  }
});

// --- Updates ---
// Manual, user-triggered only — see updater.js's header comment for why
// (matches the app's "nothing runs without you clicking it" stance).
// state.updateStatus is the source of truth so a status change that arrives
// while Settings is closed (e.g. a slow download finishing) doesn't get
// lost — applyUpdateStatus() re-renders it from there whenever Settings
// reopens, not just when the event itself fires.
function applyUpdateStatus(status) {
  const { status: kind, message, version, percent } = status;
  dom.updateProgressRow.hidden = kind !== 'downloading';
  if (kind === 'downloading') dom.updateProgressFill.style.width = `${percent}%`;
  dom.downloadUpdateBtn.hidden = kind !== 'available';
  dom.restartUpdateBtn.hidden = kind !== 'downloaded';
  dom.checkUpdateBtn.disabled = kind === 'checking' || kind === 'downloading' || kind === 'unsupported';

  dom.updateStatusText.textContent = {
    idle: '',
    checking: 'Checking…',
    'not-available': "You're up to date.",
    available: `Update available — v${version}`,
    downloading: `Downloading… ${percent}%`,
    downloaded: `Update ready — v${version}. Restart to install.`,
    error: `Update check failed: ${message}`,
    unsupported: message,
  }[kind] || '';
}

window.electronAPI.onUpdateStatus((status) => {
  state.updateStatus = status;
  if (isSettingsOpen()) applyUpdateStatus(status);
});

dom.checkUpdateBtn.addEventListener('click', () => {
  state.updateStatus = { status: 'checking' };
  applyUpdateStatus(state.updateStatus);
  window.electronAPI.checkForUpdates();
});

dom.downloadUpdateBtn.addEventListener('click', () => {
  window.electronAPI.downloadUpdate();
});

dom.restartUpdateBtn.addEventListener('click', () => {
  window.electronAPI.quitAndInstall();
});

dom.settingsBtn.addEventListener('click', openSettings);
dom.closeSettingsBtn.addEventListener('click', closeSettings);
dom.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === dom.settingsOverlay) closeSettings();
});
