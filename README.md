# ⚓ Anchor

**A relapse tracker that runs on your own machine and keeps your record to
itself.**

Habits with colours, a master calendar, goals, daily quotes, urge support, and a
permanent record you can amend but never erase.

No account. No subscription. No servers. No telemetry. No build step, and not a
single dependency — clone it, run one command, and it works offline forever.

Most habit and recovery trackers want an email address, a monthly fee, and a
copy of the most private thing about you on someone else's database. Anchor is
the other option: it is *private by architecture*, because there is no backend
that could leak. When you set a passphrase your entries are encrypted on your
own device with AES-256-GCM, and the key never leaves your browser.

It is also honest about its limits — see **[SECURITY.md](SECURITY.md)** for the
full threat model, in plain language, including the things it cannot protect
you from.

> **Not medical software.** Anchor is a self-tracking tool, not treatment. If
> what you are tracking involves alcohol, drugs, self-harm, or anything where a
> relapse could be dangerous, please keep a real person in the loop too.

---

## Get it

### Download (no install, nothing to set up)

Grab the file for your system from the
[latest release](https://github.com/YOUR-USERNAME/anchor/releases/latest):

| | |
| --- | --- |
| Windows | `Anchor-windows.exe` |
| macOS | `Anchor-macos` |
| Linux | `Anchor-linux` |

Double-click it. Anchor opens in your browser and that's it.

**There is nothing to install.** This is not an installer — it is the whole
application in one file. It copies nothing into Program Files, writes nothing to
the registry, and needs no admin rights. It runs while the window is open and
stops when you close it, so keep the file somewhere you can get at easily and
double-click it whenever you want Anchor.

Your data lives in a folder called `.anchor` in your home directory, *not* next
to the file — so moving the app, renaming it, or downloading a newer version
never loses your history. Pass `--portable` if you would rather keep everything
together on a USB stick.

macOS will refuse an unsigned download the first time: **right-click → Open**,
then confirm. (Signing costs $99/year, which rather defeats the point of a free
tool.) On Linux you may need `chmod +x Anchor-linux` first.

### Or run it from source

```bash
git clone https://github.com/YOUR-USERNAME/anchor.git
cd anchor
node serve.js --open
```

Windows users can just double-click **`start.bat`**. Node 18+ is the only
requirement — no `npm install`, no bundler, no framework.

Either way, first run gives you a blank slate: no habits, no entries, no
passphrase. Set one in **Settings → Privacy & lock** and it encrypts everything
from then on.

---

## Server options

It serves at <http://127.0.0.1:4321/> and binds to loopback only, so nothing
else on your network can reach it.

| Flag | Meaning |
| --- | --- |
| `--lan` | HTTPS + sync, reachable from your phone (see below) |
| `--port 5000` | Use a different port |
| `--open` | Open your browser automatically |
| `--no-sync` | Disable the on-disk sync store (it is on by default) |

> **Why a server at all?** The app uses ES modules, which browsers refuse to
> load over `file://`. Opening `index.html` directly will show a blank page.

**Sync is on by default**, including for local-only use. Once you set a
passphrase, your vault is written to `.anchor-data/vault.json` as ciphertext as
well as living in the browser — so your history survives clearing site data, and
any other device you point at this server shares the same record. Nothing syncs
before a passphrase exists, because the store refuses unencrypted data.

---

## Trying it without committing to anything

Load a sample vault — fourteen months of invented history with a real
improvement arc, a 41-day run in progress against a 62-day record:

```
http://localhost:4321/?demo
```

Or from the browser console: `anchor.demo()`

It only fills an **empty** vault. If you already have a habit or a single entry
it refuses and says so, so it can never overwrite a real record. To wipe the
sample data afterwards, use **Settings → Erase everything**.

This is also what the screenshots above are taken from, so what you see is what
you get.

---

## Using it on your phone

```bash
node serve.js --lan
```

Or double-click **`start-phone.bat`**. Leave the window open while you use it.

It prints the addresses to type into your phone, e.g. `https://192.168.1.24:4443/`.
Pick the one on your actual Wi-Fi adapter — virtual adapters (VMware, VirtualBox,
Hyper-V) get listed too and won't work.

Your phone must be on the same network as the PC.

### Two things that will happen the first time

**A certificate warning.** The cert is self-signed and generated on first run
(SANs for every local IP, 825-day validity so iOS accepts it). Tap
*Advanced → Continue*. You must accept it — see below.

**It will ask for your passphrase, then pull your history down.** No export or
import needed. The phone fetches the PC's KDF salt, you type the same
passphrase, and it decrypts your real data in place.

### Why HTTPS is not optional here

Browsers only expose `crypto.subtle` — the API the entire passphrase and
encryption layer is built on — in a **secure context**: HTTPS, or localhost.
Over plain `http://192.168.x.x` it is simply `undefined`, and encryption cannot
work at all. `--lan` exists to satisfy that requirement. If Anchor ever detects
it is running without it, it says so rather than failing quietly.

### How the sync works

Your PC holds the master copy in `.anchor-data/vault.json`. That file contains
**one AES-GCM blob and nothing else** — the server process cannot read a single
entry, because the key never leaves the browser.

- Writes are authenticated by a token derived from your passphrase. It is the
  second half of the same PBKDF2 output the key comes from, so it proves you
  know the passphrase without being reversible into the key.
- The store refuses to accept anything that isn't an encrypted envelope.
- Every write is revision-checked. A stale write gets the current copy back and
  merges instead of clobbering.
- The last 40 revisions are kept in `.anchor-data/backups/`.

**Merges never drop a relapse.** The merged set is the union by id — the same
promise the rest of the app makes. If the same entry exists on both devices, the
copy with more amendments wins. Log on your phone and your PC on the same
afternoon and you end up with both.

Turn it off per-device in **Settings → Sync with this PC**.

> `.anchor-data/` holds your encrypted vault and your TLS private key. Don't
> commit it or copy it anywhere public.

---

## The permanence rule

**A logged relapse cannot be deleted.** There is no delete button, no context
menu item, and no store method that removes one — `store.js` deliberately has no
`removeRelapse()`.

What you *can* do is **amend** it: change the habit it belongs to, the date, the
time, the intensity, the triggers, the notes. Every amendment is timestamped and
appended to that entry's history, which is shown at the bottom of the amend
dialog.

The single escape hatch is **Settings → Erase everything**, which wipes the
entire vault at once and requires typing `ERASE`. That is a decision, not an
edit.

---

## Password protection

Anchor's lock screen is **not** a JavaScript `if (password === …)` check that a
determined person could step around in devtools.

When you set a passphrase in **Settings → Privacy & lock**:

- The passphrase is stretched with **PBKDF2-SHA256, 600,000 iterations**
- That yields an **AES-256-GCM** key
- Your whole vault is encrypted with it before being written to `localStorage`
- The passphrase itself is never stored — only a random salt and a small
  verifier blob, so a wrong passphrase simply fails to decrypt

Without the passphrase the stored data is ciphertext. Not hidden — unreadable.

There is **no recovery**. If you forget it, the data is gone. That is the
tradeoff that makes it real. Export a backup somewhere safe.

Also available once protection is on:

- **Auto-lock** after 5 / 15 / 60 minutes idle
- **Ctrl + L** to lock immediately
- An optional lock-screen hint

**What this does not cover** — browser extensions, malware on your device, and
anyone at your unlocked screen can all still reach your data. Read
[SECURITY.md](SECURITY.md) before trusting it with anything you could not bear
to have exposed.

*(Terminology: Anchor uses a **passphrase**, not a WebAuthn "passkey". Longer is
better than cleverer — a short memorable sentence beats `Xk7$q`.)*

---

## Dashboard crystal

The object on the dashboard is not decoration. It is your streak:

- **Height** is your current clean run measured against your personal best
- The hollow **ghost** standing over it is that record — the gap between the two
  tips is how many days you still need
- Each **satellite crystal** at the base is a milestone this run has cleared
  (1, 3, 7, 10, 14, 21, 30 …)
- Log a relapse and it **shatters**, then regrows from a chip

Hover any piece to see what it represents. Drag to spin it.

---

## Putting it on Netlify

The folder is already a valid Netlify site — `netlify.toml` sets the SPA
redirect plus a strict CSP, `X-Frame-Options`, and `noindex` headers.

**Set a passphrase before you deploy.** If Anchor detects it is running on a
non-localhost host without encryption enabled, it will say so on load.

Deploy by dragging the folder onto <https://app.netlify.com/drop>, or:

```bash
npx netlify-cli deploy --prod --dir .
```

### Netlify cannot do the live sync

Netlify serves static files only, so there is nowhere for the shared vault to
live. A Netlify deployment gives each device its own independent history; move
data across with **Settings → Export / Import**.

For live sync, run `--lan` from your PC instead. The two approaches don't
combine.

---

## What's in it

**Dashboard** — current clean run, a WebGL solid that gets calmer and brighter
the longer you go, the day's quote, per-habit streaks with sparklines, active
goals, next milestone, and an estimate of money and time reclaimed.

**Calendar** — month grid with a colour bar per habit on each day, plus a year
view of twelve mini heatmaps and per-year totals. Click the legend to filter.

**Habits** — one colour per behaviour, an optional written reason you will read
back on a bad night, a 30-day heat strip, and optional cost/minutes per slip.

**Goals** — three kinds:
- *Clean run* — reach N days; completes itself
- *Budget* — at most N slips per week/month/year
- *Milestone* — free-form, with an optional deadline

**Insights** — by month, by weekday, by hour on a 24-hour clock, split by habit,
every clean run in order, your named triggers weighted by frequency, and
intensity distribution.

**Urge support** — a 4-7-8 breathing overlay that also shows your current run,
what is riding on it, and the notes you wrote to yourself after previous slips.

---

## Things to find

Some of it is meant to be discovered, so this list is partial.

| | |
| --- | --- |
| `Ctrl + K` | Command palette — everything is in there |
| `?` | Full keyboard map |
| `1`–`6` | Jump between views |
| `L` / `P` / `N` / `G` | Log · Urge · New habit · New goal |
| `←` `→` `T` | Move around the calendar |
| Click the big streak number | Switches to a live second counter |
| Drag the 3D solid | It has momentum; clicking makes it pulse |
| Shift-click a calendar day | Logs straight to that date |
| Right-click a calendar day | Same thing |
| Type `calm` anywhere | Breathing exercise |
| Type `why` anywhere | Your own reasons, back at you |
| The Konami code | — |

The dashboard also drips out a tip every few minutes until you have seen them
all. **Settings → Show the tips again** resets that.

---

## Files

```
index.html            markup + overlay containers
netlify.toml          SPA redirect, CSP, security headers
serve.js              zero-dep server: static files + encrypted sync store
start.bat             Windows launcher (local only)
start-phone.bat       Windows launcher (HTTPS + sync, for phone access)
.anchor-data/         created on first --lan run: vault, backups, TLS cert
assets/css/app.css    the whole design system
assets/js/
  app.js              boot, routing, lock flow, keyboard, easter eggs
  store.js            state, mutators, selectors  ← permanence enforced here
  vault.js            localStorage + encryption at rest
  sync.js             pull/push, conflict resolution, union merge
  crypto.js           PBKDF2 → AES-GCM key + sync auth token
  crystal.js          procedural crystal geometry for the dashboard
  scene.js            WebGL renderer + lock-screen particle field
  ui.js               modals, toasts, tooltips, confetti, palette, breathing
  forms.js            the shared dialogs
  quotes.js           ~120 lines in rotation
  util.js             DOM builder + date helpers
  views/              dashboard · calendar · habits · goals · insights · settings
```

---

## Building the executables

```bash
node build.js
```

Produces `dist/Anchor-<platform>` using Node's built-in Single Executable
Application support: `serve.js` and every web asset are embedded into a copy of
the Node binary. The result is ~80 MB, because it contains a whole JavaScript
runtime, and depends on nothing.

The only build-time dependency is `postject`, fetched on demand via `npx`, which
performs the injection. Nothing from it ends up in the output.

SEA cannot cross-compile — a Windows `.exe` has to be built on Windows.
`.github/workflows/release.yml` builds all three platforms on a tag push, smoke
tests each one from an empty directory, and attaches them to a draft release:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

---

## Contributing

Issues and pull requests are welcome. A few ground rules that keep the project
what it is:

1. **No dependencies.** No npm packages, no CDN links, no build step. If it
   cannot be done with the platform, it probably should not be done here.
2. **No network calls.** The app must work with the network cable pulled. The
   only permitted request is to Anchor's own sync endpoint.
3. **Relapses stay permanent.** No pull request adds a delete button. Amend and
   audit, never erase — this is the point of the project, not a limitation.
4. **Be honest in the docs.** If a change weakens a security property, say so in
   [SECURITY.md](SECURITY.md) in the same PR.

### Before you commit

`.anchor-data/` is gitignored and holds your vault, your backups, and the TLS
private key generated for LAN mode. Never force-add it. To double-check what you
are about to publish:

```bash
git status --ignored --short
```

If you have ever run the app from your clone, confirm no `vault.json`, no
`*.pem`, and no `anchor-backup-*.json` appear in `git status`.

---

## License

[MIT](LICENSE). Fork it, rename it, make it yours.

---

## A note

This is a tracker, not treatment. If what you are tracking involves alcohol,
drugs, self-harm, or anything else where a relapse could be dangerous, please
also have a real person in the loop — a doctor, a therapist, or a helpline.
A calendar is a good mirror and a poor safety net.
