// TemplateModal.tsx — "Generate variants": turns one parameterized snippet
// (the "template") into several concrete, ready-to-run snippets at once —
// pick which `{{placeholder}}` varies, paste one value per line, and each
// line becomes its own new snippet with that one placeholder substituted
// (any OTHER placeholder in the command is left as-is, still fillable per
// run the normal way). A small `.modal` dialog, not a full screen — this is
// a quick one-off action tied to a single snippet, the same scale as
// DetailsModal/VariablesModal.
import { useState } from 'react';
import type { Snippet } from '@shared/types';
import { extractPlaceholders, runnableTextOf, substituteAll, newId, snippetIcon } from '../../lib/utils';
import { showToast } from '../../lib/toast';
import { ThemedSelect } from '../shared/ThemedSelect';
import { useTemplateStore, closeTemplateGenerator } from '../../store/useTemplateStore';
import { state } from '../../../modules/state';
import { persistSnippets } from '../../lib/snippetsStore';

export function TemplateModal() {
  const { snippet } = useTemplateStore();
  const placeholders = snippet ? extractPlaceholders(runnableTextOf(snippet)) : [];
  const [placeholderName, setPlaceholderName] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [namePattern, setNamePattern] = useState('');

  if (!snippet) return null;
  const activePlaceholder = placeholderName || placeholders[0] || '';
  const values = valuesText.split('\n').map((v) => v.trim()).filter(Boolean);

  async function generate() {
    if (!activePlaceholder) {
      showToast('This snippet has no {{placeholder}} to vary', 'error');
      return;
    }
    if (values.length === 0) {
      showToast('Add at least one value, one per line', 'error');
      return;
    }
    const pattern = namePattern.trim() || `${snippet!.name} ({{value}})`;
    const created: Snippet[] = values.map((value) => ({
      ...snippet!,
      id: newId('snip'),
      name: pattern.replace(/\{\{\s*value\s*\}\}/gi, value) || `${snippet!.name} (${value})`,
      command: substituteAll(snippet!.command, { [activePlaceholder]: value }),
      steps: snippet!.steps ? snippet!.steps.map((s) => substituteAll(s, { [activePlaceholder]: value })) : null,
      pinned: false,
      runCount: 0,
      lastRunAt: null,
      externalSource: null,
    }));
    (state.snippets as Snippet[]).push(...created);
    await persistSnippets();
    showToast(`Created ${created.length} snippet${created.length === 1 ? '' : 's'} from "${snippet!.name}"`);
    setValuesText('');
    setNamePattern('');
    closeTemplateGenerator();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeTemplateGenerator(); }}>
      <div className="modal">
        <h2>Generate variants</h2>
        <p className="field-hint">
          From {snippetIcon(snippet)} <strong>{snippet.name}</strong> — pick which placeholder varies, then list one value per line to create that many snippets at once.
        </p>

        {placeholders.length === 0 ? (
          <p className="field-hint">This snippet has no <code>{'{{placeholder}}'}</code> — nothing to vary.</p>
        ) : (
          <>
            {placeholders.length > 1 && (
              <>
                <label className="field-label">Placeholder to vary</label>
                <ThemedSelect value={activePlaceholder} options={placeholders.map((p) => ({ value: p, label: p }))} onChange={setPlaceholderName} />
              </>
            )}
            <label className="field-label" htmlFor="templateValues" title="One per line">
              Values
            </label>
            <textarea
              id="templateValues"
              className="field-textarea"
              rows={6}
              placeholder={`server1.example.com\nserver2.example.com\nserver3.example.com`}
              value={valuesText}
              onChange={(e) => setValuesText(e.target.value)}
            />
            <label className="field-label" htmlFor="templateNamePattern" title="Optional — {{value}} is replaced per snippet">
              Name pattern
            </label>
            <input
              type="text"
              id="templateNamePattern"
              className="field-input"
              placeholder={`${snippet.name} ({{value}})`}
              value={namePattern}
              onChange={(e) => setNamePattern(e.target.value)}
            />
            {values.length > 0 && <p className="field-hint">Will create {values.length} snippet{values.length === 1 ? '' : 's'}.</p>}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={closeTemplateGenerator}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={generate} disabled={placeholders.length === 0}>
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
