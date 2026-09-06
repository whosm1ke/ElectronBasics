// SettingsModal.tsx — Appearance / Behavior / Updates / Data settings.
// Ported from modules/settings-modal.js. Appearance fields now come from
// useUiStore.ts (a real Zustand store — see that file's header comment on
// why this was deferred to here rather than done alongside appearance.ts
// in Phase 6: Settings is this data's one and only writer). Hotkey capture
// is local component state, refreshed each time the modal opens, same as
// the original's openSettings().
import { useEffect, useRef, useState } from 'react';
import { Copy, Check, RefreshCw, Trash2, BookMarked } from 'lucide-react';
import type { TriggerConfig, Library } from '@shared/types';
import { useUiStore, type Theme, type Density } from '../../store/useUiStore';
import { useSettingsStore, closeSettings } from '../../store/useSettingsStore';
import { playTone } from '../../lib/appearance';
import { showToast } from '../../lib/toast';
import { state } from '../../../modules/state';
import { emitSnippetsChanged } from '../../lib/events';
import { openVariables } from '../../store/useVariablesStore';
import { timeAgo } from '../../lib/utils';

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

function TriggersSection() {
  const [config, setConfig] = useState<(TriggerConfig & { running: boolean }) | null>(null);
  const [portInput, setPortInput] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    window.electronAPI.getTriggerConfig().then((c) => { setConfig(c); setPortInput(String(c.port)); });
  }, []);

  if (!config) return null;

  async function toggle(enabled: boolean) {
    const next = await window.electronAPI.setTriggerConfig({ enabled });
    setConfig(next);
    showToast(enabled ? `Trigger server listening on 127.0.0.1:${next.port}` : 'Trigger server stopped');
  }

  async function savePort() {
    const port = Number(portInput);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      showToast('Port must be between 1024 and 65535', 'error');
      return;
    }
    const next = await window.electronAPI.setTriggerConfig({ port });
    setConfig(next);
    setPortInput(String(next.port));
    if (next.enabled) showToast(`Trigger server now on 127.0.0.1:${next.port}`);
  }

  const exampleUrl = `http://127.0.0.1:${config.port}/run/<snippetId>?token=${config.token}`;

  return (
    <div className="settings-section">
      <div className="settings-section-title">Triggers</div>
      <p className="field-hint">
        Run a snippet from outside the launcher — a scheduled task, a CI job, another script on this machine — with a local HTTP call.
        Loopback-only (never reachable over the network); the token below is required on every request.
      </p>

      <label className="checkbox-row" htmlFor="triggerEnabledToggle">
        <input id="triggerEnabledToggle" type="checkbox" checked={config.enabled} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Enable the trigger server{' '}
          {config.enabled && <span className="field-hint">({config.running ? 'running' : 'failed to start — check the port'})</span>}
        </span>
      </label>

      <label className="field-label" htmlFor="triggerPortInput">Port</label>
      <div className="hotkey-row">
        <input
          id="triggerPortInput"
          type="number"
          className="field-input hotkey-input"
          min={1024}
          max={65535}
          value={portInput}
          onChange={(e) => setPortInput(e.target.value)}
        />
        <button type="button" className="btn btn-small" onClick={savePort}>
          Save
        </button>
      </div>

      <label className="field-label">Token</label>
      <div className="hotkey-row">
        <input type="text" className="field-input hotkey-input" readOnly value={config.token} />
        <button
          type="button"
          className="btn btn-small"
          title="Copy token"
          onClick={async () => {
            await window.electronAPI.copyText(config.token);
            setTokenCopied(true);
            setTimeout(() => setTokenCopied(false), 1200);
          }}
        >
          {tokenCopied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          type="button"
          className="btn btn-small"
          title="Generate a new token (invalidates the old one immediately)"
          onClick={async () => {
            const next = await window.electronAPI.regenerateTriggerToken();
            setConfig(next);
            showToast('New trigger token generated — update anything using the old one');
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <label className="field-label">Example</label>
      <div className="hotkey-row">
        <input type="text" className="field-input hotkey-input" readOnly value={exampleUrl} />
        <button
          type="button"
          className="btn btn-small"
          title="Copy example URL"
          onClick={async () => {
            await window.electronAPI.copyText(exampleUrl);
            setUrlCopied(true);
            setTimeout(() => setUrlCopied(false), 1200);
          }}
        >
          {urlCopied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <p className="field-hint">
        <code>POST</code> that URL (or set the token via an <code>X-Trigger-Token</code> header instead of the query string) with a real
        snippet id in place of <code>&lt;snippetId&gt;</code> — copy a snippet's id from its Details panel. A snippet with unresolved{' '}
        <code>{'{{placeholder}}'}</code> tokens is refused, same as scheduled/batch runs.
      </p>
    </div>
  );
}

function LibraryRow({ library, onChanged }: { library: Library; onChanged: (result: { snippets?: import('@shared/types').Snippet[]; libraries: Library[] }) => void }) {
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    const res = await window.electronAPI.syncLibrary(library.id);
    setBusy(false);
    if (res.ok) {
      showToast(`Synced "${library.name || library.url}" — ${res.count} snippet(s)`);
      onChanged(res);
    } else {
      showToast(res.error, 'error');
    }
  }

  async function remove() {
    setBusy(true);
    const res = await window.electronAPI.removeLibrary(library.id);
    setBusy(false);
    showToast(`Removed "${library.name || library.url}" and its snippets`);
    onChanged(res);
  }

  return (
    <div className="group-row">
      <div className="group-row-info">
        <div className="group-row-name">
          <BookMarked size={13} /> {library.name || library.url}
        </div>
        <div className="group-row-count">
          {library.url} · {library.lastSyncedAt ? `synced ${timeAgo(library.lastSyncedAt)} — ${library.lastSyncCount} snippet(s)` : 'never synced'}
        </div>
      </div>
      <button type="button" className="btn btn-small" disabled={busy} onClick={sync}>
        <RefreshCw size={12} />
        <span>Sync</span>
      </button>
      <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={remove}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function LibrariesSection() {
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    window.electronAPI.getLibraries().then(setLibraries);
  }, []);

  function applyChange(result: { snippets?: import('@shared/types').Snippet[]; libraries: Library[] }) {
    setLibraries(result.libraries);
    if (result.snippets) {
      state.snippets = result.snippets;
      emitSnippetsChanged();
    }
  }

  async function add() {
    if (!url.trim()) return;
    setAdding(true);
    const res = await window.electronAPI.addLibrary(url.trim());
    setAdding(false);
    if (res.ok) {
      showToast(`Subscribed — pulled in ${res.count} snippet(s)`);
      setUrl('');
      applyChange(res);
    } else {
      showToast(res.error, 'error');
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">Shared libraries</div>
      <p className="field-hint">
        Subscribe to a URL that serves a JSON array of snippets (the same shape as an exported snippets file) — its snippets are merged in
        read-mostly, tagged with where they came from, and refreshed on demand. Removing a subscription removes the snippets it added, too.
      </p>
      <div className="hotkey-row">
        <input
          type="text"
          className="field-input hotkey-input"
          placeholder="https://example.com/team-snippets.json"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
        />
        <button type="button" className="btn btn-small" disabled={adding} onClick={add}>
          Subscribe
        </button>
      </div>
      {libraries.length > 0 && (
        <div className="groups-list" style={{ marginTop: 10 }}>
          {libraries.map((l) => (
            <LibraryRow key={l.id} library={l} onChanged={applyChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function DataSection() {
  const [launchOnStartup, setLaunchOnStartup] = useState(false);

  useEffect(() => {
    window.electronAPI.getLaunchOnStartup().then(setLaunchOnStartup);
  }, []);

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
        <TriggersSection />
        <LibrariesSection />
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
