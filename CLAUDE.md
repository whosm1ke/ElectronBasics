# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Snippet Runner** — a local, Windows-only shell snippet launcher in the style of Raycast/Spotlight: a frameless, always-on-top, global-hotkey-activated Electron window for storing, searching, and running one-liners or multi-step sequences across **six shells** (PowerShell, CMD, Git Bash, WSL, Node.js, Python), with run history, tags, pinning, parameterized commands, reusable/environment variables, saved snippet groups, branching visual pipelines, background/long-running processes, scheduling, batch runs with live output, run-after chaining, assertions, themeable UI, automatic backups, and self-update from GitHub Releases.

**There is no destructive-command guard anywhere in this app.** An earlier version had one (pattern-matched confirm-click in the UI, re-enforced in the main process, hard-skipped by the scheduler); it was deliberately removed in full — no trace of it should reappear. A command runs exactly when the user triggers it — directly, scheduled, chained, or batched — full stop. If you're asked to add any kind of "is this command dangerous" check back, don't; point back to this file instead.

There is no bundler, no framework, and no build step in either process.

## Commands

- **Run the app**: `npm start` (runs `electron .`)
- There is no lint script or test script. `electron-builder` is present as a devDependency with `build`/`build:portable` scripts (`electron-builder --win` / `--win portable`) — packaging works but has no CI wired up.
- **Cutting a release** (for the in-app updater — see `src/main/updater.js` below): `npm run release`. The version bump is automatic — `release`/`release:minor`/`release:major` each run `npm version <patch|minor|major> --no-git-tag-version` (bumps `package.json`+`package-lock.json`, no git commit/tag) before `electron-builder --win --publish always`, specifically so a forgotten manual version bump can't ship a release electron-updater won't recognize as newer. Default to plain `npm run release` (patch) unless you deliberately want a bigger jump. This needs a `GH_TOKEN`/`GITHUB_TOKEN` env var (a GitHub PAT with at least `public_repo`) set on *this* machine — it uploads the NSIS installer + `latest.yml` to a GitHub Release on this repo (`build.publish` in `package.json`). Installed copies elsewhere need no token to read a public repo's releases; they only ever check/download, never publish. Commit and push the resulting `package.json`/`package-lock.json` version bump afterward so the repo matches what shipped.
- **`electron-updater` must stay a `dependencies` entry, never `devDependencies`.** `electron-builder` only packs production dependencies into the built app by default — if it's under `devDependencies`, `npm start` still works fine (local `node_modules` has everything either way) but the *installed* app silently ships without it and `require('electron-updater')` throws the moment Settings tries to check for updates. This exact mistake has happened once already; it's an easy one for a package-manager UI or a careless `npm install` to reintroduce.
- To verify a change without a test suite, actually launch the app (`npm start`) and exercise it. For a quick syntax check first:
  - `src/main/**/*.js` and `src/preload/**/*.js` are plain CommonJS: `node --check <file>`.
  - `src/renderer/modules/*.js` and `src/renderer/app.js` are native ES modules, but `package.json` declares `"type": "commonjs"`, so plain `node --check` can't parse `import`/`export`. Pipe the file through stdin with the module flag instead: `node --input-type=module --check < src/renderer/modules/whatever.js`.

## Architecture

### Three-process split (standard Electron security model), each its own folder

- **`src/main/`** — the only side with Node/OS access. `index.js` is a thin entry point that does nothing but wire the pieces together (create the window/tray/icon, register the hotkey with fallback, register IPC handlers, start the scheduler, handle `app` lifecycle events) — no logic of its own lives there. Everything else in `src/main/` is one concern per file: `window.js` (the BrowserWindow), `tray.js`, `hotkey.js`, `icon.js` (the hand-rolled PNG encoder), `ipc.js` (every `ipcMain` handler, delegating out), `scheduler.js` (the background tick), `shell/exec.js` (the multi-shell execution engine), `shell/terminal.js` (opening a real terminal window), `storage/*.js` (one file per persisted JSON concern), plus tiny shared leaves (`paths.js`, `id.js`, `ps-quote.js`, `env-utils.js`).
- **`src/preload/index.js`** — the *only* bridge between main and renderer. Runs with Node access but exposes nothing except a curated `window.electronAPI` object via `contextBridge.exposeInMainWorld`. `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` in `BrowserWindow` — the renderer never gets a raw `ipcRenderer` or `require`.
- **`src/renderer/`** — pure DOM/UI code, **no Node access**, everything it needs from the OS goes through `window.electronAPI.*`, which round-trips to an `ipcMain.handle`/`ipcMain.on` in `src/main/ipc.js`. `index.html` + `style.css` are the shell; `app.js` is the entry point; `modules/` holds one native ES module per concern (see below). When adding a capability, wire it in all three places: an `ipcMain` handler in `src/main/ipc.js`, a matching method on `electronAPI` in `src/preload/index.js`, and the call site in the relevant renderer module.

### The renderer is native ES modules, no bundler

`index.html` loads `app.js` via `<script type="module">`; every file under `src/renderer/modules/` is `import`/`export`, loaded directly by Chromium with no build step. This works *because* the module graph is kept small and one-directional — see **Clean code in this project** below before adding a new module or a new cross-module import.

