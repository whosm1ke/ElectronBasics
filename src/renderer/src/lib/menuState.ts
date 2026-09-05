// menuState.ts — tracks whether ANY card's Radix context-menu or copy-as
// dropdown is currently open, across every Card instance (each mounts its
// own ContextMenu.Root/DropdownMenu.Root — there's no single global menu
// element the way the old document.body-appended menus.ts had). Counters,
// not a boolean, since Radix's onOpenChange for the menu about to open and
// the one about to close can fire in either order across two different
// instances; a plain overwrite would risk a stale "closed" from one card
// clobbering a genuinely-open menu on another.
//
// keyboard.ts's global Escape handler reads isAnyContextMenuOpen()/
// isAnyCopyDropdownOpen() to skip its "hide the window" fallback when a menu
// is open — Radix's own DismissableLayer already closes the menu itself on
// Escape (registered after keyboard.ts's listener, so keyboard.ts's check
// still sees "open" at the moment it runs); nothing here needs to actually
// close anything.
let contextMenuOpenCount = 0;
let copyDropdownOpenCount = 0;

export function setContextMenuOpen(open: boolean): void {
  contextMenuOpenCount += open ? 1 : -1;
}

export function isAnyContextMenuOpen(): boolean {
  return contextMenuOpenCount > 0;
}

export function setCopyDropdownOpen(open: boolean): void {
  copyDropdownOpenCount += open ? 1 : -1;
}

export function isAnyCopyDropdownOpen(): boolean {
  return copyDropdownOpenCount > 0;
}
