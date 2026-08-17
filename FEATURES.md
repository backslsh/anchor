# ⚓ Anchor — Feature List

## Tracking

### Habits

- Name, color, and emoji icon — the color identifies it everywhere else in the app
- A free-text *why*, shown back to you in Urge support at 1 am
- Optional cost per slip and minutes per slip, driving the "reclaimed" estimate
- Archive rather than delete, so historical entries never point at nothing
- Live preview while you create one

### Relapses

- Habit, date (backdatable), optional time
- Intensity on a 5-point scale — Barely / Mild / Medium / Strong / Overwhelming
- Trigger tags, with 16 suggestions plus anything you invent; previously used tags are offered back
- "What happened" free-text note
- **"A note to yourself for next time"** — surfaced later in Urge support

### Permanence

- A logged relapse **cannot be deleted**. `store.js` has no `removeRelapse()` at all — it is enforced in the data layer, not merely hidden in the UI
- Any field can be **amended**; every amendment is timestamped and appended to that entry's history, visible in the dialog
- Single escape hatch: **Settings → Erase everything**, which wipes the whole vault and requires typing `ERASE.`

### Goals

| Kind | Behaviour |
| --- | --- |
| Clean run | Reach N days free of a habit (or all habits). Completes itself and fires confetti |
| Budget | At most N slips per week/month/year. Counts down, turns red when exceeded |
| Milestone | Free-form, optional deadline, ticked off manually |

- Auto-generated titles, per-habit or across everything
- Goals are the only thing in the app you are allowed to delete

---

## The six views

### Dashboard

- Current clean run as a large number — click it for a live `Xd HH:MM:SS` counter
- Longest run, total logged, days to next milestone, % days clean
- The 3D crystal (see below)
- Daily quote card
- Per-habit rows with 30-day sparklines and individual streaks
- Recent entries timeline, click through to that day
- Active goals with animated progress
- Next-milestone progress ring
- Money and time reclaimed on the current run

### Calendar — the master view

- Month grid, each day carrying a color bar per habit involved
- Multi-entry count badge, clean-day markers, today outlined in the accent
- Hover tooltips listing what happened; quick-add button on hover
- **Shift-click** or **right-click** a day to log straight to it
- Year view: twelve mini heat-grids plus per-year totals; click a month to jump into it
- Legend doubles as a per-habit filter

### Habits

- Card per habit: clean-now, best run, clean-rate percentage
- 30-day heat strip, each cell clickable
- Separate archived section

### Goals

- Active and completed, with animated progress bars and state badges

### Insights

- KPIs: current run, longest, average run, % clean, total entries with a 30-vs-30-day trend
- Relapses by month (year selectable)
- Relapses by weekday, with your heaviest day called out
- **24-hour radial clock** identifying your danger window
- Split by habit
- Every clean run in order, with a verdict on whether they are lengthening
- Trigger tags weighted by frequency
- Intensity distribution
- Last-90-days strip
- Filter the whole page to a single habit

### Settings

- Appearance, privacy & lock, sync, data, quotes, and a written explanation of the permanence rule

---

## The dashboard crystal

Not decoration — it is your streak rendered in WebGL:

- **Height** = current run measured against your personal best
- **Ghost** = a hollow wireframe at your record; the gap between the tips is how many days you still need. Outgrow it, and it disappears
- **Satellites** = one crystal accreted per milestone cleared this run (1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365, 500, 730, 1000)
- **Shatters** when you log a relapse, then regrows from a chip
- Spin rate settles as your run lengthens — frantic when fresh, serene when long
- Hover any piece for what it represents; drag to spin with momentum; click to pulse
- Falls back to a canvas-2D renderer where WebGL is unavailable

---

## Privacy & security

- **PBKDF2-SHA256, 600,000 iterations → AES-256-GCM.** Real encryption at rest, not a JavaScript password check
- The passphrase is never stored — only a random salt and a small verifier blob
- Optional lock-screen hint; a wrong passphrase shakes and refuses
- **Auto-lock** after 5 / 15 / 60 minutes idle, plus **Ctrl + L**
- Locking clears the rendered DOM, so no plaintext sits behind the lock screen
- **Zero outbound requests.** No CDN, no fonts, no analytics, no dependencies
- Detects a non-secure context (where browsers withhold WebCrypto) and says so rather than failing silently
- Warns if it is running on a public host without a passphrase
- Encrypted JSON export/import, with merge or replace
- `SECURITY.md` documents the threat model, including what it cannot protect you from

