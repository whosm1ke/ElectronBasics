// ThemedCombobox.tsx — a themed typeahead text input + suggestion dropdown,
// shared by every free-text-with-suggestions field in the app (EditorModal's
// tag input, "Run after this one"/"Run before this one" snippet pickers).
// Replaces the old native <input list="..."> + <datalist> pattern — a
// browser's own datalist popup is entirely unstyled by CSS (no way to theme
// it to match this app's dark UI at all, unlike a native <select>'s arrow
// which at least respects *some* styling), so it looked jarringly
// out-of-place against everything else. Visually matches ThemedSelect's
// `.select-content`/`.select-item` look (border, radius, hover highlight)
// for consistency, but stays a real, freely-typable text input underneath —
// unlike ThemedSelect (@radix-ui/react-select), which only ever picks from
// a fixed option list, every field this is used for tolerates arbitrary
// typed text alongside its suggestions (a brand-new tag; a hand-typed
// snippet name resolved case-insensitively at save time — see
// EditorModal.tsx's resolveSnippetRef).
//
// Not built on @radix-ui/react-popover — Radix has no Combobox primitive as
// of writing, and pulling in Popover for just "a panel anchored directly
// below an input, no viewport-flip needed" would be more dependency than
// this warrants. Positioning is a plain `position: absolute` panel under a
// `position: relative` wrapper (see .combobox* in style.css) — the same
// "anchor a floating panel with plain CSS + an outside-mousedown listener"
// shape as PipelinesModal.tsx's SnippetPickerMenu, just styled differently.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface ComboboxOption {
  value: string;
  label: ReactNode;
  /** Plain-text form of `label`, used for filtering when label is JSX rather than a bare string. Defaults to `value`. */
  filterText?: string;
}

interface ThemedComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

export function ThemedCombobox({ id, value, onChange, options, placeholder, emptyLabel = 'No matches', className }: ThemedComboboxProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const query = value.trim().toLowerCase();
  const filtered = query ? options.filter((o) => (o.filterText ?? o.value).toLowerCase().includes(query)) : options;

  return (
    <div className={'combobox' + (className ? ` ${className}` : '')} ref={wrapRef}>
      <input
        type="text"
        id={id}
        className="field-input"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && options.length > 0 && (
        <div className="combobox-content select-content">
          <div className="combobox-viewport select-viewport no-scrollbar">
            {filtered.length === 0 ? (
              <div className="combobox-empty">{emptyLabel}</div>
            ) : (
              filtered.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className="select-item combobox-item"
                  // Fires before the input's onBlur/the outside-mousedown
                  // handler above would otherwise close this first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
