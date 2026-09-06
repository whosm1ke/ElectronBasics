// useScheduleStore.ts — open/closed state for the Schedule overview screen.
// Read-only like Health — it only computes next-run times from
// state.snippets and links out to the real editor, same
// discoverable-not-only-path stance the rest of this app takes.
import { create } from 'zustand';

interface ScheduleOverviewState {
  open: boolean;
}

const useStore = create<ScheduleOverviewState>(() => ({ open: false }));

export function useScheduleOverviewStore(): ScheduleOverviewState {
  return useStore();
}

export function openScheduleOverview(): void {
  useStore.setState({ open: true });
}

export function closeScheduleOverview(): void {
  useStore.setState({ open: false });
}

export function isScheduleOverviewOpen(): boolean {
  return useStore.getState().open;
}
