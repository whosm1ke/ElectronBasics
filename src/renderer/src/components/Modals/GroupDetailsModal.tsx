// GroupDetailsModal.tsx — a read-only info panel for one Group: its own ID
// (needed for an HTTP trigger's `/run-group/:groupId` URL — see Settings →
// Help → "HTTP triggers"), name, description, schedule (if any), and every
// member snippet with its own copyable ID, all in one place instead of
// having to open the group's editor and cross-reference each member
// separately. Mirrors DetailsModal.tsx's own shape (a `.modal`, not a
// `.screen` — this is a quick lookup, not a workspace) and shares its
// DetailsRow component for the label/value rows.
import type { Group, Snippet } from '@shared/types';
import { Layers } from 'lucide-react';
import { snippetIcon, timeAgo } from '../../lib/utils';
import { scheduleDescription } from '../../lib/scheduleOverview';
import { useGroupDetailsStore, closeGroupDetails } from '../../store/useGroupDetailsStore';
import { state } from '../../../modules/state';
import { DetailsRow as Row } from '../shared/DetailsRow';

export function GroupDetailsModal() {
  const { group } = useGroupDetailsStore();
  if (!group) return null;

  const snippets = state.snippets as Snippet[];
  const members = group.snippetIds.map((id) => snippets.find((s) => s.id === id)).filter((s): s is Snippet => Boolean(s));

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeGroupDetails(); }}>
      <div className="modal modal-wide">
        <h2>
          <Layers size={16} /> {group.name || '(untitled group)'}
        </h2>
        <div className="details-body">
          {group.description && <Row label="Description">{group.description}</Row>}

          {group.schedule?.enabled && (
            <>
              <div className="details-section-heading">Schedule</div>
              <Row label="Runs">{scheduleDescription(group.schedule)}</Row>
              {group.schedule.lastRunAt && <Row label="Last scheduled run">{timeAgo(group.schedule.lastRunAt)}</Row>}
            </>
          )}

          <div className="details-section-heading">
            Snippets in this group ({members.length}{members.length < group.snippetIds.length ? ' · some deleted' : ''})
          </div>
          {members.length === 0 ? (
            <Row label="">No snippets left in this group.</Row>
          ) : (
            <div className="groups-list">
              {members.map((s) => (
                <div className="group-row" key={s.id}>
                  <div className="group-row-info">
                    <div className="group-row-name">
                      {snippetIcon(s)} {s.name || '(untitled)'}
                    </div>
                    <div className="group-row-count">{s.tag}</div>
                  </div>
                  <button
                    type="button"
                    className="details-link-btn"
                    title="Copy snippet ID"
                    onClick={() => window.electronAPI.copyText(s.id)}
                  >
                    {s.id}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="details-section-heading">Stats</div>
          <Row label="Run count">{String(group.runCount || 0)}</Row>
          {group.lastRunAt && <Row label="Last run">{timeAgo(group.lastRunAt)}</Row>}
          <Row label="Group ID">
            <button
              type="button"
              className="details-link-btn"
              title="Copy — needed for an external trigger URL (Settings → Triggers → POST .../run-group/<groupId>)"
              onClick={() => window.electronAPI.copyText(group.id)}
            >
              {group.id}
            </button>
          </Row>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={closeGroupDetails}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
