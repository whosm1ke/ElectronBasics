// icons.ts — iconSvg()/starIconSvg() raw-SVG-string lookups, used only by
// the app's imperative-DOM modules (menus.ts, processEngine.ts, runEngine.ts
// — see their own header comments on why they build markup via innerHTML
// rather than JSX). Real .tsx components render icons directly as JSX via
// lucide-react (`import { Play } from 'lucide-react'`) instead of going
// through this file — see CLAUDE.md's icon-set section.
//
// Sourced from `lucide` (the framework-agnostic sibling of `lucide-react` —
// same maintained icon set, exposed as plain [tag, attrs][] node data
// instead of React components) rather than hand-drawn SVG paths, so the two
// packages can never visually drift from each other. ICON_MAP's `w`/`h`
// preserve each glyph's previous hand-rolled pixel size; `solid` marks the
// handful that were filled shapes with no stroke (play/stop).
import { icons as lucideNodes, type IconNode } from 'lucide';

const ICON_MAP: Record<string, { node: IconNode; w: number; h: number; solid?: boolean }> = {
  play: { node: lucideNodes.Play, w: 13, h: 13, solid: true },
  copy: { node: lucideNodes.Copy, w: 13, h: 13 },
  edit: { node: lucideNodes.Pencil, w: 13, h: 13 },
  duplicate: { node: lucideNodes.CopyPlus, w: 13, h: 13 },
  trash: { node: lucideNodes.Trash2, w: 13, h: 13 },
  check: { node: lucideNodes.Check, w: 13, h: 13 },
  warning: { node: lucideNodes.TriangleAlert, w: 13, h: 13 },
  rerun: { node: lucideNodes.RotateCcw, w: 12, h: 12 },
  admin: { node: lucideNodes.Lock, w: 12, h: 12 },
  folder: { node: lucideNodes.Folder, w: 12, h: 12 },
  terminal: { node: lucideNodes.SquareTerminal, w: 12, h: 12 },
  clock: { node: lucideNodes.Clock, w: 11, h: 11 },
  diff: { node: lucideNodes.GitCompare, w: 11, h: 11 },
  info: { node: lucideNodes.Info, w: 11, h: 11 },
  eye: { node: lucideNodes.Eye, w: 12, h: 12 },
  chevronDown: { node: lucideNodes.ChevronDown, w: 11, h: 11 },
  close: { node: lucideNodes.X, w: 11, h: 11 },
  link: { node: lucideNodes.Link, w: 12, h: 12 },
  layers: { node: lucideNodes.Layers, w: 12, h: 12 },
  stop: { node: lucideNodes.Square, w: 12, h: 12, solid: true },
};

function nodeToSvgChildren(nodes: IconNode): string {
  return nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
}

export function iconSvg(name: string): string {
  const spec = ICON_MAP[name];
  if (!spec) return '';
  const paint = spec.solid
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" width="${spec.w}" height="${spec.h}" ${paint}>${nodeToSvgChildren(spec.node)}</svg>`;
}

export function starIconSvg(filled: boolean): string {
  const paint = filled
    ? 'fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" width="15" height="15" ${paint}>${nodeToSvgChildren(lucideNodes.Star)}</svg>`;
}
