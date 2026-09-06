# Snippet Runner

A local, Windows-only shell snippet launcher in the style of Raycast/Spotlight. Press a global hotkey from anywhere, search your library of one-liners and multi-step scripts, and run them — across **PowerShell, CMD, Git Bash, WSL, Node.js, Python, or SSH** — with parameterized inputs, reusable (and computed) variables, saved groups, visual branching pipelines with delay/approval-gate/sub-pipeline steps, background/long-running processes, scheduling, external HTTP/file-watch triggers, batch runs with live per-snippet output, run-after chaining, assertions, a Ctrl+K command palette, and a Health panel that flags problems before they bite you.

There is no destructive-command guard of any kind — Snippet Runner runs exactly what you tell it to, exactly when you tell it to (including on a schedule, in a batch, via a pipeline, or via an external trigger). That's a deliberate choice: you own your commands and their consequences. See [Security model](#security-model).

Everything runs locally. The only network calls Snippet Runner ever makes on its own are the commands *you* choose to run, an update check against this repo's GitHub Releases, and — only if you set one up yourself — a subscribed snippet library URL or an external HTTP trigger request. Nothing else leaves your machine.

---

## Table of contents

- [What it is](#what-it-is)
- [Feature tour](#feature-tour)
- [Getting started](#getting-started)
- [Using the launcher](#using-the-launcher)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Creating and editing snippets](#creating-and-editing-snippets)
- [Multiple shells: PowerShell, CMD, Git Bash, WSL, Node.js, Python, SSH](#multiple-shells-powershell-cmd-git-bash-wsl-nodejs-python-ssh)
- [Parameterized snippets](#parameterized-snippets)
- [Templates — generate variants from a list of values](#templates--generate-variants-from-a-list-of-values)
- [Global variables (computed, with encrypted secrets)](#global-variables-computed-with-encrypted-secrets)
- [Capture a value from output into a variable](#capture-a-value-from-output-into-a-variable)
- [Multi-step sequences](#multi-step-sequences)
- [Working directory, environment variables, stdin & Run as Administrator](#working-directory-environment-variables-stdin--run-as-administrator)
- [Background & long-running processes](#background--long-running-processes)
- [Assertions ("expect")](#assertions-expect)
- [Run after — chaining snippets together](#run-after--chaining-snippets-together)
- [Scheduling: interval, daily, or cron](#scheduling-interval-daily-or-cron)
- [Schedule overview](#schedule-overview)
- [Batch run: select multiple, order them, run sequentially or in parallel](#batch-run-select-multiple-order-them-run-sequentially-or-in-parallel)
- [Groups — saved sets of snippets](#groups--saved-sets-of-snippets)
- [Pipelines — branching visual graphs](#pipelines--branching-visual-graphs)
- [Open in a real terminal](#open-in-a-real-terminal)
- [Categories, sorting & grouping](#categories-sorting--grouping)
- [Favorites bar](#favorites-bar)
- [Drag-and-drop reordering](#drag-and-drop-reordering)
- ["Copy as" and the right-click menu](#copy-as-and-the-right-click-menu)
- [Run history, output & search](#run-history-output--search)
- [Undoing a delete](#undoing-a-delete)
- [Health — catching problems before you hit them](#health--catching-problems-before-you-hit-them)
- [Import from terminal history](#import-from-terminal-history)
- [Command palette (Ctrl+K)](#command-palette-ctrlk)
- [External triggers — running a snippet from outside the launcher](#external-triggers--running-a-snippet-from-outside-the-launcher)
- [File-watch triggers](#file-watch-triggers)
- [Shared/external snippet libraries](#sharedexternal-snippet-libraries)
- [Appearance: theme, accent color, density, blur, UI scale](#appearance-theme-accent-color-density-blur-ui-scale)
- [Sound, desktop notifications & Developer mode](#sound-desktop-notifications--developer-mode)
- [Custom global hotkey](#custom-global-hotkey)
- [Settings: startup, updates, export & import](#settings-startup-updates-export--import)
- [The default snippet library](#the-default-snippet-library)
- [Where your data lives](#where-your-data-lives)
- [Security model](#security-model)
- [Project structure](#project-structure)
- [Development](#development)

---

## What it is

Snippet Runner is a small Electron app (TypeScript + React, Zustand for state): a frameless, always-on-top, blurred card that pops up over whatever you're doing, lets you fuzzy-search a library of shell snippets, and runs the one you pick — right there, with the output shown inline. It's meant to replace the "open a terminal, retype the same `Get-Process | Sort-Object CPU -Descending | Select -First 5` you've typed a hundred times" workflow — and to grow with you into a small local automation tool: schedule a health check, chain a build into a deploy, wire a handful of snippets into a branching pipeline, start a dev server and leave it running in the background, batch-run a dozen diagnostics in one go, or trigger a snippet from a script outside the launcher entirely.

It ships with 42 ready-made snippets (git, npm, docker, network, system, files, utility) across 7 categories, a full editor for your own, and a Settings panel to make the whole thing look and behave the way you want.

## Feature tour

**Launcher**
- Global hotkey toggle, **customizable** in Settings (default `Ctrl+Shift+Space`, falls back to `Alt+Space` if taken)
- Frameless, centered, transparent, rounded, always-on-top window with a soft CSS shadow — clean at any [UI scale](#appearance-theme-accent-color-density-blur-ui-scale), no artifacts
- **Resizable**, with your chosen size remembered and restored next time — the layout reflows to fit rather than clipping or leaving dead space
- Hides on `Escape`, on losing focus, or on closing — it never actually quits unless you tell it to (via the tray menu), so the hotkey and background state are always ready
- System tray icon (generated in-process, no image assets) with **Show/Hide** and **Quit**
- A one-time native notification the first time the app runs, pointing you at the hotkey/tray
- Search box auto-focuses every time the window is summoned

**Snippet library**
- Add, **Edit**, **Duplicate**, and Delete snippets (delete shows an **Undo** toast)
- **Pin** favorites so they always float to the top, and show up in the always-visible **favorites bar**
- Custom **icon** per snippet (pick an emoji, or let it auto-derive from the tag) and an optional **notes** field
- Auto-colored, auto-iconed tag chips, consistent theme-correct dropdowns/comboboxes everywhere in the app
- Free-text search across name, tag, command text, working directory, notes, and sequence steps
- 4 sort modes: *Pinned first*, *A–Z*, *Most used*, *Recently run* — plus **manual drag-and-drop reordering**
- *Group by category* view, with a **Run all** button per group
- **Select mode** — multi-select any set of snippets across categories for a [batch run](#batch-run-select-multiple-order-them-run-sequentially-or-in-parallel)
- Right-click any card for a quick actions menu
- Per-snippet usage stats ("Ran 7× · last 2m ago") shown right on the card
- A **Health** panel that scans your whole library for broken working directories, dangling run-before/run-after links, and recently-failing snippets

**Execution**
- Runs under **PowerShell, CMD, Git Bash, WSL, Node.js, Python, or SSH** (a remote host) — pick the shell per snippet
- UTF‑8 forced end-to-end, so pipes, aliases, and Cyrillic/Ukrainian output render correctly instead of turning into `???`
- Optional **working directory**, **environment variables**, **stdin input**, and **Run as Administrator** (PowerShell, real UAC prompt) per snippet
- **Background/long-running processes** — Start/Stop/Restart a dev server, `docker compose up`, or a watcher instead of a one-shot run, with live streamed output and optional crash auto-restart
- **Multi-step sequences**, **run-after chaining**, and **scheduling** (interval, daily, or cron)
- **Parameterized snippets** — `{{placeholder}}` tokens prompt for values right on the card, pre-filled from [global variables](#global-variables-computed-with-encrypted-secrets) when a name matches
- **Generate variants** — turn one parameterized snippet into several concrete ones at once, from a list of values
- **Capture from output** — extract a value out of a run's stdout/stderr straight into a global variable, via a regex
- **Assertions** — expect a specific exit code and/or output text, checked independently of the raw exit code
- **Groups** (saved sets of snippets, run together) and **Pipelines** (branching graphs with delay/approval-gate/sub-pipeline steps, AND/OR joins, per-step retries, a concurrency cap, and their own schedule) — both their own full-screen views
- **Copy**, or **"Copy as"** Markdown/one-liner, or copy the last run's output
- **Open in a real terminal** when a one-shot run isn't enough
- Output that looks like JSON is auto-pretty-printed; a **Diff vs last run** toggle shows what changed
- Optional sound cue and desktop notification when a command finishes
- **Developer mode** shows the exact executable/args actually sent to the OS

**Automation beyond the launcher**
- **External HTTP triggers** — a loopback-only, token-gated server so a scheduled task, CI job, or another local script can kick off a snippet without opening the app
- **File-watch triggers** — run a snippet automatically whenever a chosen file or folder changes
- **Shared/external snippet libraries** — subscribe to a URL serving a JSON snippet feed; it merges in read-mostly and refreshes on demand
- **Import from terminal history** — turn commands you already typed into PowerShell or Git Bash into a saved snippet, without retyping them
- **Command palette (Ctrl+K)** — fuzzy-run any snippet or jump to any screen without touching the mouse

**History, personalization, security & data**
- Every run (single, sequence, scheduled, batch, pipeline, or triggered) is logged with timestamp, exit code, duration, and output — up to the last 100 runs, **searchable** by name, command text, *or captured output*, with output viewable per entry behind its own toggle
- **Theme** (Dark/Light/System), **accent color**, **density**, **background blur**, and **UI scale**, all applied instantly
- **Global variables**, with a **computed** mode (its value comes from running a snippet, refreshed manually or on an interval) and a **secret** flag that both masks the value in the UI and encrypts it at rest (Windows DPAPI via Electron's `safeStorage`)
- **Launch at Windows startup** toggle and **in-app self-update** (checks this repo's GitHub Releases)
- **Export** your whole snippet library to a JSON file, or **Import** one (merged in, never overwrites existing snippets)

## Getting started

**Requirements:** Windows 10/11, [Node.js](https://nodejs.org/) (for `npm`). Git Bash, WSL, Node.js, and Python are optional — only needed if you create a snippet that uses that particular shell.

```bash
git clone <this-repo>
cd ElectronBasics
npm install
npm start
```

`npm start` runs `electron-vite dev` (a local Vite dev server for the renderer with hot reload, main/preload rebuilt automatically on change) and launches the app hidden in the tray. Press **`Ctrl+Shift+Space`** to bring up the launcher (the first time you run it, a notification reminds you of this).

On first launch, `snippets.json` and `history.json` are created automatically in your user data folder, pre-seeded with the [default snippet library](#the-default-snippet-library).

To build an installable/portable copy: `npm run build` (NSIS installer) or `npm run build:portable` (portable `.exe`) — see [Development](#development).

## Using the launcher

1. Press `Ctrl+Shift+Space` (or `Alt+Space`, or whatever you've [rebound it to](#custom-global-hotkey)) from anywhere.
2. Start typing — the list filters live by name, tag, command text, working directory, or notes.
3. Click a tag chip (`network`, `system`, `disk`, …) to filter to just that category, or use the sort dropdown to reorder the list.
4. Click **Run** (or select a card and press `Enter`, or press `1`–`9` for one of the first nine visible cards) to execute it. Output — stdout and stderr — appears in a console block right under the card.
5. Click **Copy** to copy the raw command to your clipboard instead of running it.
6. Press `Escape` (or click outside the window) to hide the launcher again — your place is remembered for next time.
7. Drag an edge or corner of the window to resize it — the layout reflows, and the new size is remembered for next time.

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
| `Escape` | Hide the window — or close whatever screen/modal/drawer/menu/dropdown is open |
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
- Optional **working directory**, **shell**, **environment variables**, **stdin**, **Run as Administrator**, **background process**, **expected exit code / output**, **run-after chaining**, **schedule**, and free-form **notes**

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

## Multiple shells: PowerShell, CMD, Git Bash, WSL, Node.js, Python, SSH

Pick a shell per snippet from the editor's **Shell** dropdown:

| Shell | Runs via | Notes |
|---|---|---|
| **PowerShell** (default) | `powershell.exe -Command` | UTF-8 forced; the only shell that supports **Run as Administrator** |
| **CMD** | `cmd.exe /c` | UTF-8 forced via `chcp 65001` |
| **Git Bash** | `bash.exe -lc` | Looked up on PATH, then the usual Git-for-Windows install paths |
| **WSL** | `wsl.exe -e bash -lc` | Uses your default WSL distro |
| **Node.js** | `node -e` | Runs the command text as a JS one-liner/script |
| **Python** | `python -c` | `PYTHONIOENCODING`/`PYTHONUTF8` forced so output decodes correctly |
| **SSH** | `ssh.exe user@host <command>` | Runs on a remote host — set **Host**, **Port**, **Username**, and an optional **Identity file** once these fields appear; your snippet's working directory (if set) is `cd`'d into remotely first |

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

Multiple placeholders are supported — each gets its own input row, in the order they first appear. If a placeholder's name matches a saved [global variable](#global-variables-computed-with-encrypted-secrets), its field is pre-filled automatically (still editable per run).

A snippet with an unresolved placeholder is skipped (marked "needs input") in every unattended context — scheduled runs, run-after chains, batch/group "Run all", pipelines, and external triggers — since there's nowhere to prompt for a value there.

## Templates — generate variants from a list of values

Right-click a parameterized snippet and choose **Generate variants…** to turn it into several concrete snippets at once instead of retyping the same command with a different value each time:

1. If it has more than one `{{placeholder}}`, pick which one varies.
2. Paste a list of values, one per line (e.g. a list of hostnames).
3. Optionally set a name pattern — `{{value}}` in the pattern is replaced per snippet (defaults to `<original name> (<value>)`).
4. Click **Generate** — one new, ready-to-run snippet is created per value, with that placeholder substituted (any *other* placeholder in the command is left alone, still fillable per run the normal way).

## Global variables (computed, with encrypted secrets)

Open **Settings → Manage variables…** to define reusable name/value pairs — for example `server = prod-db-01` or `user = svc-deploy`. From then on, any snippet with a matching `{{server}}` or `{{user}}` placeholder pre-fills that value the moment you click Run, across your *entire* library, without retyping it snippet by snippet.

- Mark a variable **secret** to mask it as a password field in the UI — and to actually **encrypt its value at rest** using Electron's `safeStorage` (backed by Windows DPAPI, tied to your Windows user account on this machine). A non-secret variable is stored as plain text, same as before.
- Because a DPAPI-encrypted value only decrypts on the same machine/account that wrote it, a secret variable is **not** portable — it isn't included in snippet export/import, and copying `variables.json` to another PC (or account) won't let that copy read the secret's value back.
- Click the **link icon** on a variable to make it **computed**: pick a source snippet, and the variable's value becomes that snippet's trimmed output instead of something you type in by hand. Refresh it manually anytime, or set it to refresh automatically on its own interval (e.g. every 30 minutes) — handy for something like `{{currentBranch}}` always reflecting `git branch --show-current`.
- Whenever you run a snippet and type a value for a placeholder that already has a matching variable, that variable's stored value is quietly updated to match — so it stays current without extra steps.
- Variables are stored in `variables.json` in your user data folder (see [Where your data lives](#where-your-data-lives)).

## Capture a value from output into a variable

In the editor, under **Capture from output**, add a variable name and a regex pattern (e.g. `id: (\w+)` — group 1 if the pattern has one, otherwise the whole match). After every run of that snippet, the pattern is checked against its combined output, and a match is saved straight into that global variable — creating it if it doesn't exist yet. Works for a manual run, a scheduled/triggered run, and a pipeline step alike, so a step can hand a value (a container ID, a generated token, …) forward to whatever runs after it.

## Multi-step sequences

Toggle **"Multi-step sequence"** in the editor to turn a snippet into an ordered list of steps instead of one command. Each step runs after the previous one finishes, and the output console shows a separate pass/fail block per step — a sequence never stops on the first failure by default (there's also a **"Stop on first failed step"** toggle if you want that instead).

```
Name:  Morning network check
Tag:   network
Steps:
  1. Clear-DnsClientCache
  2. Test-NetConnection google.com
  3. Get-NetTCPConnection -State Listen | Measure-Object | Select-Object Count
```

Placeholders work inside sequence steps too, and are collected once up front before the whole sequence runs. (Multi-step sequences don't support per-step stdin or the background-process toggle — both are single-command-only.)

## Working directory, environment variables, stdin & Run as Administrator

**Working directory** — set once per snippet, so you don't have to `cd`/`Set-Location` inside the command itself. A small folder icon appears on the card to open it directly in File Explorer. The [Health panel](#health--catching-problems-before-you-hit-them) flags a working directory that no longer exists.

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

## Background & long-running processes

Toggle **"Run as a background process"** (single-command snippets only) to turn Run into **Start/Stop** for something that's meant to keep running — a dev server, `docker compose up`, `tail -f`, a file watcher. Once started:

- Output streams live into the card's console as it happens, instead of waiting for the process to finish.
- A **Restart** button resets it with the same options.
- **"Restart automatically if it crashes"** gives a crashed (non-zero-exit, not manually-stopped) process up to 5 automatic restarts, resetting that budget once it's stayed up a minute.
- Stopping kills the whole process tree, not just the immediate child — the actual work (node/docker/ngrok…) is very often a grandchild of the shell that was spawned, and a shallow kill would otherwise orphan it running invisibly.
- Background processes survive **hiding** the launcher window (that's the point), but are all stopped when you actually **quit** the app — nothing keeps running invisibly after Snippet Runner itself exits.

## Assertions ("expect")

Optionally set **Expect exit code** and/or **Expect output contains** in the editor. After the run, a green "✓ Expectation met" or red "✗ Expectation failed — …" line appears under the result — independent of whether the raw exit code was 0. Handy for turning an ad-hoc command into a lightweight smoke test, e.g. expecting a health-check endpoint's response to contain `"status":"ok"`.

## Run after — chaining snippets together

In the editor, set **Run after** to another snippet's name. The moment that other snippet finishes *successfully*, this one runs automatically — a toast announces the auto-run. Chains can run several snippets deep (capped at 5 hops to guard against an accidental A→B→A loop), but a chained snippet that itself needs placeholder input is skipped with a warning rather than run blind.

```
"Build"  →  (on success) →  "Run tests"  →  (on success) →  "Deploy"
```

Set each one's **Run after** to point at the snippet before it, and running "Build" cascades through the whole chain. A snippet's **Details** panel (the ⓘ button on its card) shows this chain in both directions, plus which groups and pipelines it belongs to — useful before you rename or delete something with dependents.

## Scheduling: interval, daily, or cron

Toggle **"Run on a schedule"** in the editor and pick a mode:

- **Every N minutes** — runs on a fixed interval as long as the app is running.
- **Daily at** — runs once at a specific time each day.
- **Cron** — a standard 5-field expression (`minute hour day-of-month month day-of-week`), supporting `*`, `*/n` steps, ranges, comma lists, and named months/days — e.g. `*/15 * * * *` for every 15 minutes, or `0 9 * * 1-5` for 9am on weekdays.

Scheduled runs happen entirely in the background (checked every 30 seconds), get logged to [run history](#run-history-output--search) as `"<name> (scheduled)"`, and trigger their own native notification regardless of the general notification toggle — clicking it reopens the launcher on run history. There's no built-in filter on what can be scheduled — anything enabled and due runs, so only schedule what you're comfortable running unattended.

## Schedule overview

Click the calendar icon in the header to see **every scheduled snippet in one place**, soonest-due first — each row shows its schedule ("every 15 minutes", "daily at 09:00", "cron \"0 9 * * 1-5\"") and roughly when it's next due ("in 4h", "any moment now"). From here you can jump straight into a snippet's editor, or click **Run now** to fire it immediately without waiting.

## Batch run: select multiple, order them, run sequentially or in parallel

Click the checkbox icon in the header to enter **select mode** — every card gets a checkbox, and you can select snippets across different categories and filters. A bar at the top shows how many are selected; click **Configure & run…** to open a small dialog where you:

1. **Drag to reorder** the selected snippets into the sequence you want.
2. Choose **Sequential** (one after another, in that order) or **Parallel** (all fired off at once).
3. Click **Run**.

Parameterized snippets in the selection are skipped automatically and marked as such. Everything else gets its own **live** result row right in the dialog — a status dot that goes pending → running → green/red, and a click-to-expand output block — updating as each snippet finishes.

## Groups — saved sets of snippets

Click the layers icon in the header to open **Groups** — a full-screen view of every saved group as a card, each showing how many snippets it contains and a description. Click **+ New group** to name one and check off which snippets belong to it; from then on, click **Run** on the group's card to run every member together through the same live-output dialog batch run uses, without reselecting them each time.

A group is just a list of snippet ids, not a copy — it always reflects each member's current command/tag/etc., and a deleted member is silently skipped rather than breaking the group. A snippet's card shows a small badge when it belongs to one or more groups; its **Details** panel links straight into each group's editor.

## Pipelines — branching visual graphs

Click the branching-path icon in the header to open **Pipelines** — a full-screen node-graph editor (built on React Flow) for chaining snippets with actual branching logic, not just a straight line. Click **+ New pipeline**, then add one or more kinds of step from the toolbar:

- **Snippet** — a normal step that runs one of your saved snippets. Set **Retries** (with a delay between attempts) if it's a flaky step that deserves a couple of extra tries before counting as failed.
- **Delay** — a pure wait (in seconds), no snippet involved — for pacing a pipeline out, e.g. giving a service a moment to come up before the next step checks it.
- **Gate** — pauses the pipeline for a manual **Continue**/**Abort** click, right in the results dialog — useful for a risky step (like a production deploy) you want a human to explicitly approve. A gate is automatically treated as "not approved" if the pipeline runs on a schedule, since there's nobody there to click it.
- **Sub-pipeline** — runs another saved pipeline inline, as if it were a single step; its overall success/failure feeds the branch that follows it. (You can't pick a target that would eventually point back to the pipeline you're editing — the picker only offers ones that wouldn't.)

Then:

1. Drag from a step's connection dot onto another step to link them.
2. Click a connection to choose its **condition** — *succeeds*, *fails*, *either way*, *exits with a specific code*, or *output contains text* — the step it points to only runs if that condition is met by the step before it.
3. If a step has more than one incoming connection, its Inspector panel lets you choose **Any incoming link (OR)** — the default, fires the first time a satisfied connection arrives — or **Every incoming link (AND)** — waits for every incoming connection's step to finish and requires all of them to be satisfied before it fires.
4. **Auto-arrange** lays every step out left-to-right in dependency order with one click, undoing a canvas that's turned into a tangle.
5. Click **Settings** in the toolbar to give the whole pipeline its own **schedule** (same interval/daily/cron options a snippet has) and a **max steps running at once** cap (0 = unlimited).

Every root step (nothing points into it) starts in parallel when you run the pipeline; from there, each finished step's satisfied outgoing connections fire the next step(s) per the join rule above. If any step anywhere in the pipeline is parameterized, running it first asks for every value once, up front, rather than skipping those steps. Running a saved pipeline (or one you're editing) opens the same live per-step results dialog batch run and groups use, and the canvas itself highlights whichever step is currently running and colors each connection as it's walked. A snippet's **Details** panel lists which pipelines it's used in, same as it does for groups.

## Open in a real terminal

Every card has a small terminal icon — click it to drop the snippet's command (and working directory) into a real, interactive PowerShell (or CMD, for CMD snippets) window that stays open, instead of the one-shot inline console. Useful when you want to keep iterating on a command by hand after Snippet Runner gets you started.

## Categories, sorting & grouping

- Click any tag chip under the search box to filter to that category; click **All** (or the same chip again) to clear the filter.
- The sort dropdown next to the chips offers **Pinned first** (manual order, pins always on top), **A–Z**, **Most used**, and **Recently run**.
- The grid icon button toggles **group view**, which clusters the list under sticky, rounded category headers, each with its own **Run all** button — it runs every snippet in that category back-to-back (parameterized ones skipped, same as batch run) through the same live-output dialog batch run uses.

## Favorites bar

Pin any snippet and it also appears as a small colored icon in a slim bar right under the search box — one click runs it immediately, regardless of what you've searched for or filtered to.

## Drag-and-drop reordering

When the sort mode is **Pinned first** and you aren't searching, filtering by tag, in group view, or in select mode, a small drag handle (⠿) appears on the left of each card on hover. Drag it above or below another card to reorder your library manually — the new order is saved immediately. Switch to any other sort mode any time without losing this manual order; it's remembered underneath.

## "Copy as" and the right-click menu

- The **Copy** button has a small chevron next to it — click it for **Copy as Markdown** (a fenced code block tagged with the snippet's shell, ready to paste into a doc or README) or **Copy as one-liner** (steps joined with `;` for a multi-step sequence).
- **Right-click** any card for a quick menu: Run, Open in terminal, Copy command, Edit, Duplicate, Pin/Unpin, Delete — without hunting for the small buttons.

## Run history, output & search

Click the clock icon (or `Ctrl+H`) to open the history drawer — the last 100 runs, newest first, each showing the snippet name, a green/red status dot, relative time, and the exact command that ran. From there you can:

- **Re-run** any past command instantly, or **Copy** it to the clipboard.
- Click **Output** on any entry to expand its captured stdout/stderr right there in the list, without re-running it — collapsed by default so the list stays scannable.
- **Search** the whole history — the search box matches not just the snippet name and command text, but the *captured output* too, so you can find "that run where it said connection refused" even if you don't remember which snippet it was.
- **Clear** the whole log.

Back on the card itself, once a snippet has run at least twice, a **"Diff vs last run"** toggle appears under the output — expand it to see which output lines were added or removed compared to the previous run.

## Undoing a delete

Deleting a snippet doesn't ask for confirmation up front — instead it disappears immediately and a toast appears at the bottom with an **Undo** button, active for a few seconds. Click it (or don't) — either way, nothing is lost until the toast disappears.

## Health — catching problems before you hit them

Click the pulse icon in the header to open **Health** — a scan of your whole library for issues that don't show up until you actually run something:

- A **working directory that no longer exists** (moved or deleted since the snippet was set up).
- A **run-before/run-after link pointing at a deleted snippet**.
- A snippet whose **most recent run failed**.

Every flagged snippet links straight to its Details panel or its editor ("Fix…") — Health never changes anything on its own, it only surfaces what's worth a look. Click **Rescan** any time to refresh it (e.g. after fixing a path).

## Import from terminal history

Click the history-arrow icon in the header to browse commands you've **already typed** into PowerShell (via its PSReadLine history) or Git Bash (`.bash_history`) on this machine. Filter the list, check off one or more lines, optionally give the result a name, and click **Create snippet** — a single checked line becomes a one-command snippet, several become an ordered multi-step sequence (in the order you originally typed them). **Create & edit…** does the same thing and then drops you straight into the full editor to refine it further (tag, working directory, schedule, etc.).

## Command palette (Ctrl+K)

Press `Ctrl+K` from anywhere in the launcher to open a fuzzy-searchable list of every snippet (typing part of its name/tag/command finds it, typos included) plus quick jumps to every other screen — Settings, Groups, Pipelines, Health, Schedule, run history, or a brand-new snippet. Use `↑`/`↓` and `Enter`, or just click a result. Selecting a snippet runs it immediately the same way clicking Run on its card would; a parameterized one opens the editor instead, since there's no card here to show its inline form on.

## External triggers — running a snippet from outside the launcher

Open **Settings → Triggers** to turn on a small local HTTP server that lets something *outside* Snippet Runner start a snippet — a Windows scheduled task, a CI job on the same machine, another script you already have. It's bound to `127.0.0.1` only (never reachable over the network) and gated by a generated token:

```
POST http://127.0.0.1:<port>/run/<snippetId>?token=<token>
```

(the token can also be sent as an `X-Trigger-Token` header instead of a query parameter). Copy a snippet's id from its **Details** panel. A triggered run is logged to history as `"<name> (triggered)"`, fires the same completion notification a scheduled run does, and — like every other unattended path in this app — refuses a snippet with unresolved `{{placeholder}}` tokens rather than running it blind. Regenerate the token any time from the same Settings section to invalidate the old one immediately.

## File-watch triggers

In **Settings → File-watch triggers**, click **+ Add file-watch trigger**, choose a file or folder, and pick which snippet should run whenever it changes (a folder is watched recursively). A rebuild-on-save, in other words, without needing an external watcher tool. Rapid bursts of changes (e.g. a build touching many files at once) are coalesced into a single run rather than firing once per file event.

## Shared/external snippet libraries

Open **Settings → Shared libraries** to subscribe to a URL that serves a JSON array of snippets (the same shape [export](#settings-startup-updates-export--import) produces). Paste the URL and click **Subscribe** — its snippets are fetched, validated, and merged into your library, each one badged so it's clear where it came from. Click **Sync** any time to re-fetch and pick up changes; a snippet you've pinned or run stays pinned/keeps its run stats across a re-sync, but the command/tag/etc. itself always reflects the source. Click the trash icon to unsubscribe, which removes every snippet that library added (anything you've customized locally isn't touched).

The fetch happens in the main process, not the renderer — the app's content-security policy blocks the renderer from calling out to arbitrary URLs on its own, so this is the one deliberate, user-initiated exception, done in the one process actually allowed to make it.

## Appearance: theme, accent color, density, blur, UI scale

Open **Settings → Appearance** to make the launcher look the way you want:

- **Theme** — Dark, Light, or System (follows your Windows light/dark app setting live).
- **Accent color** — pick one of 8 presets or a fully custom color; every hover/soft tint derives from it automatically, so there's only one color to choose.
- **Density** — Compact, Comfortable, or Spacious, controlling card padding and list spacing.
- **Background blur** — how much of the desktop shows (blurred) through the launcher.
- **UI scale** — 85%–125%, scales the entire interface if you want things bigger or smaller. The window always renders edge-to-edge at any scale — no black gaps at the borders.

All of these are saved per-device (in the browser-style local storage of the app window) and apply instantly as you change them — no restart needed.

## Sound, desktop notifications & Developer mode

Also in **Settings → Behavior**:

- **Play a sound when a command finishes** — a short synthesized tone (higher pitch for success, lower for failure); no audio files involved.
- **Show a desktop notification when a command finishes in the background** — a native Windows notification, shown only when the launcher window isn't the one you're currently looking at.
- **Developer mode** — shows the exact executable and arguments Snippet Runner actually handed to Windows for each run, right under the output.

## Custom global hotkey

In **Settings → Behavior**, click the **Global hotkey** field, press the key combination you want (e.g. `Ctrl+Alt+K`), then click **Save**. If the combination is already claimed by another app, Snippet Runner tells you and keeps the previous one active — you're never left without a working hotkey.

## Settings: startup, updates, export & import

Click the gear icon to open Settings — a sidebar of categories (Appearance, Behavior, Automation, Updates, Libraries, Data, Help), each its own scrolling pane, rather than one long page:

- **Launch Snippet Runner at Windows startup** (Data category) — toggles `openAtLogin` so the tray icon (and hotkey) are available as soon as you log in.
- **Manage variables…** — opens the [global variables](#global-variables-computed-with-encrypted-secrets) manager.
- **Updates** — shows the running version and a **Check for updates** button; if a newer release is published on this project's GitHub Releases, you can download it and restart to install, all as explicit clicks (nothing updates itself silently in the background).
- **Export snippets…** — saves your entire library to a JSON file you choose, e.g. for backup or moving to another machine.
- **Import snippets…** — pick a previously exported JSON file; its snippets are **added** to your existing library (with fresh ids, so nothing is overwritten or duplicated by accident).
- **Triggers** and **File-watch triggers** live under the **Automation** category; **Shared libraries** has its own **Libraries** category — see their own sections above.
- **Help** — a categorized, step-by-step walkthrough of every non-obvious feature (Groups, Pipelines, variables, scheduling, triggers, background processes, templates, libraries, batch runs), each one an expandable entry rather than a wall of text. Also reachable via the command palette ("Help — how each feature works").

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
    "runAfterThis": null,
    "runBefore": null,
    "schedule": null,
    "background": false,
    "autoRestart": false,
    "externalSource": null
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
%APPDATA%\snippet-runner\variables.json     — your global variables (secrets encrypted at rest)
%APPDATA%\snippet-runner\groups.json        — your saved groups
%APPDATA%\snippet-runner\pipelines.json     — your saved pipelines
%APPDATA%\snippet-runner\libraries.json     — subscribed external library URLs
%APPDATA%\snippet-runner\watch-triggers.json — file-watch trigger rules
%APPDATA%\snippet-runner\app-settings.json  — custom hotkey, window size, trigger config
```

Appearance and behavior preferences (theme, accent color, density, blur, UI scale, sound/notification/developer-mode toggles, sort mode, group view) live in the launcher window's own local storage rather than these files, since they're per-device display preferences rather than library data.

There is no cloud sync or telemetry. The only network calls Snippet Runner makes on its own are: the commands you explicitly run yourself (e.g. the built-in "Public IP address" snippet), an update check against this repo's GitHub Releases, a subscribed library URL you added yourself, and an external trigger request you (or something you set up) send to the loopback server you turned on yourself.

## Security model

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on the `BrowserWindow` — the UI has no direct access to Node.js or Electron internals.
- All filesystem, clipboard, shell-execution, and OS-integration access goes through a narrow `window.electronAPI` surface exposed by `src/preload/index.ts` via `contextBridge`, backed by `ipcMain` handlers in the main process.
- Commands run exactly as you — no privilege escalation happens silently; **Run as Administrator** always shows a real Windows UAC consent prompt, and is only wired up for PowerShell.
- A variable marked "secret" is encrypted at rest via Windows DPAPI (`safeStorage`), tied to your Windows user account on this machine — it's real encryption, but it's still a convenience, not a general-purpose credential vault, and it isn't portable to another machine/account.
- The external trigger server binds to `127.0.0.1` only and requires a token on every request — it is never reachable from the network, only from this same machine.
- **There is no destructive-command guard.** Earlier versions of Snippet Runner blocked/confirmed commands matching patterns like `Remove-Item`, `Format-Volume`, `shutdown`, etc. That's gone, everywhere — no confirm-click, no scheduler skip, no batch-run skip, no trigger-side check. A snippet runs exactly when you tell it to (directly, scheduled, chained, batched, piped through a pipeline, or triggered externally), full stop. This app can run anything a script you typed into a terminal yourself could — including something destructive — and that responsibility sits with whoever writes and triggers the snippet, not the app.

## Project structure

The app is split into three processes — `src/main` (Node/OS access), `src/preload` (the only bridge between them), `src/renderer` (UI) — built with **TypeScript + React** via `electron-vite`, each further split into small, single-purpose files by concern:

```
src/main/                 Electron main process — the only side with Node/OS access
  index.ts                  entry point: pure wiring (window/tray/hotkey/IPC/scheduler/trigger-server startup)
  window.ts                 the launcher BrowserWindow: create/show/hide/toggle, resizable + persisted size
  tray.ts                   tray icon + its menu
  hotkey.ts                 global-shortcut registration, with safe fallback
  icon.ts                   hand-rolled PNG encoder for the tray/window icon (no image assets)
  ipc.ts                    every ipcMain handler — delegates to shell/*, storage/*, terminal
  scheduler.ts              the 30s background tick: interval/daily/cron due-checks, snippets AND pipelines
  unattendedRun.ts          shared "run this snippet with no one watching" logic (scheduler + triggers + file-watch)
  pipelineRunner.ts         the unattended (scheduled) pipeline walker
  triggerServer.ts          the optional loopback HTTP trigger server
  fileWatcher.ts            the optional fs.watch-based file-watch triggers
  computedVariables.ts      refreshes a "computed" variable by running its source snippet
  updater.ts                electron-updater wrapper: manual check/download/install
  paths.ts, id.ts, ps-quote.ts, env-utils.ts   small shared helpers
  shell/
    exec.ts                  the multi-shell execFile engine (PowerShell/CMD/Git Bash/WSL/Node/Python/SSH)
    process-manager.ts        spawn-and-stream engine for background/long-running snippets
    terminal.ts               opens a real, visible, interactive terminal window
    history-import.ts         reads real PowerShell/Git Bash history for the import screen
  storage/
    snippets.ts               snippet schema + sanitizer (DEFAULT_SNIPPETS lives here)
    history.ts, app-settings.ts, variables.ts, groups.ts, pipelines.ts, libraries.ts, watchTriggers.ts

src/preload/index.ts      contextBridge — the only surface the renderer can reach

src/shared/                hand-written types + zod schemas (types/, imported by both main and renderer),
                            plus captures.ts and pipelineWalk.ts — small pure logic shared by both processes

src/renderer/               UI — no Node access, everything goes through window.electronAPI
  index.html, style.css
  app.ts                     entry point: header wiring, initial load, side-effect imports
  modules/                   state.ts (shared mutable state), dom.ts (element refs), batch.ts
  src/
    main.tsx                 React entry point (#reactRoot)
    App.tsx                  every full-screen/modal/drawer surface
    components/              Card/, Modals/ (Editor, History, Groups, Pipelines, Health, Schedule,
                              TerminalHistory, Template, CommandPalette, Settings, …), shared/, TagFilters, FavoritesBar
    store/                   one Zustand store per feature
    lib/                     runEngine, processEngine, pipelineEngine, pipelineFlow, quickRun, keyboard,
                              events, snippetsStore, appearance, scheduleOverview, utils, …
```

See `CLAUDE.md` for the full architecture walkthrough (why each split exists, the conventions each module follows) if you're extending the app.

## Development

```bash
npm install
npm start
```

- **Typecheck**: `npm run typecheck`
- **Unit tests**: `npm test` (Vitest — covers main-process pure logic: sanitizers, per-shell invocation building, the cron/schedule matcher)
- **Build an installer**: `npm run build` (NSIS) or `npm run build:portable` (portable `.exe`)

`npm start` runs `electron-vite dev` — hot-reloads the renderer on save; a main/preload change rebuilds and relaunches the app automatically.
