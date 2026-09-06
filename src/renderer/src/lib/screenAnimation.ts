// screenAnimation.ts — suppresses a full-window `.screen`'s own fade-in
// animation for exactly one open, specifically a screen-to-screen jump
// (Schedule -> a group/pipeline editor, or back again) rather than opening
// fresh from the main list.
//
// `.screen` normally fades in from `opacity: 0` over 150ms (style.css's
// `fade-in` keyframes) — a nice touch when it's genuinely replacing the
// main list, but the OLD screen in a screen-to-screen jump disappears
// instantly (no fade-out) while the NEW one starts fully transparent, so
// for a chunk of that 150ms neither screen is opaque and the main list
// flashes through underneath. Every full-window screen component
// (Groups/Pipelines/Schedule/Health/Settings/TerminalHistory) calls
// `useScreenOpenAnimation(open)` and adds `screen-no-anim` to its outer div
// when it returns true; `closeAllScreens()` (lib/screens.ts) and
// `reopenScreen()` (lib/screenReturn.ts) — the only two places that close
// an already-open screen specifically to open a different one in its place
// — call `markScreenToScreenNav()` right before doing so.
//
// Deliberately a standalone leaf module with no store imports: both
// `screens.ts` and `screenReturn.ts` need to call `markScreenToScreenNav()`,
// and several of the group/pipeline stores those two modules already import
// from would otherwise form an import cycle if this lived inside either of
// them instead (see CLAUDE.md's "no cycles" rule).
import { useRef } from 'react';

let skipNextScreenAnim = false;

/** Call right before closing an already-open screen to open a different one in its place. Left uncalled (the flag stays false) when a screen opens fresh from the plain main list — that's the one case the fade-in is actually wanted. */
export function markScreenToScreenNav(): void {
  skipNextScreenAnim = true;
}

function consumeSkipScreenAnimation(): boolean {
  const v = skipNextScreenAnim;
  skipNextScreenAnim = false;
  return v;
}

/**
 * Returns whether the `.screen` currently opening should skip its fade-in.
 * Every one of these screen components stays mounted for the life of the
 * app (App.tsx renders them unconditionally; only their own `open` flag
 * toggles what they return), so a plain `useState(initializer)` — which
 * only ever runs on this component's true first render — can't re-capture
 * the flag on a LATER open. Comparing `open` against a ref of its previous
 * value, during render, is what lets this re-decide (and freeze, via the
 * other ref) exactly once per close→open transition instead.
 */
export function useScreenOpenAnimation(open: boolean): boolean {
  const skipRef = useRef(false);
  const prevOpenRef = useRef(open);
  if (open && !prevOpenRef.current) {
    skipRef.current = consumeSkipScreenAnimation();
  }
  prevOpenRef.current = open;
  return skipRef.current;
}