### Multi-shell command execution (`src/main/shell/exec.js`)

`runShellCommand(command, {cwd, shell, elevated, env, stdin, debug})` is the single execution engine, built on `child_process.execFile` with explicit argv arrays per shell — **not** `exec()`'s shell-string convenience, which on Windows always wraps the command as `<shell> /d /s /c "<command>"` regardless of which binary you name; that convention is only correct for `cmd.exe` (and happens to work for `powershell.exe`), but would silently misinterpret it for `bash.exe`/`wsl.exe`/`node`/`python`. `buildInvocation(command, shellType)` returns `{candidates, args}` per shell:

- **powershell** (default): `powershell.exe -NoProfile -NonInteractive -Command <preamble+command>` — the UTF-8 preamble (`[Console]::OutputEncoding = ...; chcp 65001`) is load-bearing, don't strip it.
- **cmd**: `cmd.exe /d /s /c "chcp 65001 > nul && <command>"`.
- **gitbash**: `bash.exe -lc <command>` — `candidates` also tries the two standard Git-for-Windows absolute paths, since `bash.exe` often isn't on PATH even when `git.exe` is.
- **wsl**: `wsl.exe -e bash -lc <command>`.
- **node** / **python**: `node -e <command>` / `python -c <command>` — Python additionally gets `PYTHONIOENCODING=utf-8` and `PYTHONUTF8=1` forced into its env so output decodes correctly on Windows.

There is no "is this command dangerous" check anywhere in this file, or anywhere in the app — running a command is entirely the caller's responsibility (see the top of the file for the comment making that explicit).

`candidates` is a fallback list tried in order via ENOENT retry (see the `tryNext()` closure) — if a shell binary isn't found, the *next* candidate is tried before giving up with a clear "could not find a … executable" error, rather than a bare ENOENT.

`elevated: true` only works for `shell: 'powershell'` — `runShellCommand` returns an explicit error for every other shell rather than silently running the command as the wrong interpreter. It wraps the command in a non-elevated PowerShell script that calls `Start-Process -Verb RunAs -Wait -RedirectStandardOutput/-RedirectStandardError` to temp files, then reads them back and stitches stdout/stderr apart using the `ELEVATED_MARKER` sentinel. Keep the marker-split logic and the `-EncodedCommand` (base64 UTF-16LE) encoding if you touch this path — it's what avoids quoting hell for arbitrary inner commands.

`stdin` is written to `child.stdin` immediately after spawning, then `child.stdin.end()` is **always** called (even with no stdin) so a command that waits on input never hangs a run. `debug: true` attaches `{file, args}` (or a fixed note for the elevated path) as `result.debugInfo`, surfaced by the renderer only when Developer mode is on.

Multi-step snippets run through a *separate* `run-sequence` IPC channel/handler (`src/main/ipc.js`) that loops `runShellCommand` per step and returns per-step results plus an aggregate history entry — it is not just `run-command` called in a loop from the renderer. Sequences support `env` but not `stdin` (scope limitation, not a bug).

### Opening a real terminal (`src/main/shell/terminal.js`)

`openTerminal({command, cwd, shell})` opens a real, visible, interactive console window pre-loaded with the command. **Do not implement this as a direct `spawn(shellExe, args, {detached: true, stdio: 'ignore', windowsHide: false})`** — that was the original approach and it does not reliably produce a visible, persisting window when the spawning parent is an Electron main process on Windows (a console-subsystem child with no console of its own doesn't reliably get a fresh one allocated the way it does when typed into an already-running shell). The working, current implementation instead goes through `cmd.exe /c start "" <shell> ...`, which explicitly asks the shell to allocate a brand-new console window for the child — the same mechanism VS Code's "Open in terminal" and Explorer's "Run" ultimately rely on. The command itself is passed to PowerShell via `-EncodedCommand` (base64 UTF-16LE) rather than `-Command "<text>"`, so it never has to survive being re-quoted across three layers of argv parsing (cmd → start → powershell). `windowsVerbatimArguments: true` is required alongside this — Node's default Windows argument-escaping would otherwise mangle the `start ""` empty-title token.

If you need to verify this works after touching it: `Get-Process powershell` alone is **not** a reliable check — a console app's actual on-screen window is owned by `conhost.exe`/`OpenConsole.exe`, not by the console app's own process, so checking `(Get-Process powershell).MainWindowHandle` will read `0` even for a perfectly visible window. Check for a *new* `conhost`/`OpenConsole` process (by `StartTime`) instead, or just take a screenshot.

### The dangerous-command guard was removed — don't re-add it

An earlier version of this app had `DANGEROUS_PATTERNS` duplicated in both the main and renderer processes, an "arm/confirm" Run button, a `confirmed`/`requiresConfirmation` IPC contract, and hard-skips in the scheduler/batch-run/run-all/run-after paths. **All of it is gone.** `runShellCommand`, `run-command`/`run-sequence` in `ipc.js`, `tickScheduler` in `scheduler.js`, and every renderer run path execute unconditionally — there is nothing in this codebase that inspects a command's text to decide whether it's safe to run. This was an explicit, considered product decision (the user owns the consequences of what they run), not an oversight — see the note at the top of this file. The only thing still filtered out of *unattended* paths (scheduler, run-after chaining, "Run all" on a group, batch run) is a snippet with unresolved `{{placeholder}}` tokens — that's a functional necessity (there's nowhere to prompt for a value in a background/batch context), not a safety gate, and should stay.

