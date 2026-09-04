// Shared shell-type constant/union — mirrors VALID_SHELLS in
// src/main/storage/snippets.js and src/main/shell/exec.js's
// SHELL_CANDIDATES keys exactly. Keep in sync if either changes; nothing
// generates this from the other, it's a hand-kept mirror by design (see
// CLAUDE.md's sanitizeSnippet-is-the-schema-source-of-truth note — this file
// is the TS *view* of that source of truth, not a replacement for it).
export const VALID_SHELLS = ['powershell', 'cmd', 'gitbash', 'wsl', 'node', 'python'] as const;

export type ShellType = (typeof VALID_SHELLS)[number];