---

## Sync

- **On by default**; `--no-sync` opts out. Starts itself as soon as a passphrase exists
- Your PC holds the master copy as **one AES-GCM envelope** — the server process cannot read a single entry
- Writes are authenticated by a token derived from the second half of the same PBKDF2 output, proving you know the passphrase without being reversible into the key
- The store **refuses anything that is not encrypted**
- Revision-checked: a stale write receives the current copy back and merges instead of clobbering
- **Union merge by id — a sync can never drop a relapse.** Where both sides hold the same entry, the copy with more amendments wins
- Last 40 revisions kept as backups
- Polls every 20s when visible, on window focus, and pushes debounced after edits
- **Phone bootstrap:** a new device fetches the PC's salt, you type the same passphrase, and your history decrypts in place — no export/import needed
- Also gives your vault a home on disk, so it survives the browser clearing storage

---

## Urge support

- 4-7-8 breathing overlay with a synced orb
- Shows your current run and what is riding on it (active goals)
- **Replays the notes you wrote to yourself** after previous slips
- Reachable from the rail, `P`, the command palette, or by typing `calm.`

---

## Quotes

- ~120 built-in lines — Stoics, recovery, discipline, self-compassion, momentum
- Deterministic daily rotation: the same day always shows the same line
- Shuffle, favorite, pin one permanently, or add your own to the rotation

---

## Things to discover

| Input | Effect |
| --- | --- |
| `Ctrl+K` or `/` | Command palette — everything is in it, including per-habit logging |
| `?` | Keyboard map |
| `1`–`6` | Jump between views |
| `L` `P` `N` `G` | Log · Urge · New habit · New goal |
| `←` `→` `T` | Move around the calendar |
| `Q` `F` | Shuffle / favourite the quote |
| `Ctrl+L` | Lock the vault |
| Click the streak number | Live second counter |
| Type `calm` | Breathing exercise |
| Type `why` | Your own reasons, read back to you |
| Konami code | Unlocks **Terminal**, a theme that is not on the ladder at all |

Plus milestone confetti and toasts, tips that drip out as you use it (resettable
from Settings), and a `window.anchor` console surface for the curious.

---

## Theme ladder

You start with two themes. The rest are earned by your **longest clean run**:

| Theme | Unlocks at |
| --- | --- |
| Aurora, Tide | from the start |
| Moss | 7 days |
| Ember | 15 days |
| Rose | 30 days |
| Ash | 60 days |
| Glacier | 90 days |
| Copper | 180 days |
| **Aurelian** | **365 days** |

Copper and Aurelian go further than a hue swap — they retint the whole
interface, so arriving at one looks like a different app.

Unlocks key off your *longest* run, never your current one. A relapse costs you
the streak counter; it never takes a theme back. Settings shows the locked ones
greyed out with what they cost, so there is always something to aim at, and a
small celebration fires the moment one is earned.

There is also a tenth theme that is not on the ladder and is not listed
anywhere until you find it.

---

## Interface

- Dark throughout, built as a single page with no separate homepage
- Nine accent themes on an unlock ladder — see below
- Week starts Sunday or Monday
- Clean-day markers toggleable on the calendar
- Fully responsive; the sidebar becomes a bottom bar on mobile
- Animated view transitions, staggered chart bars, shimmering progress fills
- Honors `prefers-reduced-motion`
- Charts and progress bars render at their true values even if animations never
  run, so nothing is left stuck at zero in a background tab
- Re-renders itself at midnight so streak counters roll over on their own

---

## Running it

Zero dependencies. No build step. No `npm install`. Node 18+ only.

```bash
node serve.js --open      # this machine only, loopback
node serve.js --lan       # HTTPS + sync, reachable from your phone
```

Windows users can double-click `start.bat` or `start-phone.bat`.

- `--lan` generates a self-signed certificate on first run (SANs for every local
  IP, 825-day validity so iOS accepts it) because browsers only expose WebCrypto
  over HTTPS or localhost
- Server hardening: path-traversal protection, the data directory is never
  servable, `nosniff` / `no-referrer` / `noindex` headers, SPA fallback
- MIT licensed
