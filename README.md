# Snippet Runner

A local, Windows-only shell snippet launcher in the style of Raycast/Spotlight. Press a global hotkey from anywhere, search your library of one-liners and multi-step scripts, and run them — across **PowerShell, CMD, Git Bash, WSL, Node.js, or Python** — with parameterized inputs, reusable variables, environment variables, working directories, elevation, scheduling, and batch runs with live per-snippet output. Fully themeable, with drag-to-reorder, a favorites bar, automatic backups, and more.

There is no destructive-command guard of any kind — Snippet Runner runs exactly what you tell it to, exactly when you tell it to (including on a schedule or in a batch). That's a deliberate choice: you own your commands and their consequences. See [Security model](#security-model).

Everything runs locally. Nothing is sent anywhere except the commands *you* choose to run, on *your* machine.

---

## Table of contents

- [What it is](#what-it-is)
- [Feature tour](#feature-tour)
- [Getting started](#getting-started)
- [Using the launcher](#using-the-launcher)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Creating and editing snippets](#creating-and-editing-snippets)
- [Multiple shells: PowerShell, CMD, Git Bash, WSL, Node.js, Python](#multiple-shells-powershell-cmd-git-bash-wsl-nodejs-python)
- [Parameterized snippets](#parameterized-snippets)
- [Global variables](#global-variables)
- [Multi-step sequences](#multi-step-sequences)
- [Working directory, environment variables, stdin & Run as Administrator](#working-directory-environment-variables-stdin--run-as-administrator)
- [Assertions ("expect")](#assertions-expect)
- [Run after — chaining snippets together](#run-after--chaining-snippets-together)
- [Scheduling: interval, daily, or cron](#scheduling-interval-daily-or-cron)
- [Batch run: select multiple, order them, run sequentially or in parallel](#batch-run-select-multiple-order-them-run-sequentially-or-in-parallel)
- [Open in a real terminal](#open-in-a-real-terminal)
- [Categories, sorting & grouping](#categories-sorting--grouping)
- [Favorites bar](#favorites-bar)
- [Drag-and-drop reordering](#drag-and-drop-reordering)
- ["Copy as" and the right-click menu](#copy-as-and-the-right-click-menu)
- [Run history & diff-vs-previous-run](#run-history--diff-vs-previous-run)
- [Undoing a delete](#undoing-a-delete)
- [Appearance: theme, accent color, density, blur, UI scale](#appearance-theme-accent-color-density-blur-ui-scale)
- [Sound, desktop notifications & Developer mode](#sound-desktop-notifications--developer-mode)
- [Custom global hotkey](#custom-global-hotkey)
- [Settings: startup, backups, export & import](#settings-startup-backups-export--import)
- [The default snippet library](#the-default-snippet-library)
- [Where your data lives](#where-your-data-lives)
- [Security model](#security-model)
- [Project structure](#project-structure)
- [Development](#development)

---

## What it is

Snippet Runner is a small Electron app: a frameless, always-on-top, blurred card that pops up over whatever you're doing, lets you fuzzy-search a library of shell snippets, and runs the one you pick — right there, with the output shown inline. It's meant to replace the "open a terminal, retype the same `Get-Process | Sort-Object CPU -Descending | Select -First 5` you've typed a hundred times" workflow — and to grow with you into a small local automation tool: schedule a health check, chain a build into a deploy, batch-run a dozen diagnostics in one go, or drop into a real terminal when a one-shot run isn't enough.

It ships with 42 ready-made snippets (git, npm, docker, network, system, files, utility), a full editor for your own, and a Settings panel to make the whole thing look and behave the way you want.

## Feature tour

**Launcher**
- Global hotkey toggle, **customizable** in Settings (default `Ctrl+Shift+Space`, falls back to `Alt+Space` if taken)
- Frameless, centered, transparent, rounded, always-on-top window with a soft CSS shadow — clean at any [UI scale](#appearance-theme-accent-color-density-blur-ui-scale), no artifacts
- Hides on `Escape`, on losing focus, or on closing — it never actually quits unless you tell it to (via the tray menu), so the hotkey and background state are always ready
- System tray icon (generated in-process, no image assets) with **Show/Hide** and **Quit**
- A one-time native notification the first time the app runs, pointing you at the hotkey/tray
- Search box auto-focuses every time the window is summoned

**Snippet library**
- Add, **Edit**, **Duplicate**, and Delete snippets (delete shows an **Undo** toast)
- **Pin** favorites so they always float to the top, and show up in the always-visible **favorites bar**
- Custom **icon** per snippet (pick an emoji, or let it auto-derive from the tag) and an optional **notes** field
- Auto-colored, auto-iconed tag chips (color is hashed from the tag name, so any custom tag you invent gets a consistent color for free), now with a matching rounded pill style in **group view**
- Free-text search across name, tag, command text, working directory, notes, and sequence steps
- 4 sort modes: *Pinned first*, *A–Z*, *Most used*, *Recently run* — plus **manual drag-and-drop reordering**
- *Group by category* view, with a **Run all** button per group
- **Select mode** — multi-select any set of snippets across categories for a [batch run](#batch-run-select-multiple-order-them-run-sequentially-or-in-parallel)
- Right-click any card for a quick actions menu
- Per-snippet usage stats ("Ran 7× · last 2m ago") shown right on the card

**Execution**
- Runs under **PowerShell, CMD, Git Bash, WSL, Node.js, or Python** — pick the shell per snippet
- UTF‑8 forced end-to-end (with `PYTHONIOENCODING`/`PYTHONUTF8` set for Python specifically), so pipes, aliases, and Cyrillic/Ukrainian output render correctly instead of turning into `???`
- Optional **working directory** per snippet, with a one-click **open in File Explorer** button
- Optional **environment variables** per snippet, layered on top of the normal environment
- Optional **stdin input** piped into the command as it runs
- Optional **Run as Administrator** (PowerShell) — triggers a real UAC prompt and still captures stdout/stderr
- **Multi-step sequences** — a snippet can be an ordered list of commands, run one after another, each with its own pass/fail status and output block
- **Run after** — chain one snippet to auto-run right after another finishes successfully
- **Scheduling** — run a snippet automatically on an interval, daily at a set time, or on a cron expression, entirely in the background
- **Parameterized snippets** — drop `{{placeholder}}` tokens into a command and you'll be prompted for values right on the card before it runs; values you've saved as [global variables](#global-variables) pre-fill automatically
- **Assertions** — optionally expect a specific exit code and/or output text; a pass/fail line appears under the result, independent of the raw exit code
- **Copy**, or **"Copy as"** Markdown / a one-liner, or copy the last run's output, all in one click
- **Open in a real terminal** — drop the same command into a real, interactive PowerShell/CMD window when one-shot output isn't enough
- Output that looks like JSON is automatically pretty-printed; a **Diff vs last run** toggle shows what changed since the previous run
- Optional sound cue and desktop notification when a command finishes
- **Developer mode** shows the exact executable/args actually sent to the OS for each run

**History, personalization & data safety**
- Every run (single, sequence, scheduled, or batch) is logged with timestamp, exit code, duration, and truncated output — up to the last 100 runs, **searchable** in the history drawer
- **Theme** (Dark/Light/System), **accent color**, **density**, **background blur**, and **UI scale** — all customizable in Settings, all rendered with theme-correct custom dropdown chevrons and focus glow, matching the rest of the UI
- **Global variables** — name a value once, reuse it in any snippet's placeholders
- **Launch at Windows startup** toggle
- **Automatic rotating backups** of your snippet library, restorable from Settings
- **Export** your whole snippet library to a JSON file, or **Import** one (merged in, never overwrites existing snippets)

## Getting started

**Requirements:** Windows 10/11, [Node.js](https://nodejs.org/) (for `npm`). Git Bash, WSL, Node.js, and Python are optional — only needed if you create a snippet that uses that particular shell.

```bash
git clone <this-repo>
cd ElectronBasics
npm install
npm start
```

`npm start` runs `electron .`, which launches the app hidden in the tray. Press **`Ctrl+Shift+Space`** to bring up the launcher (the first time you run it, a notification reminds you of this).

On first launch, `snippets.json` and `history.json` are created automatically in your user data folder, pre-seeded with the [default snippet library](#the-default-snippet-library).

## Using the launcher

1. Press `Ctrl+Shift+Space` (or `Alt+Space`, or whatever you've [rebound it to](#custom-global-hotkey)) from anywhere.
2. Start typing — the list filters live by name, tag, command text, working directory, or notes.
3. Click a tag chip (`network`, `system`, `disk`, …) to filter to just that category, or use the sort dropdown to reorder the list.
4. Click **Run** (or select a card and press `Enter`, or press `1`–`9` for one of the first nine visible cards) to execute it. Output — stdout and stderr — appears in a console block right under the card.
5. Click **Copy** to copy the raw command to your clipboard instead of running it.
6. Press `Escape` (or click outside the window) to hide the launcher again — your place is remembered for next time.

**Example session:**

```
Ctrl+Shift+Space          → launcher appears, search box focused
type "port"                → filters down to "Listening ports"
Enter                      → runs Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Format-Table -AutoSize
                              output appears inline, status dot turns green
Escape                     → launcher hides
```

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Space` / `Alt+Space` (or your [custom hotkey](#custom-global-hotkey)) | Toggle the launcher window (works globally, even when unfocused) |
| `Escape` | Hide the window — or close whatever modal/drawer/menu/dropdown is open |
| `↑` / `↓` | Move selection up/down the visible list |
| `Enter` | Run the selected snippet |
| `1`–`9` | Instantly run the 1st–9th visible snippet |
| `Ctrl+C` | Copy the selected snippet's command |
| `Ctrl+D` | Duplicate the selected snippet |
| `Ctrl+N` | Open "New snippet" |
| `Ctrl+H` | Open run history |
| `Ctrl+P` | Pin/unpin the selected snippet |

(These are ignored while you're typing in the search box or a text field, so normal typing is never hijacked.)

## Creating and editing snippets

Click the **+** button (or `Ctrl+N`) to open the snippet editor. Click **Edit** on any existing card (or right-click it) to change it in place.

A snippet has:

- **Icon** — an emoji of your choice from the quick-pick row, or leave it on "Auto" to derive one from the tag
- **Name** — what shows on the card, e.g. `Check listening ports`
- **Tag / category** — free text, e.g. `network`; any tag you type gets its own auto-generated color and icon
- **Command** (or a multi-step sequence) — the shell text to run
- Optional **working directory**, **shell**, **environment variables**, **stdin**, **Run as Administrator**, **expected exit code / output**, **run-after chaining**, **schedule**, and free-form **notes**

**Minimal example** — a snippet that lists the five biggest files in Downloads:

```
Name:    Biggest files in Downloads
Tag:     files
Command: Get-ChildItem "$env:USERPROFILE\Downloads" -File |
         Sort-Object Length -Descending | Select-Object -First 5 Name,Length
```

**With icon and notes:**

```
Icon:    🧹
Name:    Clean old temp files
Tag:     files
Command: Get-ChildItem $env:TEMP -File | Where-Object LastWriteTime -lt (Get-Date).AddDays(-7)
Notes:   Only lists files older than 7 days — doesn't delete anything.
         Review the list before turning this into a Remove-Item snippet.
```

Notes show up as a small expandable "ℹ Notes" toggle on the card, so the command block stays uncluttered until you actually need the context.

## Multiple shells: PowerShell, CMD, Git Bash, WSL, Node.js, Python

Pick a shell per snippet from the editor's **Shell** dropdown:

| Shell | Runs via | Notes |
|---|---|---|
| **PowerShell** (default) | `powershell.exe -Command` | UTF-8 forced; the only shell that supports **Run as Administrator** |
| **CMD** | `cmd.exe /c` | UTF-8 forced via `chcp 65001` |
| **Git Bash** | `bash.exe -lc` | Looked up on PATH, then the usual Git-for-Windows install paths |
| **WSL** | `wsl.exe -e bash -lc` | Uses your default WSL distro |
| **Node.js** | `node -e` | Runs the command text as a JS one-liner/script |
| **Python** | `python -c` | `PYTHONIOENCODING`/`PYTHONUTF8` forced so output decodes correctly |

**Example — a Bash one-liner:**

```
Name:    Disk usage by folder (WSL)
Tag:     disk
Shell:   WSL
Command: du -sh ~/* 2>/dev/null | sort -rh | head -5
```

If a shell isn't installed, running the snippet returns a clear error naming what was tried instead of a cryptic failure. Elevation ("Run as Administrator") is PowerShell-only — the checkbox disables itself for every other shell rather than silently doing the wrong thing.

## Parameterized snippets

Use `{{name}}` anywhere in a command to turn it into a fill-in-the-blanks template. When you hit **Run**, an inline form appears on the card asking for a value for each placeholder — fill them in, hit **Run** again, and the substituted command executes.

**Example — ping any host on demand:**

```
Name:    Ping a host
Tag:     network
Command: Test-Connection {{host}} -Count 4
```

Running it prompts for `host`; typing `github.com` and confirming runs:

```
Test-Connection github.com -Count 4
```

Multiple placeholders are supported — each gets its own input row, in the order they first appear. If a placeholder's name matches a saved [global variable](#global-variables), its field is pre-filled automatically (still editable per run).

## Global variables

Open **Settings → Manage variables…** to define reusable name/value pairs — for example `server = prod-db-01` or `user = svc-deploy`. From then on, any snippet with a matching `{{server}}` or `{{user}}` placeholder pre-fills that value the moment you click Run, across your *entire* library, without retyping it snippet by snippet.

- Mark a variable **secret** to mask it as a password field in the UI (it's still stored as plain, unencrypted JSON locally — this hides it from a glance over your shoulder, it's not a credential vault).
- Whenever you run a snippet and type a value for a placeholder that already has a matching variable, that variable's stored value is quietly updated to match — so it stays current without extra steps.
- Variables are stored in `variables.json` in your user data folder (see [Where your data lives](#where-your-data-lives)) and aren't included in snippet export/import.

## Multi-step sequences

Toggle **"Multi-step sequence"** in the editor to turn a snippet into an ordered list of steps instead of one command. Each step runs after the previous one finishes, and the output console shows a separate pass/fail block per step — a sequence never stops on the first failure, so you always see the full picture.

```
Name:  Morning network check
Tag:   network
Steps:
  1. Clear-DnsClientCache
  2. Test-NetConnection google.com
  3. Get-NetTCPConnection -State Listen | Measure-Object | Select-Object Count
```

Placeholders work inside sequence steps too, and are collected once up front before the whole sequence runs. (Multi-step sequences don't support per-step stdin — that's single-command only.)

## Working directory, environment variables, stdin & Run as Administrator

**Working directory** — set once per snippet, so you don't have to `cd`/`Set-Location` inside the command itself. A small folder icon appears on the card to open it directly in File Explorer.

**Environment variables** — add any number of `KEY=value` pairs in the editor; they're layered on top of the normal process environment for that run only:

```
Name:    Build with a custom flag
Tag:     dev
Command: npm run build
Env:     NODE_ENV=production
         BUILD_TARGET={{target}}
```

**stdin** — toggle "Provide stdin input" and type the text that should be piped into the command as it runs, e.g. to feed a script that reads from standard input.

**Run as Administrator** — check the box (PowerShell only) and Snippet Runner triggers a real Windows UAC prompt; if you accept it, the command runs elevated and its output is still captured and shown normally (look for the small shield badge next to the snippet's name).

## Assertions ("expect")

Optionally set **Expect exit code** and/or **Expect output contains** in the editor. After the run, a green "✓ Expectation met" or red "✗ Expectation failed — …" line appears under the result — independent of whether the raw exit code was 0. Handy for turning an ad-hoc command into a lightweight smoke test, e.g. expecting a health-check endpoint's response to contain `"status":"ok"`.

## Run after — chaining snippets together

In the editor, set **Run after** to another snippet's name. The moment that other snippet finishes *successfully*, this one runs automatically — a toast announces the auto-run. Chains can run several snippets deep (capped at 5 hops to guard against an accidental A→B→A loop), but a chained snippet that itself needs placeholder input is skipped with a warning rather than run blind (there's nowhere to prompt for the value in an unattended chain).

```
"Build"  →  (on success) →  "Run tests"  →  (on success) →  "Deploy"
```

Set each one's **Run after** to point at the snippet before it, and running "Build" cascades through the whole chain.

## Scheduling: interval, daily, or cron

Toggle **"Run on a schedule"** in the editor and pick a mode:

- **Every N minutes** — runs on a fixed interval as long as the app is running.
- **Daily at** — runs once at a specific time each day.
- **Cron** — a standard 5-field expression (`minute hour day-of-month month day-of-week`), supporting `*`, `*/n` steps, ranges, and comma lists — e.g. `*/15 * * * *` for every 15 minutes, or `0 9 * * 1-5` for 9am on weekdays.

Scheduled runs happen entirely in the background (checked every 30 seconds), get logged to [run history](#run-history--diff-vs-previous-run) as `"<name> (scheduled)"`, and trigger their own native notification regardless of the general notification toggle. There's no built-in filter on what can be scheduled — anything enabled and due runs, so only schedule what you're comfortable running unattended.

## Batch run: select multiple, order them, run sequentially or in parallel

Click the checkbox icon in the header to enter **select mode** — every card gets a checkbox, and you can select snippets across different categories and filters. A bar at the top shows how many are selected; click **Configure & run…** to open a small dialog where you:

1. **Drag to reorder** the selected snippets into the sequence you want.
2. Choose **Sequential** (one after another, in that order) or **Parallel** (all fired off at once).
3. Click **Run**.

Parameterized snippets in the selection (they'd need placeholder input mid-batch, which there's no unattended way to provide) are skipped automatically and marked as such. Everything else gets its own **live** result row right in the dialog — a status dot that goes pending → running → green/red, and a click-to-expand output block — updating as each snippet finishes rather than running blind and only showing up in history afterward.

## Open in a real terminal

Every card has a small terminal icon — click it to drop the snippet's command (and working directory) into a real, interactive PowerShell (or CMD, for CMD snippets) window that stays open, instead of the one-shot inline console. Useful when you want to keep iterating on a command by hand after Snippet Runner gets you started.

## Categories, sorting & grouping

- Click any tag chip under the search box to filter to that category; click **All** (or the same chip again) to clear the filter.
- The sort dropdown next to the chips offers **Pinned first** (manual order, pins always on top), **A–Z**, **Most used**, and **Recently run**.
- The grid icon button toggles **group view**, which clusters the list under sticky, rounded category headers, each with its own **Run all** button — it runs every snippet in that category back-to-back (parameterized ones skipped, same as batch run) through the same live-output dialog batch run uses, rather than running blind.

## Favorites bar

Pin any snippet and it also appears as a small colored icon in a slim bar right under the search box — one click runs it immediately, regardless of what you've searched for or filtered to (the launcher clears the filter, scrolls to the card, and clicks its Run button for you, so a parameterized snippet still shows its inline placeholder form first, same as clicking Run on the card directly).

## Drag-and-drop reordering

When the sort mode is **Pinned first** and you aren't searching, filtering by tag, in group view, or in select mode, a small drag handle (⠿) appears on the left of each card on hover. Drag it above or below another card to reorder your library manually — the new order is saved immediately. Switch to any other sort mode any time without losing this manual order; it's remembered underneath.

## "Copy as" and the right-click menu

- The **Copy** button has a small chevron next to it — click it for **Copy as Markdown** (a fenced code block tagged with the snippet's shell, ready to paste into a doc or README) or **Copy as one-liner** (steps joined with `;` for a multi-step sequence). The dropdown always renders above the cards below it, never clipped.
- **Right-click** any card for a quick menu: Run, Open in terminal, Copy command, Edit, Duplicate, Pin/Unpin, Delete — without hunting for the small buttons.

## Run history & diff-vs-previous-run

Click the clock icon (or `Ctrl+H`) to open the history drawer — the last 100 runs, newest first, each showing the snippet name, a green/red status dot, relative time, and the exact command that ran. A search box at the top (with proper breathing room, not jammed against the header) filters the list by snippet name or command text. From there you can:

- **Re-run** any past command instantly
- **Copy** it to the clipboard
- **Clear** the whole log

Back on the card itself, once a snippet has run at least twice, a **"Diff vs last run"** toggle appears under the output — expand it to see which output lines were added or removed compared to the previous run. Great for "did anything change" checks like disk space, process lists, or `git status`.

## Undoing a delete

Deleting a snippet doesn't ask for confirmation up front — instead it disappears immediately and a toast appears at the bottom with an **Undo** button, active for a few seconds. Click it (or don't) — either way, nothing is lost until the toast disappears.

## Appearance: theme, accent color, density, blur, UI scale

Open **Settings → Appearance** to make the launcher look the way you want:

- **Theme** — Dark, Light, or System (follows your Windows light/dark app setting live).
- **Accent color** — pick one of 8 presets or a fully custom color; every hover/soft tint derives from it automatically, so there's only one color to choose.
- **Density** — Compact, Comfortable, or Spacious, controlling card padding and list spacing.
- **Background blur** — how much of the desktop shows (blurred) through the launcher.
- **UI scale** — 85%–125%, scales the entire interface if you want things bigger or smaller. The window always renders edge-to-edge at any scale — no black gaps at the borders.

All dropdowns across the app draw their own theme-correct chevron and get a focus glow matching the accent color, so appearance stays consistent everywhere, not just on the main list.

All of these are saved per-device (in the browser-style local storage of the app window) and apply instantly as you change them — no restart needed.

## Sound, desktop notifications & Developer mode

Also in **Settings → Behavior**:

- **Play a sound when a command finishes** — a short synthesized tone (higher pitch for success, lower for failure); no audio files involved.
- **Show a desktop notification when a command finishes in the background** — a native Windows notification, shown only when the launcher window isn't the one you're currently looking at, so you're not double-notified while watching it run.
- **Developer mode** — shows the exact executable and arguments Snippet Runner actually handed to Windows for each run (e.g. `→ powershell.exe ["-NoProfile","-NonInteractive","-Command","..."]`), right under the output. Useful when a snippet behaves differently than you'd expect and you want to see exactly what ran.

## Custom global hotkey

In **Settings → Behavior**, click the **Global hotkey** field, press the key combination you want (e.g. `Ctrl+Alt+K`), then click **Save**. If the combination is already claimed by another app, Snippet Runner tells you and keeps the previous one active — you're never left without a working hotkey.

## Settings: startup, backups, export & import

Click the gear icon to open Settings → **Data**:

- **Launch Snippet Runner at Windows startup** — toggles `openAtLogin` so the tray icon (and hotkey) are available as soon as you log in.
- **Manage variables…** — opens the [global variables](#global-variables) manager.
- **Automatic backups** — every meaningful change to your snippet library is snapshotted first (throttled to at most once every 5 minutes, keeping the last 10). Pick any backup from the list and click **Restore** to roll back — restoring itself takes a fresh snapshot first, so a restore is never a one-way trip either.
- **Export snippets…** — saves your entire library to a JSON file you choose, e.g. for backup or moving to another machine.
- **Import snippets…** — pick a previously exported JSON file; its snippets are **added** to your existing library (with fresh IDs, so nothing is overwritten or duplicated by accident).

**Example exported file shape** (trimmed):

```json
[
  {
    "id": "snip-1730000000000-ab12cd3",
    "name": "Ping a host",
    "tag": "network",
    "command": "Test-Connection {{host}} -Count 4",
    "pinned": true,
    "runCount": 12,
    "lastRunAt": "2026-08-30T09:15:00.000Z",
    "cwd": null,
    "shell": "powershell",
    "elevated": false,
    "steps": null,
    "stdin": null,
    "icon": "🌐",
    "notes": "Handy for a quick reachability check.",
    "env": null,
    "expect": null,
    "runAfter": null,
    "schedule": null
  }
]
```

## The default snippet library

Pre-installed on first launch, across 7 categories — everyday git/npm/docker commands alongside the Windows admin one-liners, so it's useful out of the box for developer and general-power-user workflows alike:

**git**
- Git status, Recent commits, Current branch, Pull latest, Uncommitted changes, List all branches

**npm**
- Install dependencies, Run dev server, Build, Outdated packages, Global packages, Clear npm cache

**docker**
- Running containers, All containers, List images, Compose up (detached), Compose down, Follow container logs (parameterized — `{{container}}`), Clean up unused data

**network**
- Listening ports, Ping a host (parameterized — `{{host}}`), Public IP address, Flush DNS cache, IP configuration, Network status (google.com)

**system**
- Top 5 CPU processes, Top 5 memory processes, System uptime, Kill process by name (parameterized — `{{name}}`), Restart Windows Explorer, Environment variables

**files**
- Disk free space, Biggest files in Downloads, Measure temp folder size, Find files by name (parameterized — `{{name}}`), Clear temp files

**utility**
- Current user & groups, Installed applications, Open a URL (parameterized — `{{url}}`), Generate a random password, Battery status, Recent Windows updates

Delete, edit, or duplicate any of these freely — they're just regular snippets.

## Where your data lives

Everything is stored locally, per Windows user, under:

```
%APPDATA%\snippet-runner\snippets.json      — your snippet library
%APPDATA%\snippet-runner\history.json       — the last 100 command runs
%APPDATA%\snippet-runner\variables.json     — your global variables
%APPDATA%\snippet-runner\app-settings.json  — custom hotkey, first-run flag
%APPDATA%\snippet-runner\backups\           — automatic rotating snippet-library backups (last 10)
```

Appearance and behavior preferences (theme, accent color, density, blur, UI scale, sound/notification/developer-mode toggles, sort mode, group view) live in the launcher window's own local storage rather than these files, since they're per-device display preferences rather than library data.

There is no cloud sync, telemetry, or network call other than the commands you explicitly run yourself (e.g. the built-in "Public IP address" snippet).

## Security model

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on the `BrowserWindow` — the UI has no direct access to Node.js or Electron internals.
- All filesystem, clipboard, shell-execution, and OS-integration (notifications, opening a folder, opening a terminal, the login-item toggle) access goes through a narrow `window.electronAPI` surface exposed by `src/preload/index.js` via `contextBridge`, backed by `ipcMain` handlers in the main process.
- Commands run exactly as you — no privilege escalation happens silently; **Run as Administrator** always shows a real Windows UAC consent prompt, and is only wired up for PowerShell.
- Global variables marked "secret" are hidden in the UI but stored as plain JSON locally — treat them as a convenience, not a credential vault.
- **There is no destructive-command guard.** Earlier versions of Snippet Runner blocked/confirmed commands matching patterns like `Remove-Item`, `Format-Volume`, `shutdown`, etc. That's gone, everywhere — no confirm-click, no scheduler skip, no batch-run skip. A snippet runs exactly when you tell it to (directly, scheduled, chained, or batched), full stop. This app can run anything a script you typed into a terminal yourself could — including something destructive — and that responsibility sits with whoever writes and triggers the snippet, not the app.

## Project structure

The app is split into three processes — `src/main` (Node/OS access), `src/preload` (the only bridge between them), `src/renderer` (pure UI, no Node access) — each further split into small, single-purpose files by concern rather than kept as one big file per process:

```
src/main/               Electron main process — the only side with Node/OS access
  index.js                entry point: pure wiring (window/tray/hotkey/IPC/scheduler startup)
  window.js               the launcher BrowserWindow: create/show/hide/toggle
  tray.js                 tray icon + its menu
  hotkey.js               global-shortcut registration, with safe fallback
  icon.js                 hand-rolled PNG encoder for the tray/window icon (no image assets)
  ipc.js                  every ipcMain handler — delegates to shell/*, storage/*, terminal
  scheduler.js             the 30s background tick: interval/daily/cron due-checks, scheduled runs
  paths.js, id.js, ps-quote.js, env-utils.js   small shared helpers
  shell/
    exec.js                the multi-shell execFile engine (PowerShell/CMD/Git Bash/WSL/Node/Python)
    terminal.js             opens a real, visible, interactive terminal window
  storage/
    snippets.js             snippet schema + sanitizer (DEFAULT_SNIPPETS lives here)
    history.js, app-settings.js, variables.js, backups.js

src/preload/index.js    contextBridge — the only surface the renderer can reach

src/renderer/            pure UI — no Node access, everything goes through window.electronAPI
  index.html, style.css
  app.js                  entry point: wires top-level DOM events, bootstraps state
  modules/                one ES module per concern (state, dom, cards, run-engine,
                           editor-modal, batch/batch-runner, scheduler UI, history-drawer,
                           variables-modal, settings-modal, menus, keyboard, theming, …)
```

See `CLAUDE.md` for the full architecture walkthrough (why each split exists, the conventions each module follows) if you're extending the app.

## Development

```bash
npm install
npm start
```

There's no bundler, test suite, or lint config — main/preload are plain CommonJS and the renderer is loaded directly by Electron as native ES modules (`<script type="module">`), no build step either way. After editing, just restart the app (`npm start`) to try your changes.

To catch syntax errors without launching the app: `node --check` for any `src/main/**/*.js` or `src/preload/**/*.js` file; for a `src/renderer/modules/*.js` file (ES module syntax, but `package.json` declares `"type": "commonjs"` so plain `node --check` won't parse `import`/`export`), pipe it through stdin with the module flag instead: `node --input-type=module --check < src/renderer/modules/whatever.js`.
