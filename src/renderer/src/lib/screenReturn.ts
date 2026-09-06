// screenReturn.ts — generic "which screen opened this pipeline editor, so
// Back/Save/Escape can jump straight back to it" tracking, used by
// usePipelinesStore.ts's own openPipelineEditorByIdFrom(). The Pipelines
// editor is still a full-window `.screen` (unlike the group editor, which
// moved to a `.modal` — GroupEditorModal.tsx — specifically so it would
// never need this kind of tracking at all: a modal layers cleanly above
// whatever's already open and needs no "where do I go back to" memory).
//
// Before this existed, that memory was one hardcoded field per store
// (`returnToDetailsId`) that only knew how to reopen Details — correct for
// DetailsModal.tsx's own "used in pipeline" link, but wrong the moment a
// second screen (ScheduleModal.tsx's own pipeline Edit button) grew the
// same kind of link: Back always landed on the plain pipelines list instead
// of wherever the editor was actually opened from. `ScreenReturnTarget`
// replaces that one field with a small tagged union naming ANY screen that
// can send you into the pipeline editor — add a case here (and its own
// opener import) the next time another screen grows a link like this.
import type { Snippet } from '@shared/types';
import { state } from '../../modules/state';
import { openDetails } from '../store/useDetailsStore';
import { openScheduleOverview } from '../store/useScheduleStore';
import { markScreenToScreenNav } from './screenAnimation';

export type ScreenReturnTarget = { screen: 'details'; snippetId: string } | { screen: 'schedule' };

/** Reopens whichever screen `target` names. A no-op for `null` — the editor was opened normally (from its own list), so there's nothing to return to. */
export function reopenScreen(target: ScreenReturnTarget | null): void {
  if (!target) return;
  // Reopening a screen this way always means the one that just closed was
  // standing in for it (a screen-to-screen jump) — see screenAnimation.ts's
  // own header comment for why that distinction matters. `target.screen ===
  // 'details'` reopens a `.modal`, not a `.screen` (no fade-in to suppress
  // there), but marking unconditionally is harmless — a modal ignores it.
  markScreenToScreenNav();
  if (target.screen === 'details') {
    const snippet = (state.snippets as Snippet[]).find((s) => s.id === target.snippetId);
    if (snippet) openDetails(snippet);
    return;
  }
  openScheduleOverview();
}
