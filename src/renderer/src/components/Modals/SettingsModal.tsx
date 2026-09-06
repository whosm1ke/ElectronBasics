// SettingsModal.tsx — Appearance / Behavior / Updates / Data settings.
// Ported from modules/settings-modal.js. Appearance fields now come from
// useUiStore.ts (a real Zustand store — see that file's header comment on
// why this was deferred to here rather than done alongside appearance.ts
// in Phase 6: Settings is this data's one and only writer). Hotkey capture
// is local component state, refreshed each time the modal opens, same as
// the original's openSettings().
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Check, RefreshCw, Trash2, BookMarked, FolderOpen, Palette, SlidersHorizontal, Webhook, Database, HelpCircle } from 'lucide-react';
import type { TriggerConfig, Library, WatchTrigger, Snippet } from '@shared/types';
import { ThemedSelect } from '../shared/ThemedSelect';
import { SnippetPickerField } from '../shared/SnippetPicker';
import { newId, extractPlaceholders, runnableTextOf } from '../../lib/utils';
import { useUiStore, type Theme, type Density } from '../../store/useUiStore';
import { useSettingsStore, closeSettings, type SettingsCategory } from '../../store/useSettingsStore';
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

      <label className="checkbox-row" htmlFor="devModeToggle" title="Show the exact command/args sent to the OS for each run">
        <input type="checkbox" id="devModeToggle" checked={ui.devModeEnabled} onChange={(e) => ui.setDevModeEnabled(e.target.checked)} />
        <span>Developer mode</span>
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

