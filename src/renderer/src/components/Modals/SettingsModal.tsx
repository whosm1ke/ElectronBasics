// SettingsModal.tsx — Appearance / Behavior / Updates / Data settings.
// Ported from modules/settings-modal.js. Appearance fields now come from
// useUiStore.ts (a real Zustand store — see that file's header comment on
// why this was deferred to here rather than done alongside appearance.ts
// in Phase 6: Settings is this data's one and only writer). Hotkey capture
// and backups list are local component state, refreshed each time the
// modal opens, same as the original's openSettings().
import { useEffect, useRef, useState } from 'react';
import type { BackupInfo } from '@shared/types';
import { useUiStore, type Theme, type Density } from '../../store/useUiStore';
import { useSettingsStore, closeSettings } from '../../store/useSettingsStore';
import { playTone } from '../../lib/appearance';
import { showToast } from '../../store/useToastStore';
import { state } from '../../../modules/state';
import { emitSnippetsChanged } from '../../lib/events';
import { openVariables } from '../../store/useVariablesStore';

const ACCENT_PRESETS = ['#6e8bff', '#8a63f2', '#ff6bcb', '#ff6b6b', '#f5a623', '#e0c341', '#4bd08b', '#3fc7c7'];

function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button type="button" key={o.value} className={'segmented-btn' + (value === o.value ? ' active' : '')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AppearanceSection() {
  const ui = useUiStore();
  return (
    <div className="settings-section">
      <div className="settings-section-title">Appearance</div>

      <label className="field-label">Theme</label>
      <SegmentedControl
        value={ui.theme}
        onChange={ui.setTheme}
        options={
          [
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ] as { value: Theme; label: string }[]
        }
      />

      <label className="field-label">Accent color</label>
      <div className="swatch-row">
        {ACCENT_PRESETS.map((hex) => (
          <button
            type="button"
            key={hex}
            className={'color-swatch' + (ui.accentColor === hex ? ' active' : '')}
            style={{ background: hex }}
            title={hex}
            onClick={() => ui.setAccentColor(hex)}
          />
        ))}
      </div>
      <div className="accent-custom-row">
        <input type="color" className="color-input" value={ui.accentColor || '#6e8bff'} onChange={(e) => ui.setAccentColor(e.target.value)} />
        <span className="field-hint">Custom</span>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => ui.setAccentColor(null)}>
          Reset
        </button>
      </div>

      <label className="field-label">Density</label>
      <SegmentedControl
        value={ui.density}
        onChange={ui.setDensity}
        options={
          [
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'spacious', label: 'Spacious' },
          ] as { value: Density; label: string }[]
        }
      />

      <label className="field-label">
        Background blur <span className="field-hint">{ui.blur}px</span>
      </label>
      <input type="range" className="slider" min={0} max={40} step={2} value={ui.blur} onChange={(e) => ui.setBlur(Number(e.target.value))} />

      <label className="field-label">
        UI scale <span className="field-hint">{ui.uiScale}%</span>
      </label>
      <input type="range" className="slider" min={85} max={125} step={5} value={ui.uiScale} onChange={(e) => ui.setUiScale(Number(e.target.value))} />
    </div>
  );
}