### Snippet data model & storage (`src/main/storage/`)

Snippets and run history are plain JSON files in `app.getPath('userData')` (paths centralized in `paths.js`: `SNIPPETS_FILE`, `HISTORY_FILE`, `APP_SETTINGS_FILE`, `VARIABLES_FILE`, `GROUPS_FILE`, `PIPELINES_FILE`, `BACKUPS_DIR`), not a database. `sanitizeSnippet()` in `storage/snippets.js` is the schema's source of truth — it backfills missing fields (so hand-edited or older-schema files don't break the UI) and is applied on both read and write. Current fields: `id, name, tag, command, pinned, runCount, lastRunAt, cwd, shell, elevated, steps, stdin, icon, notes, env, expect, runAfter, schedule, background, autoRestart`. `background`/`autoRestart` are the Start/Stop-instead-of-Run toggle and its crash-restart option — see the background-process section below; the sanitizer forces `background` back to `false` whenever `steps` is non-empty, since it's single-command-only. `command` is always kept populated (joined from `steps` for multi-step snippets) so free-text search has something to match against even for sequences. `env` is `Array<{key,value}>|null` (sanitized by `sanitizeEnvList`, capped at 20 entries) — converted to a plain object via `envListToObject()` (shared by `ipc.js` and `scheduler.js`, in `env-utils.js`) right before being handed to `execFile`'s `env` option, merged on top of `process.env`. `expect` is `{exitCode:number|null, outputContains:string|null}|null` (sanitized by `sanitizeExpect`) — checked entirely client-side in `run-engine.js` (`checkExpectation()`), main.js just stores it. `schedule` is `{enabled,type,intervalMinutes,dailyTime,cronExpr,lastRunAt}|null` (sanitized by `sanitizeSchedule`) — see the scheduler section below.

`DEFAULT_SNIPPETS` in `storage/snippets.js` seeds a fresh install and must be kept passing through the same field set the sanitizer expects (see the trailing `.map()` on that array).