function WatchTriggerRow({ trigger, snippets, onChange, onRemove }: { trigger: WatchTrigger; snippets: Snippet[]; onChange: (patch: Partial<WatchTrigger>) => void; onRemove: () => void }) {
  const targetSnippet = snippets.find((s) => s.id === trigger.snippetId);
  const placeholderNames = targetSnippet ? extractPlaceholders(runnableTextOf(targetSnippet)) : [];

  function setParamValue(name: string, value: string) {
    const next = { ...(trigger.paramValues || {}) };
    if (value) next[name] = value;
    else delete next[name];
    onChange({ paramValues: Object.keys(next).length > 0 ? next : null });
  }

  return (
    <div className="group-row watch-trigger-row">
      <div className="group-row-info">
        <label className="checkbox-row">
          <input type="checkbox" checked={trigger.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
          <span className="watch-trigger-path" title={trigger.path}>{trigger.path || '(no path chosen)'}</span>
        </label>
        <div className="watch-trigger-fields">
          <SnippetPickerField value={trigger.snippetId} onChange={(snippetId) => onChange({ snippetId })} snippets={snippets} />
        </div>
        {placeholderNames.length > 0 && (
          <div className="env-list">
            {placeholderNames.map((name) => (
              <div className="env-row" key={name}>
                <span className="schedule-param-name">{`{{${name}}}`}</span>
                <input
                  type="text"
                  className="field-input env-value-input"
                  placeholder="uses a global variable if left blank"
                  value={trigger.paramValues?.[name] || ''}
                  onChange={(e) => setParamValue(name, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn btn-small"
        title="Choose a file or folder"
        onClick={async () => {
          const res = await window.electronAPI.pickWatchPath();
          if (res.ok && res.path) onChange({ path: res.path });
        }}
      >
        <FolderOpen size={12} />
      </button>
      <button type="button" className="btn btn-small btn-danger" onClick={onRemove}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function WatchTriggersSection() {
  const [triggers, setTriggers] = useState<WatchTrigger[]>([]);

  useEffect(() => {
    window.electronAPI.getWatchTriggers().then(setTriggers);
  }, []);

  async function persist(next: WatchTrigger[]) {
    setTriggers(next);
    await window.electronAPI.saveWatchTriggers(next);
  }

  return (
    <div className="settings-section">
      <div className="settings-section-title">File-watch triggers</div>
      <p className="field-hint">Run a snippet automatically whenever a chosen file or folder changes — a rebuild-on-save, for example.</p>
      {triggers.length > 0 && (
        <div className="groups-list" style={{ marginBottom: 8 }}>
          {triggers.map((t) => (
            <WatchTriggerRow
              key={t.id}
              trigger={t}
              snippets={state.snippets as Snippet[]}
              onChange={(patch) => persist(triggers.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))}
              onRemove={() => persist(triggers.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        className="btn btn-small"
        onClick={async () => {
          const res = await window.electronAPI.pickWatchPath();
          if (!res.ok || !res.path) return;
          await persist([...triggers, { id: newId('watch'), path: res.path, snippetId: '', debounceMs: 800, enabled: true, paramValues: null }]);
        }}
      >
        + Add file-watch trigger
      </button>
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

interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  steps: string[];
}

// The actual documentation solution item #5 asked for, beyond a tooltip on
// each control: one place gathering what every non-obvious feature does and
// the exact steps to turn it on, written against the real button/menu labels
// so it stays a literal walkthrough rather than a vague description. Kept as
// data (not JSX) so an accordion can render every topic identically instead
// of hand-writing the same <details> markup ten times over.
const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'groups',
    title: 'Groups',
    summary: 'Save a set of snippets once, then run them all together on demand — no reselecting every time.',
    steps: [
      'Open Groups from the header icon (or "Open Groups" in the command palette, Ctrl+K).',
      'Click "+ New group", give it a name and an optional description.',
      'Check every snippet that belongs in the group — use the filter box above the list if you have more than a handful.',
      'Save. The card now shows which snippets are in it and a Run/Edit/Duplicate row.',
      'Click "Run" — pick sequential or parallel and hit go, same run-configuration screen a manual batch run uses.',
    ],
  },
  {
    id: 'pipelines',
    title: 'Pipelines',
    summary: 'A branching graph of existing snippets — run different steps depending on whether the previous one succeeded.',
    steps: [
      'Open Pipelines from the header icon, "+ New pipeline".',
      'Use the toolbar\'s left group (Snippet / Delay / Gate / Sub-pipeline) to place steps on the canvas.',
      'Drag from a step\'s right-hand dot onto another step\'s left-hand dot to connect them — or select a step and use "Connect to…" in the inspector if a precise drag is fiddly.',
      'Click a connection\'s pill label to choose its condition (success / failure / always / exit code / output contains).',
      'Click a step to open the inspector: "Change step…" swaps its snippet, "Edit snippet…" opens that snippet\'s own settings directly, "Duplicate" copies it.',
      'Use "Auto-arrange" to lay everything out neatly, then Run — the canvas stays open and paints each step\'s live status as it runs.',
      'Optional: the toolbar\'s "Settings" button lets the whole pipeline run on its own schedule, and caps how many branches run at once.',
    ],
  },
  {
    id: 'variables',
    title: 'Global variables',
    summary: 'Give a value a name once, and it pre-fills any {{name}} placeholder that matches, across every snippet.',
    steps: [
      'Open Settings → Data → "Manage variables…".',
      'Click "+ Add variable", type a name (matching the {{name}} used inside a snippet) and its value.',
      'Toggle the eye icon to mark it secret — its value is then encrypted at rest and hidden in the UI.',
      'Toggle the link icon to compute the value by running a snippet instead of typing it by hand — pick a source snippet and whether it refreshes manually or on an interval.',
      'From now on, running any snippet with a matching {{name}} pre-fills it automatically — including unattended runs (scheduled, triggered, file-watch, pipeline steps), which resolve against these same saved variables instead of failing.',
    ],
  },
  {
    id: 'schedule',
    title: 'Scheduling a snippet',
    summary: 'Run a snippet automatically on an interval, daily at a set time, or on a cron expression.',
    steps: [
      'Open a snippet\'s editor, turn on "Run on a schedule".',
      'Pick Interval / Daily / Cron and fill in its one field.',
      'Save — the Schedule screen (header icon) now lists it, soonest-due first, with an Edit/Run now action on each row.',
      'A scheduled snippet with an unresolved {{placeholder}} pulls its value from a matching saved global variable instead of failing — see "Global variables" above.',
    ],
  },
  {
    id: 'triggers',
    title: 'HTTP triggers',
    summary: 'Run a snippet from outside the launcher — a scheduled task, a CI job, another script — with a local HTTP call.',
    steps: [
      'Settings → Automation → enable the trigger server.',
      'Copy the token (and the example URL, prefilled with the port and token).',
      'POST that URL with a real snippet id in place of <snippetId> — copy the id from the snippet\'s Details panel.',
      'Loopback-only by design (127.0.0.1) — never reachable from another machine.',
    ],
  },
  {
    id: 'file-watch',
    title: 'File-watch triggers',
    summary: 'Run a snippet automatically whenever a chosen file or folder changes — a rebuild-on-save, for example.',
    steps: [
      'Settings → Automation → "+ Add file-watch trigger", pick a path.',
      'Pick which snippet to run when that path changes, using the same snippet picker every other "pick a snippet" field uses.',
      'Adjust the debounce if the watched path changes in quick bursts (a build tool writing several files at once, for example).',
      'Like every other unattended path, an unresolved {{placeholder}} is filled from a saved global variable rather than failing the run.',
    ],
  },
  {
    id: 'background',
    title: 'Background / long-running processes',
    summary: 'Start/Stop/Restart controls instead of Run — for dev servers, `docker compose up`, `tail -f`, watchers.',
    steps: [
      'In a snippet\'s editor (single-command only), turn on "Run in background".',
      'Its card now shows Start/Stop instead of Run, streaming live output as it happens.',
      'Turn on "Restart automatically on crash" if the process should recover itself (capped at 5 restarts before giving up).',
      'Stopping — or quitting the app — always kills the whole process tree, not just the top-level shell, so nothing keeps running invisibly.',
    ],
  },
  {
    id: 'templates',
    title: 'Generate variants (templates)',
    summary: 'Turn one parameterized snippet into several concrete copies at once, instead of running it once per value by hand.',
    steps: [
      'Right-click a snippet that has at least one {{placeholder}} → "Generate variants…".',
      'Enter one value per line for each placeholder you want to vary.',
      'Review the count, then create — each combination becomes its own real, ready-to-run snippet.',
    ],
  },
  {
    id: 'libraries',
    title: 'Libraries',
    summary: 'Subscribe to a snippet feed hosted elsewhere and keep a local copy in sync.',
    steps: [
      'Settings → Libraries → paste the feed URL, subscribe.',
      'Its snippets appear in your list with a small badge marking where they came from.',
      'Re-sync anytime to pull in changes — pins/run counts/last-run on existing rows are kept, only the content updates.',
      'Removing a subscription deletes every snippet that still traces back to it.',
    ],
  },
  {
    id: 'batch',
    title: 'Batch runs & select mode',
    summary: 'Run several snippets together without saving them as a Group first.',
    steps: [
      'Click the checkmark icon in the header to enter select mode, then check the snippets you want.',
      'Click "Configure & run…" in the bar that appears — same order/mode screen a Group\'s "Run" uses.',
      'A parameterized snippet with nothing to fill it in is skipped and marked as such, not run with broken text.',
    ],
  },
];

function HelpSection() {
  return (
    <div className="settings-section">
      <div className="settings-section-title">How each feature works</div>
      <div className="help-topics">
        {HELP_TOPICS.map((t) => (
          <details className="help-topic" key={t.id}>
            <summary>{t.title}</summary>
            <p className="help-topic-summary">{t.summary}</p>
            <ol className="help-topic-steps">
              {t.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </div>
  );
}

// Categorized instead of one long vertical scroll — a sidebar of tabs, one
// scrolling pane on the right per category. "Automation" bundles the two
// sections about running things without a person watching (the HTTP
// trigger server and file-watch triggers) since they're the same mental
// category to a user even though they're two separate components/files.
const SETTINGS_CATEGORIES: { id: SettingsCategory; label: string; icon: typeof Palette }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'behavior', label: 'Behavior', icon: SlidersHorizontal },
  { id: 'automation', label: 'Automation', icon: Webhook },
  { id: 'updates', label: 'Updates', icon: RefreshCw },
  { id: 'libraries', label: 'Libraries', icon: BookMarked },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'help', label: 'Help', icon: HelpCircle },
];

export function SettingsModal() {
  const { open, initialCategory } = useSettingsStore();
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);
  useEffect(() => {
    if (open) setCategory(initialCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  return (
    <div className="screen">
      <div className="screen-header">
        <button type="button" className="icon-btn" title="Back" onClick={closeSettings}>
          <ArrowLeft size={16} />
        </button>
        <div className="screen-header-title">
          <h2>Settings</h2>
        </div>
      </div>
      <div className="settings-screen-layout">
        <nav className="settings-nav">
          {SETTINGS_CATEGORIES.map((c) => (
            <button
              type="button"
              key={c.id}
              className={'settings-nav-item' + (category === c.id ? ' active' : '')}
              onClick={() => setCategory(c.id)}
            >
              <c.icon size={15} />
              <span>{c.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-panel no-scrollbar">
          {category === 'appearance' && <AppearanceSection />}
          {category === 'behavior' && <BehaviorSection />}
          {category === 'automation' && (
            <>
              <TriggersSection />
              <WatchTriggersSection />
            </>
          )}
          {category === 'updates' && <UpdatesSection />}
          {category === 'libraries' && <LibrariesSection />}
          {category === 'data' && (
            <>
              <DataSection />
              <p className="field-hint" style={{ margin: '4px 0 12px' }}>
                Toggle the launcher anytime from the tray icon, or with the hotkey above.
              </p>
            </>
          )}
          {category === 'help' && <HelpSection />}
        </div>
      </div>
    </div>
  );
}
