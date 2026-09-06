// InfoHint.tsx — a small "hover for details" affordance: an info glyph that
// carries its explanation as a native `title` tooltip instead of a
// permanently-visible line of text. Standard replacement for a
// `<span className="field-hint">…</span>`/`<p className="field-hint">…</p>`
// wherever that text was explaining a screen or a control rather than
// showing a live value (a live value like "3 selected" or "seconds" stays a
// plain visible field-hint — only free-standing explanatory prose moved to
// this) — keeps information-dense screens (canvas toolbars, card grids,
// screen headers) visually quiet while the explanation stays one hover away.
import { Info } from 'lucide-react';

export function InfoHint({ text, size = 13 }: { text: string; size?: number }) {
  return (
    <span className="info-hint" title={text}>
      <Info size={size} />
    </span>
  );
}