The other storage modules follow the exact same ensure/read/write pattern — copy that pattern rather than inventing a new one if you add another persisted concern:
- **`storage/app-settings.js`** (`readAppSettings`/`writeAppSettings`) — currently just `{ hotkey, hasShownTrayHint }`.
- **`storage/variables.js`** (`readVariables`/`writeVariables`, sanitized by `sanitizeVariable`) — reusable `{id, name, value, secret}` placeholder values. The renderer's `params.js` prefills a parameterized snippet's inline form from these by matching placeholder name to variable name, and quietly writes back an updated value after every run (`syncVariablesFromValues`) — it never auto-creates a variable that didn't already exist, only keeps existing ones fresh.
- **`storage/groups.js`** (`readGroups`/`writeGroups`, sanitized by `sanitizeGroup`) — named, saved sets of snippets (`{id, name, description, snippetIds}`) you configure once (via `groups-modal.js`'s Groups screen, opened from the header) and run together on demand without reselecting them. Deliberately just a list of ids, not a copy of the snippets themselves, so a group always reflects each member's current command/tag/etc.; an id with nothing behind it (the snippet was deleted) is silently skipped wherever a group is resolved into a runnable list. Running a group hands its resolved snippet list to `batch-runner.js`'s existing order/mode config step — same live per-row output a manually-selected batch or a tag "Run all" gets. `cards.js` shows a small badge on a member snippet's card (and `details-modal.js` a full "Groups" section with links straight into each group's editor) so it's obvious from the snippet itself that it belongs to one.
- **`storage/pipelines.js`** (`readPipelines`/`writePipelines`, sanitized by `sanitizePipeline`) — branching snippet graphs (`{id, name, description, nodes, edges}`). See the dedicated section below.
- **`storage/backups.js`** — see below.

### Automatic snippet-library backups (`storage/backups.js`)

`writeSnippets()` (in `storage/snippets.js`) calls `backupSnippetsIfDue()` *before* overwriting `snippets.json`, which copies the current (pre-change) file into `backups/snippets-<ISO timestamp>.json`, throttled to at most once every `BACKUP_MIN_INTERVAL_MS` (5 minutes) so routine writes (pin toggles, run-count bumps) don't spam the backup folder — check `listBackups()`'s newest-first sort against that interval before adding a new one. `pruneBackups()` keeps only `MAX_BACKUPS` (10). `restoreBackup(fileName, writeSnippetsFn)` takes the writer function as a parameter specifically to avoid a circular `require` with `storage/snippets.js` (which itself calls `backupSnippetsIfDue`) — only accepts a `path.basename()`-validated `snippets-*.json` name (path-traversal guard) and restores by calling the passed-in writer, which means restoring itself takes a fresh backup of whatever was current first, so a restore is never a one-way trip.

### Background/long-running-process snippets (`src/main/shell/process-manager.js`)

A snippet with `background: true` (editor toggle, single-command only — enforced both client-side, hiding the toggle while multi-step is on, and server-side in `sanitizeSnippet`) doesn't run-to-completion like everything else in this app; it gets **Start/Stop/Restart** controls instead of Run, for dev servers, `docker compose up`, `tail -f`, watchers, etc. This is a genuinely different execution model from `shell/exec.js`'s `runShellCommand` (`execFile`, waits, hands back the full result) — `process-manager.js` uses `spawn()` and keeps the child alive, streaming stdout/stderr to the renderer chunk-by-chunk as it happens over one `process-output` channel, with lifecycle changes (`starting`/`running`/`stopped`/`exited`/`crashed`/`restarting`/`restart-limit`/`error`) over `process-status`. It reuses `exec.js`'s `buildInvocation()` for the same per-shell argv rules rather than re-deriving them.

The registry is a `Map` keyed by **snippetId**, not a separately-minted process id — this app's model is "a background snippet has at most one live instance at a time." **Stop** kills the whole process tree via `taskkill /PID <pid> /T /F`, not a plain `child.kill()` — on Windows the actual work (node/docker/ngrok…) is very often running as a *grandchild* of the spawned shell, which a plain kill would orphan running invisibly. `autoRestart: true` gives a crashed (non-zero exit, not a manual Stop) process up to 5 automatic restarts with a short delay, resetting that budget once it's stayed up a minute — so one rare crash doesn't permanently exhaust the budget for later.

Nothing here is persisted to disk or recovered after a full app restart — a background process's liveness lives only in this module's memory for as long as the main process is alive. Quitting the app (not just hiding the window — hiding is what background processes are *for* surviving) stops every one of them: `index.js`'s `before-quit` handler calls `stopAll()` and `event.preventDefault()`s the first time through so cleanup actually finishes before the process really exits, guarded by a `quitConfirmed` flag against re-entering itself once `app.quit()` is called again.

On the renderer side, `process-engine.js` owns *all* of "how process state maps onto a card's DOM" (`syncCardBackgroundUI`) — `state.runningProcesses[snippetId]` (status + a capped, tail-kept output buffer) is the source of truth, never any card's DOM, specifically because `cards.js`'s `refresh()` fully rebuilds every card on any unrelated change (search, sort, an edit elsewhere, groups changing…) that a long-lived background process can easily outlive. Output chunks are appended straight to the *currently rendered* card via a live `querySelector` lookup (same pattern as `run-engine.js`'s `findCardEl`) rather than a captured element reference, so a chunk arriving while the card isn't even in the DOM isn't lost — it's still in the buffer for the next real render. `bootstrapRunningProcesses()` (called once at renderer boot) reconciles this against `listProcesses()` — needed because the main process (and any children it spawned) survives a renderer-only crash/reload even though the renderer's own JS state doesn't.

### Visual pipelines (`src/main/storage/pipelines.js`, `src/renderer/modules/pipeline-editor.js` + `pipeline-engine.js`)

A saved, named graph of existing snippets (`{id, name, description, nodes, edges}`) you build on a canvas instead of chaining one-at-a-time via a snippet's own "Run before"/"Run after this one" fields. A **node** (`{id, snippetId, x, y}`) is a positioned pointer, never a copy — same "dangling id is just skipped" rule as groups. An **edge** (`{id, from, to, condition, value}`) decides whether a run continues down that branch: `condition` is `'success'` (exit 0) | `'failure'` (non-zero exit) | `'always'` | `'exitCode'` (exit code equals `value`, a number) | `'outputContains'` (stdout+stderr includes `value`, a string) — the sanitizer forces `value` to `null` for the three conditions that don't use it.

**Editor** (`pipeline-editor.js`): opened from the header's Pipelines button, mirrors `groups-modal.js`'s list-view/editor-view split. The editor view is `94vw`×(up to `90vh`) (`.modal-pipeline`) — deliberately much bigger than every other modal in this app, sized in viewport units (not a hardcoded pixel width) so it fills whatever the real content area turns out to be regardless of the window's nominal size or the OS's display-scaling factor, since a graph editor needs the room a form-style modal doesn't. Editing works on a *working copy* (`state.pipelineNodes`/`pipelineEdges`) only written back on Save, so Cancel is a true discard.

Nodes are plain absolutely-positioned `<div>`s dragged via mousedown/mousemove/mouseup (not HTML5 drag-and-drop — that's used for list reordering elsewhere in this app, but doesn't suit free-form 2D positioning plus a second "drag from a port" gesture on the same element); a mousedown+mouseup with no real pointer movement is treated as a **click** (selects the node) rather than a drag. Edges are `<line>`s in an overlaid SVG, recalculated from the *actual rendered* port positions via `getBoundingClientRect()` (so a line always lands exactly on the visible dot regardless of node height or canvas scroll) rather than computed from `node.x`/`y` and an assumed size. `pipelineEdgeCreatesCycle()` (`utils.js`, pure — same reasoning as `findDependencyCycle`) rejects a new connection that would create a loop before it's added. **Auto-arrange** (toolbar) lays every node out left-to-right in topological layers (Kahn's algorithm) — a one-click fix for a graph that's turned into a tangle after a lot of free-form dragging.

Clicking a node or an edge's condition label (as opposed to dragging/right-clicking) selects it into `state.pipelineSelection`, which drives the **inspector side panel** (`renderInspector()`) — the actual discoverable way to rename which snippet a step points to ("Change step…", reopens the same snippet-picker "+ Add step" uses), delete a step/connection, or change a connection's condition type and its `value` via a real `<select>` + input rather than a tiny canvas label you'd have to already know to click. Right-click-to-delete on a node or edge still works too, as a fast path once you know it's there — the inspector is the *discoverable* path, not the *only* one. "+ Add step"/"Change step…" both go through one shared `openSnippetPicker()` that reuses `menus.js`'s `.context-menu`/`.context-menu-item` look without importing `menus.js` itself (self-contained click-outside-to-close, mirroring rather than depending on that module).

**Execution** (`pipeline-engine.js`): `runPipelineGraph(nodes, edges)` starts every root node (no incoming edge) in parallel, and after each node finishes, follows any outgoing edge whose condition matches that result to reach the next node(s) — **OR-semantics**: a node runs the first time *any* satisfied incoming edge reaches it, there's no "wait for every incoming edge" join. That's a deliberate scope boundary (a real join raises deadlock/starvation questions this app doesn't need to answer) documented here rather than a TODO. Reuses `batch-runner.js`'s results-modal machinery (`buildResultRow`/`setRow*`/`runOne`, `dom.batchResultsList`) — exported from there specifically so a pipeline run gets the exact same live status-dot-per-row look a batch/group run gets, instead of a second near-identical UI. A parameterized node (unresolved `{{placeholder}}`) is skipped, same "no prompting in an unattended context" rule documented above for scheduler/batch/group runs.

Running from either the Pipelines list or the editor **hides the Pipelines modal first**, rather than opening the results modal on top of it — both are `.modal-overlay` at the same z-index, so without this the still-open Pipelines modal (later in `index.html`, so painted on top) would visually bury the results underneath it, forcing you to close Pipelines just to see what happened. `events.js`'s generic `onBatchModalClosed`/`emitBatchModalClosed` (fired by `batch-runner.js`'s `closeBatchModal()` — it has no idea pipelines exist, it just announces "I closed") is what reopens the Pipelines modal, to whichever view (list or editor) it was showing, once results are dismissed.

### The scheduler (`src/main/scheduler.js`)

`startScheduler()` sets up `setInterval(tickScheduler, SCHEDULE_CHECK_INTERVAL_MS)` (30s), called once from `src/main/index.js`. Each tick, `tickScheduler()` re-reads `readSnippets()` fresh from disk (so it always sees whatever the renderer most recently saved via the normal `save-snippets` IPC — there's no separate scheduling IPC/config channel), skips anything not `schedule.enabled`, and for the rest checks `isScheduleDue(schedule, now)`:
- `interval`: due when `now - lastRunAt >= intervalMinutes * 60000` (or never run yet).
- `daily`: due once `now` has passed today's `dailyTime` slot and `lastRunAt` isn't already past that slot (so it fires once per day, not on every tick after the time passes).
- `cron`: a minimal hand-rolled 5-field matcher (`cronMatches`/`cronFieldMatches` — supports `*`, `*/n`, ranges, comma lists, no seconds/years/named months) plus a 55-second debounce against `lastRunAt` so the same minute can't double-fire.

A due snippet runs via `runScheduledSnippet()` (steps loop or single call — no confirmation of any kind needed, see above), appends to history as `"<name> (scheduled)"`, fires an Electron `Notification` unconditionally (independent of the renderer's `notificationsEnabled` preference, which the main process can't see anyway — scheduled runs are background-by-nature so they always notify), and then `writeSnippets()` persists the updated `schedule.lastRunAt` / `runCount` / `lastRunAt` back to disk.

### Renderer modules (`src/renderer/modules/`)

One file per concern, each kept small. The rough map:

| Module | Owns |
|---|---|
| `state.js` | the single mutable `state` object (snippets/filters/UI toggles), `ACCENT_PRESETS`/`ICON_PRESETS` |
| `dom.js` | every `byId()` DOM reference, one place |
| `utils.js`, `icons.js` | pure, dependency-free helpers and icon-string lookups |
| `events.js` | the tiny `EventTarget`-based event bus (`onSnippetsChanged`/`emitSnippetsChanged`) |
| `toast.js`, `appearance.js` | toast notifications; theme/accent/density/blur/UI-scale/sound/desktop-notification application |
| `snippets-store.js` | load/persist/sort/filter/pin/duplicate/delete — no rendering |
| `cards.js` | `render()`/`refresh()`, card DOM construction, "Run all" for a group |
| `run-engine.js` | actually running a resolved command/sequence into a card's output panel, assertions, diff toggle, run-after trigger |
| `params.js` | the placeholder-collection inline form + variable prefill |
| `batch-runner.js` | the shared "run a list of snippets with live per-row output" engine + the results-modal open/close plumbing |
| `batch.js` | select-mode UI, the batch bar, and the order/mode config step that hands off to `batch-runner.js` |
| `editor-modal.js` | the Add/Edit snippet modal, including the schedule-type tabs |
| `history-drawer.js`, `variables-modal.js`, `groups-modal.js`, `settings-modal.js` | their respective modal/drawer |
| `details-modal.js` | the read-only Details panel per snippet (dependencies, schedule, groups, stats) |
| `pipeline-editor.js` | the Pipelines list/canvas-editor screen — nodes, edges, drag/connect, save |
| `pipeline-engine.js` | walks a pipeline's graph and runs it, branching on each node's result |
| `process-engine.js` | Start/Stop/Restart + live streaming output for `background` snippets |
| `tags.js`, `favorites.js` | tag-filter chips and the pinned-favorites bar — both self-register on `onSnippetsChanged` |
| `menus.js` | the right-click context menu and the "Copy as" dropdown |
| `keyboard.js` | the one global keydown listener |
| `app.js` (not in `modules/`) | entry point: wires top-level DOM events, side-effect-imports every self-registering module, bootstraps state |

- `{{name}}`-style placeholders in a command/step are detected via `PLACEHOLDER_RE` (`utils.js`) and trigger an inline per-card form (`params.js`) before running; substitution happens client-side before the (now-concrete) command is sent over IPC.
- Card action buttons (Run/Copy/Edit/Duplicate/Delete, pin, admin/schedule badges, notes toggle, open-folder, open-terminal) and the per-card output console are all built inside `cards.js`'s `buildCard()`; the run pipeline (placeholder resolution → `runSingleSnippet`/`runSequenceSnippet` in `run-engine.js`) is the shared path both the single-command and multi-step cases funnel through — there is no arm/confirm step of any kind, the Run button executes on the first click once placeholders (if any) are resolved.
- Drag-and-drop reordering (`cards.js`) is only wired up when `isReorderable()` is true (sort mode is `manual`, not grouped, no active tag filter, no search text, not in select mode) — the drag handle element itself is only created in that state. Reordering mutates the `snippets` array directly (`splice`) and persists it — there's no separate `order` field. The **batch-run order modal** (`renderOrderList()` in `batch.js`) uses the identical drag/drop-over/insert pattern against its own transient `state.batchOrder` array — if you fix a bug in one, check the other.
- Floating UI (the right-click context menu, the "Copy as" dropdown, both in `menus.js`) is built on demand and appended to `document.body`, positioned via `getBoundingClientRect()` clamped to the viewport, not present in `index.html` as static markup. **This positioning matters**: `position: fixed` + body-appended avoids being painted over by a later sibling card (same DOM-order stacking issue any two un-elevated siblings can hit) — follow this pattern for any new floating menu, don't go back to `position: absolute` inside a card.
- **Select mode / batch run, and "Run all" on a group** (`batch.js`, `batch-runner.js`, `cards.js`): `state.selectMode` + `state.selectedIds` (a Set) are UI-only state, never persisted. Both a manually-selected batch and a group's "Run all" funnel through `batch-runner.js`'s `runBatchList(list, mode)`, which builds one live status-dot-plus-expandable-output row per snippet in the results modal and updates each row as its run resolves — neither path runs blind. The only thing filtered out is a parameterized snippet (marked "Skipped — needs input"), not a "dangerous" one (see above). `batch-runner.js` deliberately has zero dependency on `cards.js` even though `cards.js` needs to call into it — see **Clean code in this project** below for why that direction matters.
- **Run-after chaining** (`run-engine.js`): `triggerRunAfter(finishedId, chainDepth)` looks up `state.snippets.find(s => s.runAfter === finishedId)` — note the direction: the *chained* snippet stores a pointer to the one it runs after, not the other way around. It recurses with `chainDepth + 1`, capped at 5, to survive a misconfigured cycle without hanging.
- View/appearance preferences that aren't snippet data (`sortMode`, `groupView`, `theme`, `accentColor`, `density`, `blur`, `uiScale`, `soundEnabled`, `notificationsEnabled`, `devModeEnabled`) all live in `localStorage`, not in any JSON file the main process manages — they're per-device display preferences. `applyAppearance()` (`appearance.js`) is the single function that pushes all of them onto the DOM and must be called after any of them changes.

### UI-scale rendering (`applyAppearance()` in `appearance.js` + `.app-shell`)

Do **not** use CSS `zoom` on `#appShell` for the UI-scale feature — that was an earlier implementation and it left a visible gap at scale < 100% that exposed the transparent window's own black base paint on Windows (the same class of compositing quirk as the `hasShadow`/`thickFrame` issue below), because `zoom` shrinks the element's rendered box without anything filling the freed space. The fix: lay the element out *larger* than the viewport by the inverse of the scale factor, then transform-scale it back down to exactly 100%:
```js
const s = state.uiScale / 100;
dom.appShell.style.width = `${100 / s}%`;
dom.appShell.style.height = `${100 / s}vh`;
dom.appShell.style.transform = `scale(${s})`;
```
`.app-shell` has `transform-origin: top left` for this to anchor correctly. Because the transform lives on `#appShell` specifically, and every modal/drawer/toast is a **sibling** of it (direct children of `<body>`, not descendants — check `index.html` before moving one), they're unaffected by the scale and always render at native 1:1 size, which is intentional.

### Theming (`style.css`)

Dark is the `:root` default. `:root[data-theme="light"]` overrides the palette variables explicitly; a *matching* `@media (prefers-color-scheme: light)` block, scoped to `:root:not([data-theme="dark"]):not([data-theme="light"])`, provides "System" mode by following the OS preference only when the user hasn't explicitly forced either theme. Keep both blocks' variable values in sync if you touch the palette — there's no CSS mixin to share them. The accent color is the one user-customizable palette value; `--accent-hover`/`--accent-soft` are derived from it via `color-mix()` (Chromium-only, fine since this is Electron-only) rather than computed in JS, so setting `--accent` from the renderer is enough on its own.

Every `<select>` that needs to match the theme is wrapped in `.select-wrap` with a real inline SVG chevron (`.select-chevron`) layered on top via absolute positioning, and the native arrow is hidden with `appearance: none`. This exists because the *browser's own* select arrow doesn't respect custom padding and renders visibly off-center against our styling — if you add another `<select>`, wrap it the same way rather than relying on the native arrow.

**`[hidden]` vs. author CSS**: a rule as plain as `.field-row { display: flex; }` permanently defeats the `[hidden]` attribute's default `display: none`, because author stylesheets always win over the user-agent stylesheet regardless of selector specificity or source order. `style.css` has a blanket `[hidden] { display: none !important; }` near the top specifically to make `[hidden]` reliable everywhere in this app — if you ever see a `hidden`-toggled element stubbornly stay visible, check whether a class on it sets `display` and either drop that class in favor of `[hidden]`, or give the row its own non-conflicting class the way the schedule-type field-rows use `.schedule-field-row` instead of the generic `.field-row`. Don't reintroduce a `display`-setting class on an element that's also toggled via `hidden`.

### Windows-specific window setup (`src/main/window.js`)

The launcher window is `frame: false` + `transparent: true` with CSS-drawn rounding/shadow (`.app-shell` in `style.css`), created `show: false` and only ever shown via `showWindow()`/`toggleWindow()` (hotkey, tray, or IPC) — don't flip `show: true` in committed code, that's a manual-testing-only knob. `hasShadow: false` and `thickFrame: false` are required on `BrowserWindow` — the default native shadow/thick-frame style paints a black rectangular artifact behind a transparent frameless window on Windows because it doesn't composite the alpha channel correctly. Don't re-enable them without re-verifying the corners.

The tray/window icon is generated at runtime by a hand-rolled PNG encoder (`icon.js`'s `buildIconPng` — raw RGBA scanlines + `zlib.deflateSync` + manual chunk/CRC32) rather than shipped as an asset file, so the app has zero external image dependencies.

The window hides (never closes) on blur/close/Escape unless `app.isQuitting` was set by the tray's Quit item — that flag is what distinguishes "hide" from "actually exit" throughout `src/main/`.

### Global hotkey (user-configurable) (`src/main/hotkey.js`)

`registerHotkey(accelerator)` is the only place that calls `globalShortcut.register`/`unregister` — it unregisters whatever's currently active, tries the new one, and rolls back to the previous accelerator on failure (never leaves the app with *no* working hotkey without the caller finding out via its boolean return). At startup, `src/main/index.js` tries the user's saved `appSettings.hotkey` first, then falls through a defaults array. The `set-hotkey` IPC handler (`ipc.js`) is the only thing that persists a new accelerator to `app-settings.json` — a successful *startup* fallback does not overwrite the saved preference, so a combo that's temporarily taken by another app doesn't silently erase what the user actually asked for. (Registration can also fail entirely in some sandboxed/remote-desktop environments — the app still runs, just tray-only, and logs a note about it.)

### Self-update (`src/main/updater.js`)

Wraps `electron-updater`'s `autoUpdater` with `autoDownload`/`autoInstallOnAppQuit` both **off** — check, download, and install/relaunch are three separate, user-triggered actions (Settings → Updates), never something that happens on its own in the background. Same "nothing runs unless you click it" stance as the rest of this app, just applied to the app updating itself instead of a command running.

Update feed is **GitHub Releases on this repo**, configured via `build.publish` in `package.json` (`provider: "github"`, `owner`/`repo` pointing at `whosm1ke/ElectronBasics`) — `electron-builder` writes `latest.yml` (version + installer hash) into the release alongside the NSIS installer whenever a release is published (see the `npm run release` note under **Commands**), and `electron-updater` reads that file to decide whether a newer version exists. Since the repo is public, an installed copy needs no auth to check/download.

`checkForUpdates()` guards on `app.isPackaged` first — running via `npm start` has no `app-update.yml` (that file only exists inside a packaged app's resources, generated from the `publish` config), so calling into `electron-updater` from source throws a confusing low-level error instead of the friendly "updates only work in the installed app" message this checks for up front.

Every `autoUpdater` event (`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`) is forwarded to the renderer over one `update-status` IPC channel rather than being the return value of the `check-for-updates`/`download-update` IPC calls — those calls just kick off the corresponding `electron-updater` call and resolve almost immediately; the actual result arrives later via the event. The renderer keeps the last-received status in `state.updateStatus` (`settings-modal.js`) so reopening Settings mid-download shows where things actually are instead of resetting to "Check for updates."

`quitAndInstall()` explicitly sets `app.isQuitting = true` before calling `autoUpdater.quitAndInstall()` — same defensive pattern as the tray's Quit item (`tray.js`) — because `window.js`'s `close` handler intercepts and just hides the window unless that flag is already set, which would otherwise silently swallow the quit the installer needs.

## Clean code in this project

This codebase was deliberately refactored from three large files (`main.js`/`preload.js`/`renderer.js`) into the `src/main/`, `src/preload/`, `src/renderer/modules/` layout above specifically to keep files small and single-purpose. When adding or changing code here:

- **One concern per file, named for that concern.** If you're about to add a second unrelated responsibility to a file (e.g. bolting scheduling logic onto `shell/exec.js`, or UI-state for a new modal into `cards.js`), stop and give it its own file instead. A module in this project should be describable in one sentence — most of them are, in the comment at the top of the file. Keep that comment current when you change what a file is responsible for.
- **Imports go one direction — no cycles.** The renderer has no bundler to paper over a circular `import`, and Node's CommonJS `require` cycles silently hand back a partial (possibly empty) `module.exports`, which is a nasty class of bug either way. Before adding a new cross-module import, check it doesn't create a cycle: `cards.js` renders and is imported by many leaf modules (`favorites.js`, `tags.js`, `batch.js`, …) for its `refresh()` — none of those may be imported back by `cards.js`. When two modules genuinely need each other's behavior (the batch-run case: `cards.js` needs to trigger a run, `batch.js` needs `cards.js`'s `refresh()`), pull the shared part into a third, lower-level module that neither of the original two need to import back — see `batch-runner.js`, extracted from `batch.js` specifically so `cards.js` could reuse its live-results engine for "Run all" without importing `batch.js` (which imports `cards.js`). A quick way to check the whole graph: walk every `from './x.js'` import in `src/renderer/modules/*.js` and DFS for a repeated file in the stack.
- **Cross-cutting notifications go through the event bus, not a direct call chain.** `events.js` wraps a plain `EventTarget`; a module that mutates snippets (`snippets-store.js`, `editor-modal.js`, `batch.js`, …) calls `emitSnippetsChanged()` and doesn't need to know or care who's listening. `cards.js` is the one thing that listens (`onSnippetsChanged(refresh)`), so every mutating module just needs to persist — it doesn't import `cards.js` at all for this. Reach for this pattern over a direct import when the relationship is "something changed" rather than "I need this specific value/function back."
- **Main-process storage modules all follow the same shape**: `ensure*File()` / `read*()` / `write*()`, a `sanitize*()` that backfills missing fields so old or hand-edited JSON never breaks the UI, applied on both read and write. Copy `storage/variables.js` or `storage/app-settings.js` as a template for a new persisted concern rather than inventing a new pattern.
- **Renderer DOM lookups live in `dom.js`, never a scattered `document.getElementById` elsewhere.** If a new element needs to be referenced from JS, add it once to `dom.js` and import `dom` where needed — this is also what makes it easy to verify nothing in `index.html` and `dom.js` has drifted apart (grep both for `id="..."` / `dom\.\w+` and diff the sets).
- **No framework, no template strings standing in for a templating engine.** DOM nodes are built imperatively (`document.createElement`, direct property assignment, small `innerHTML` fragments for static icon markup only) — match that style rather than introducing JSX-like patterns or a virtual-DOM diff.
- **Comments explain *why*, not *what*.** The codebase leans on short header comments (what a file owns, and any non-obvious constraint) plus inline comments only where the "obvious" implementation would actually be wrong (e.g. why `terminal.js` can't just `spawn()` directly, why `windowsVerbatimArguments: true` is required, why `backups.js` takes the writer as a parameter instead of importing it). Don't narrate straightforward code line-by-line; do explain a decision that isn't self-evident from reading it.
- **Prefer extending an existing small module over growing one past its stated concern.** `cards.js` is the largest module by necessity (it owns card construction, which has a lot of small pieces), but even there, logic that isn't really "building a card" — running a batch, computing a diff, resolving placeholders — has already been pulled out into `batch-runner.js`, `run-engine.js`, `params.js` respectively. If a file you're editing is growing past a couple hundred lines and picking up a second concern, that's the signal to split it, not to keep appending.

## Project structure

```
package.json           "main": "src/main/index.js"
src/
  main/
    index.js             entry point — pure wiring, no logic of its own
    window.js            the launcher BrowserWindow: create/show/hide/toggle
    tray.js               tray icon + menu
    hotkey.js             global-shortcut registration with safe fallback
    icon.js                hand-rolled PNG encoder (tray/window icon, no assets)
    ipc.js                 every ipcMain handler — delegates out, no logic
    scheduler.js           the 30s background tick (interval/daily/cron)
    updater.js              electron-updater wrapper: manual check/download/install
    paths.js, id.js, ps-quote.js, env-utils.js   small shared leaves
    shell/
      exec.js               the multi-shell execFile engine
      process-manager.js     spawn-and-stream engine for background/long-running snippets
      terminal.js            opens a real, visible, interactive terminal window
    storage/
      snippets.js            schema + sanitizer + DEFAULT_SNIPPETS
      history.js, app-settings.js, variables.js, groups.js, pipelines.js, backups.js
  preload/
    index.js              contextBridge — the only surface the renderer can reach
  renderer/
    index.html, style.css
    app.js                 entry point: wiring + bootstrap + side-effect imports
    modules/               one ES module per concern — see the table above
```

## Development

```bash
npm install
npm start
```

There's no bundler, test suite, or lint config. Main/preload are plain CommonJS; the renderer is loaded directly by Electron as native ES modules — no build step either way. After editing, restart the app (`npm start`) to try your changes; see **Commands** above for the syntax-check-only shortcuts.
