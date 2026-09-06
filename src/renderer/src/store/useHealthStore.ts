// useHealthStore.ts — open/closed state for the Health panel (the "screen"
// that surfaces broken cwds, dangling run-before/run-after references, and
// recently-failing snippets). No list-view/editor-view split like
// Groups/Pipelines — this screen is read-only, it only ever links out to an
// existing editor rather than owning one of its own.
import { create } from 'zustand';

interface HealthState {
  open: boolean;
}

const useStore = create<HealthState>(() => ({ open: false }));

export function useHealthStore(): HealthState {
  return useStore();
}

export function openHealth(): void {
  useStore.setState({ open: true });
}

export function closeHealth(): void {
  useStore.setState({ open: false });
}

export function isHealthOpen(): boolean {
  return useStore.getState().open;
}
