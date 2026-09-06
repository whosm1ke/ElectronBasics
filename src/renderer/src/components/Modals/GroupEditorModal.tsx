// GroupEditorModal.tsx — the Add/Edit-group form, split out of
// GroupsModal.tsx (which now only ever shows the groups list) into its own
// `.modal` — same reasoning EditorModal.tsx (the snippet editor) already
// gets one: a focused editing task, not a browsable screen, and a `.modal`
// layers cleanly above whatever's already open instead of needing to close
// and reopen it. See useGroupsStore.ts's own header comment for the
// Details-modal-over-modal exception and how it's handled.
import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { Snippet, Group, ScheduleType } from '@shared/types';
import { VALID_SCHEDULE_TYPES } from '@shared/types';
import { newId } from '../../lib/utils';
import { SnippetMultiPickerList, snippetPickerItems } from '../shared/SnippetPicker';
import { showToast } from '../../lib/toast';
import { bumpSnippetsVersion } from '../../store/useSnippetsVersion';
import { useGroupsStore, closeGroupEditor } from '../../store/useGroupsStore';
import { state } from '../../../modules/state';

export function GroupEditorModal() {
  const { editorOpen, editingId } = useGroupsStore();
  const groups = state.groups as Group[];
  const editingGroup = editingId ? groups.find((g) => g.id === editingId) : null;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('interval');
  const [intervalMinutes, setIntervalMinutes] = useState('60');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [cronExpr, setCronExpr] = useState('*/15 * * * *');

  // This component stays mounted for the life of the app (App.tsx renders
  // it unconditionally; `editorOpen` just toggles what it returns), unlike
  // the old ternary-based GroupEditorView it replaced (which got a genuine
  // fresh mount every time GroupsModal.tsx switched views) — so every field
  // above needs to re-seed itself from `editingGroup` on every actual open,
  // not just once at this component's own first render. Same "reset local
  // state when a persistently-mounted modal reopens" pattern SettingsModal.tsx
  // already uses for its own category tab.
  useEffect(() => {
    if (!editorOpen) return;
    setName(editingGroup?.name || '');
    setDescription(editingGroup?.description || '');
    setSelectedIds(new Set(editingGroup ? editingGroup.snippetIds : []));
    setSettingsOpen(false);
    setScheduleEnabled(Boolean(editingGroup?.schedule?.enabled));
    setScheduleType(editingGroup?.schedule?.type || 'interval');
    setIntervalMinutes(String(editingGroup?.schedule?.intervalMinutes || 60));
    setDailyTime(editingGroup?.schedule?.dailyTime || '09:00');
    setCronExpr(editingGroup?.schedule?.cronExpr || '*/15 * * * *');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorOpen, editingId]);

  if (!editorOpen) return null;

  const snippets = state.snippets as Snippet[];

  function toggleSnippet(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  async function save() {
    const finalName = name.trim() || 'Untitled group';
    const finalDescription = description.trim();
    const snippetIds = Array.from(selectedIds);
    if (snippetIds.length === 0) {
      showToast('Pick at least one snippet for this group', 'error');
      return;
    }
    const id = editingId || newId('grp');
    const existingSchedule = editingGroup?.schedule;
    const schedule = scheduleEnabled
      ? {
          enabled: true,
          type: scheduleType,
          intervalMinutes: Number(intervalMinutes) || 60,
          dailyTime: dailyTime || '09:00',
          cronExpr: cronExpr.trim() || '*/15 * * * *',
          lastRunAt: existingSchedule ? existingSchedule.lastRunAt : null,
          paramValues: existingSchedule ? existingSchedule.paramValues : null,
        }
      : null;
    const group: Group = { id, name: finalName, description: finalDescription, snippetIds, runCount: editingGroup?.runCount ?? 0, lastRunAt: editingGroup?.lastRunAt ?? null, schedule };
    const existingIdx = groups.findIndex((g) => g.id === id);
    if (existingIdx >= 0) groups[existingIdx] = group;
    else groups.push(group);
    state.groups = await window.electronAPI.saveGroups(groups);
    bumpSnippetsVersion();
    showToast(`Saved group "${finalName}"`);
    closeGroupEditor();
  }

  async function remove() {
    const idx = groups.findIndex((g) => g.id === editingId);
    if (idx < 0) return;
    const [removed] = groups.splice(idx, 1);
    state.groups = await window.electronAPI.saveGroups(groups);
    bumpSnippetsVersion();
    showToast(`Deleted group "${removed.name || '(untitled group)'}"`);
    closeGroupEditor();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeGroupEditor(); }}>
      <div className="modal modal-wide">
        <div className="modal-title-row">
          <h2>{editingGroup ? 'Edit group' : 'New group'}</h2>
          <button type="button" className={'btn btn-small' + (scheduleEnabled ? ' active' : '')} title="Schedule" onClick={() => setSettingsOpen((v) => !v)}>
            <SlidersHorizontal size={12} />
            <span>Schedule</span>
          </button>
        </div>

        {settingsOpen && (
          <div className="schedule-settings-panel schedule-settings-panel-inset">
            <label className="checkbox-row" htmlFor="groupScheduleToggle">
              <input type="checkbox" id="groupScheduleToggle" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
              <span>Run every snippet in this group on a schedule</span>
            </label>
            {scheduleEnabled && (
              <div>
                <div className="segmented">
                  {(['interval', 'daily', 'cron'] as ScheduleType[]).filter((t) => (VALID_SCHEDULE_TYPES as readonly string[]).includes(t)).map((t) => (
                    <button type="button" key={t} className={'segmented-btn' + (scheduleType === t ? ' active' : '')} onClick={() => setScheduleType(t)}>
                      {t === 'interval' ? 'Every N minutes' : t === 'daily' ? 'Daily at' : 'Cron'}
                    </button>
                  ))}
                </div>
                {scheduleType === 'interval' && (
                  <div className="schedule-field-row">
                    <input type="number" className="field-input" min={1} value={intervalMinutes} onChange={(e) => setIntervalMinutes(e.target.value)} />
                    <span className="field-hint">minutes</span>
                  </div>
                )}
                {scheduleType === 'daily' && (
                  <div className="schedule-field-row">
                    <input type="time" className="field-input" value={dailyTime} onChange={(e) => setDailyTime(e.target.value)} />
                  </div>
                )}
                {scheduleType === 'cron' && (
                  <div className="schedule-field-row">
                    <input type="text" className="field-input" placeholder="*/15 * * * *" value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
                  </div>
                )}
                <p className="field-hint">
                  A {'{{placeholder}}'} in any member snippet resolves against a saved global variable — there's nowhere to prompt for a value on a schedule.
                </p>
              </div>
            )}
          </div>
        )}

        <label className="field-label" htmlFor="groupNameInput">Name</label>
        <input type="text" id="groupNameInput" className="field-input" placeholder="e.g. Morning setup" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <label className="field-label" htmlFor="groupDescriptionInput" title="Optional">
          Description
        </label>
        <textarea id="groupDescriptionInput" className="field-textarea" rows={2} placeholder="What this group is for, when to run it…" value={description} onChange={(e) => setDescription(e.target.value)} />

        {editingGroup && (
          <>
            <label className="field-label">Group ID</label>
            <button
              type="button"
              className="details-link-btn"
              title="Copy — needed for an external trigger URL (Settings → Triggers → POST .../run-group/<groupId>)"
              onClick={async () => {
                await window.electronAPI.copyText(editingGroup.id);
                showToast('Group ID copied');
              }}
            >
              {editingGroup.id}
            </button>
          </>
        )}

        <label className="field-label">
          Snippets in this group
          <span className="field-label-count">{selectedIds.size} selected</span>
        </label>
        <SnippetMultiPickerList items={snippetPickerItems(snippets)} selectedIds={selectedIds} onToggle={toggleSnippet} />

        <div className="modal-actions modal-actions-left">
          {editingGroup ? (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
              Delete group
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn btn-primary" onClick={save}>
            Save group
          </button>
        </div>
      </div>
    </div>
  );
}
