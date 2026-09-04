// legacyMounts.tsx — mounts each ported-to-React piece directly into its
// pre-existing static container in index.html (#snippetList, #tagFilters,
// #favoritesBar), rather than replacing those elements or nesting a new
// #reactRoot inside them. Each is its own React root — cheap, and it keeps
// this file a plain, growable list rather than one big component owning
// unrelated parts of the page. Called once from main.tsx.
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { SnippetList } from './components/Card/SnippetList';
import { TagFilters } from './components/TagFilters';
import { FavoritesBar } from './components/FavoritesBar';

function mount(id: string, node: React.ReactNode): void {
  const container = document.getElementById(id);
  if (!container) {
    console.error(`legacyMounts: #${id} missing from index.html`);
    return;
  }
  createRoot(container).render(<StrictMode>{node}</StrictMode>);
}

export function mountLegacyReplacements(): void {
  mount('snippetList', <SnippetList />);
  mount('tagFilters', <TagFilters />);
  mount('favoritesBar', <FavoritesBar />);
}
