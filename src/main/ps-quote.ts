// ps-quote.ts — wraps a string as a single-quoted PowerShell literal.
// Shared by the elevation wrapper (shell/exec.ts) and the terminal launcher
// (shell/terminal.ts), both of which build a PowerShell -Command string.
export function psQuote(value: unknown): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}
