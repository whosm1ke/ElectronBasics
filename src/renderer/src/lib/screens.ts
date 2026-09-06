// screens.ts — every full-window `.screen` this app has (see style.css),
// closed as a group wherever something needs to guarantee "at most one
// screen open" before opening a different one. Unlike a `.modal-overlay`
// (z-index 150, always renders above every `.screen`), two `.screen`s share
// the exact same z-index — whichever is later in App.tsx's own JSX order
// paints on top, not the one that opened more recently, so opening one
// while another is still open just renders it invisibly behind the other
// rather than replacing it. DetailsModal.tsx's group/pipeline links are the
// reason this exists: Details itself is a modal (layers fine above
// whatever's open on its own), but it can be reached from more than one
// screen (Health, the main list with nothing open) and doesn't track which
// one — closing every screen before it opens Groups/Pipelines for real
// (rather than behind whatever's already there) is simpler and more robust
// than teaching Details which specific screen to close.
import { closeHealth } from '../store/useHealthStore';
import { closeScheduleOverview } from '../store/useScheduleStore';
import { closeSettings } from '../store/useSettingsStore';
import { closeTerminalHistory } from '../store/useTerminalHistoryStore';
import { closeGroups } from '../store/useGroupsStore';
import { closePipelines } from '../store/usePipelinesStore';
import { markScreenToScreenNav } from './screenAnimation';

export function closeAllScreens(): void {
  // Whichever screen opens right after this is a screen-to-screen jump, not
  // a fresh open from the main list — see screenAnimation.ts's own header
  // comment for why that distinction matters.
  markScreenToScreenNav();
  closeHealth();
  closeScheduleOverview();
  closeSettings();
  closeTerminalHistory();
  closeGroups();
  closePipelines();
}
