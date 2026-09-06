// useTemplateStore.ts — open/closed state + the source snippet for the
// "Generate variants" modal (TemplateModal.tsx): turns one parameterized
// snippet into several concrete ones, one per value typed in.
import { create } from 'zustand';
import type { Snippet } from '@shared/types';

interface TemplateState {
  snippet: Snippet | null;
}

const useStore = create<TemplateState>(() => ({ snippet: null }));

export function useTemplateStore(): TemplateState {
  return useStore();
}

export function openTemplateGenerator(snippet: Snippet): void {
  useStore.setState({ snippet });
}

export function closeTemplateGenerator(): void {
  useStore.setState({ snippet: null });
}

export function isTemplateGeneratorOpen(): boolean {
  return useStore.getState().snippet !== null;
}
