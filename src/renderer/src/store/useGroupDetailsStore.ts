// useGroupDetailsStore.ts — open/closed state + the currently-shown group
// for the read-only Group Details modal (GroupDetailsModal.tsx). Mirrors
// useDetailsStore.ts's own shape for a snippet's Details panel, minus the
// pendingReturnId dance — nothing currently navigates away FROM this modal
// the way a snippet's Details panel does (its group/pipeline links jump
// straight into the real editor, not through here), so there's nothing to
// remember coming back to yet.
import { create } from 'zustand';
import type { Group } from '@shared/types';

interface GroupDetailsState {
  group: Group | null;
}

const useStore = create<GroupDetailsState>(() => ({ group: null }));

export function useGroupDetailsStore(): GroupDetailsState {
  return useStore();
}

export function openGroupDetails(group: Group): void {
  useStore.setState({ group });
}

export function closeGroupDetails(): void {
  useStore.setState({ group: null });
}