function BehaviorSection() {
  const ui = useUiStore();
  const [hotkeyValue, setHotkeyValue] = useState('');
  const [hotkeyStatus, setHotkeyStatus] = useState('');
  const [capturing, setCapturing] = useState(false);
  const capturedRef = useRef('');

  useEffect(() => {
    window.electronAPI.getHotkey().then((hk) => {
      setHotkeyValue(hk.active || hk.saved || '');
      setHotkeyStatus(hk.active ? '' : 'No hotkey is currently active — try setting one below.');
    });
  }, []);

  function startCapture() {
    setCapturing(true);
    capturedRef.current = '';
    setHotkeyValue('Press a shortcut…');
    setHotkeyStatus('');
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setCapturing(false);
      setHotkeyValue(capturedRef.current || '');
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Super');
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
    capturedRef.current = parts.join('+');
    setHotkeyValue(capturedRef.current);
    setCapturing(false);
  }

  async function saveHotkey() {
    if (!capturedRef.current) {
      setHotkeyStatus('Click the field and press a shortcut first.');
      return;
    }
    const res = await window.electronAPI.setHotkey(capturedRef.current);
    if (res.ok) {
      setHotkeyStatus(`Saved — ${res.active} now toggles the launcher.`);
    } else {
      setHotkeyStatus(res.error || 'Could not save that shortcut.');
      setHotkeyValue(res.active || '');
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">Behavior</div>

      <label className="field-label" htmlFor="hotkeyInput">Global hotkey</label>
      <div className="hotkey-row">
        <input
          type="text"
          id="hotkeyInput"
          className={'field-input hotkey-input' + (capturing ? ' capturing' : '')}
          readOnly
          placeholder="Click, then press a shortcut…"
          value={hotkeyValue}
          onClick={startCapture}
          onKeyDown={onKeyDown}
          onBlur={() => setCapturing(false)}
        />
        <button type="button" className="btn btn-small" onClick={saveHotkey}>
          Save
        </button>
      </div>
      <p className="field-hint">{hotkeyStatus}</p>

      <label className="checkbox-row" htmlFor="soundToggle">
        <input
          type="checkbox"
          id="soundToggle"
          checked={ui.soundEnabled}
          onChange={(e) => {
            ui.setSoundEnabled(e.target.checked);
            if (e.target.checked) playTone(true);
          }}
        />
        <span>Play a sound when a command finishes</span>
      </label>

      <label className="checkbox-row" htmlFor="notificationsToggle">
        <input
          type="checkbox"
          id="notificationsToggle"
          checked={ui.notificationsEnabled}
          onChange={(e) => {
            ui.setNotificationsEnabled(e.target.checked);
            if (e.target.checked && typeof Notification !== 'undefined' && Notification.permission === 'default') {
              Notification.requestPermission();
            }
          }}
        />
        <span>Show a desktop notification when a command finishes in the background</span>
      </label>

      <label className="checkbox-row" htmlFor="devModeToggle">
        <input type="checkbox" id="devModeToggle" checked={ui.devModeEnabled} onChange={(e) => ui.setDevModeEnabled(e.target.checked)} />
        <span>
          Developer mode <span className="field-hint">(show the exact command/args sent to the OS for each run)</span>
        </span>
      </label>
    </div>
  );
}

function UpdatesSection() {
  const { updateStatus } = useSettingsStore();
  const [version, setVersion] = useState('—');

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion);
  }, []);

  const { status: kind, message, version: updateVersion, percent } = updateStatus;
  const statusText =
    {
      idle: '',
      checking: 'Checking…',
      'not-available': "You're up to date.",
      available: `Update available — v${updateVersion}`,
      downloading: `Downloading… ${percent}%`,
      downloaded: `Update ready — v${updateVersion}. Restart to install.`,
      error: `Update check failed: ${message}`,
      unsupported: message,
    }[kind] || '';

  return (
    <div className="settings-section">
      <div className="settings-section-title">Updates</div>
      <p className="field-hint">
        Version <span>{version}</span>
      </p>
      <div className="update-row">
        <button
          type="button"
          id="checkUpdateBtn"
          className="btn btn-small"
          disabled={kind === 'checking' || kind === 'downloading' || kind === 'unsupported'}
          onClick={() => window.electronAPI.checkForUpdates()}
        >
          Check for updates
        </button>
        <span className="field-hint">{statusText}</span>
      </div>
      {kind === 'downloading' && (
        <div className="update-progress-row">
          <div className="update-progress-bar">
            <div className="update-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <div className="modal-actions modal-actions-left">
        {kind === 'available' && (
          <button type="button" id="downloadUpdateBtn" className="btn btn-primary btn-small" onClick={() => window.electronAPI.downloadUpdate()}>
            Download update
          </button>
        )}
        {kind === 'downloaded' && (
          <button type="button" id="restartUpdateBtn" className="btn btn-primary btn-small" onClick={() => window.electronAPI.quitAndInstall()}>
            Restart &amp; install
          </button>
        )}
      </div>
    </div>
  );
}

function DataSection() {
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  async function loadBackups() {
    setBackups(await window.electronAPI.listBackups());
  }

  useEffect(() => {
    window.electronAPI.getLaunchOnStartup().then(setLaunchOnStartup);
    loadBackups();
  }, []);

  async function restore(fileName: string) {
    const res = await window.electronAPI.restoreBackup(fileName);
    if (res.ok && res.snippets) {
      state.snippets = res.snippets;
      emitSnippetsChanged();
      showToast('Snippet library restored from backup');
      loadBackups();
    } else {
      showToast(res.error || 'Restore failed', 'error');
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">Data</div>

      <label className="checkbox-row" htmlFor="launchOnStartupToggle">
        <input
          type="checkbox"
          id="launchOnStartupToggle"
          checked={launchOnStartup}
          onChange={async (e) => {
            const enabled = await window.electronAPI.setLaunchOnStartup(e.target.checked);
            setLaunchOnStartup(enabled);
            showToast(enabled ? 'Will launch at Windows startup' : 'Removed from Windows startup');
          }}
        />
        <span>Launch Snippet Runner at Windows startup</span>
      </label>

      <div className="modal-actions modal-actions-left">
        <button type="button" className="btn" onClick={openVariables}>
          Manage variables…
        </button>
        <button
          type="button"
          id="exportBtn"
          className="btn"
          onClick={async () => {
            const res = await window.electronAPI.exportSnippets();
            if (res.ok) showToast(`Exported to ${res.filePath}`);
            else if (res.error) showToast(res.error, 'error');
          }}
        >
          Export snippets…
        </button>
        <button
          type="button"
          id="importBtn"
          className="btn"
          onClick={async () => {
            const res = await window.electronAPI.importSnippets();
            if (res.ok) {
              state.snippets = res.snippets;
              emitSnippetsChanged();
              showToast(`Imported ${res.importedCount} snippet(s)`);
            } else if (res.error) {
              showToast(res.error, 'error');
            }
          }}
        >
          Import snippets…
        </button>
      </div>

      <label className="field-label">
        Automatic backups <span className="field-hint">(snapshotted before each change, throttled)</span>
      </label>
      <div className="backups-list no-scrollbar">
        {backups.length === 0 ? (
          <div className="backups-empty">No backups yet — one is captured automatically before your next change.</div>
        ) : (
          backups.map((b) => (
            <div className="backup-row" key={b.fileName}>
              <span className="backup-row-time">{new Date(b.mtime).toLocaleString()}</span>
              <button type="button" className="btn btn-small" onClick={() => restore(b.fileName)}>
                Restore
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function SettingsModal() {
  const { open } = useSettingsStore();
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}>
      <div className="modal">
        <h2>Settings</h2>
        <AppearanceSection />
        <BehaviorSection />
        <UpdatesSection />
        <DataSection />
        <p className="field-hint" style={{ marginTop: 14 }}>
          Toggle the launcher anytime from the tray icon, or with the hotkey above.
        </p>
        <div className="modal-actions">
          <button type="button" id="closeSettingsBtn" className="btn btn-primary" onClick={closeSettings}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
