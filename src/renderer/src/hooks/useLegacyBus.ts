// useLegacyBus.ts — bridges the old modules/events.js EventTarget bus (and
// state.js's plain mutable object) into React re-renders, for components
// ported ahead of state.js itself. Every not-yet-ported module keeps
// mutating modules/state.js's fields and calling emitSnippetsChanged()/
// emitGroupsChanged() exactly as before; a component using this hook just
// re-renders (reading the current state.js values fresh each render) when
// either fires. `bump()` is exposed for cases where a ported component
// itself needs to force a redraw after mutating state.js directly (e.g.
// selection change) without going through the full "snippets changed"
// event (which would also make tags/favorites/cards all re-derive filters).
//
// This is deliberately a bridge, not the final architecture — it goes away
// once state.js's fields move into a real Zustand store (see the migration
// plan's later phases) and components just subscribe to that store
// directly instead.
import { useEffect, useReducer, useCallback } from 'react';
import { onSnippetsChanged, onGroupsChanged, emitSnippetsChanged } from '../lib/events';

const bumpReducer = (n: number, _action?: unknown) => n + 1;

/** Re-renders whenever modules/events.js's snippets-changed or groups-changed fires. Returns a manual `bump()` for local-only redraws (e.g. selection). */
export function useLegacyBus(): () => void {
  const [, forceUpdate] = useReducer(bumpReducer, 0);

  useEffect(() => {
    onSnippetsChanged(forceUpdate);
    onGroupsChanged(forceUpdate);
    // onSnippetsChanged/onGroupsChanged (events.js) never unsubscribe — same
    // as every other listener registered through that bus today (it has no
    // removeEventListener wrapper); components using this hook are mounted
    // for the app's lifetime, same as the modules it replaces, so this
    // matches existing behavior rather than being a new leak.
  }, []);

  return useCallback(() => forceUpdate(), []);
}

/** Mutating modules/state.js directly, then calling this, is the ported-component equivalent of the old "mutate state.snippets, call persistSnippets()" pattern — use the real persistSnippets()/emitSnippetsChanged() from snippets-store.js instead wherever a change should also reach disk. This is only for the rare local-state-only tweak (e.g. this hook's own bump) that doesn't. */
export { emitSnippetsChanged };
