# ⚓ Anchor

**A relapse tracker that runs on your own machine and keeps your record to
itself.**
<div align="center">

<img width="900" alt="Anchor dashboard" src="https://github.com/user-attachments/assets/4a608eda-cf26-48ea-94a3-6dd2a0ee4ada" />

<p>
<a href="https://www.npmjs.com/package/anchor-tracker"><img alt="npm" src="https://img.shields.io/npm/v/anchor-tracker?color=7c5cff&label=npm"></a>
<a href="https://github.com/backslsh/anchor/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/backslsh/anchor?color=00d6c2"></a>
<!-- <img alt="zero dependencies" src="https://img.shields.io/badge/dependencies-0-3ddc97"> -->
<a href="https://socket.dev/npm/package/anchor-tracker"><img alt="security score" src="https://badge.socket.dev/npm/package/anchor-tracker/1.1.1"></a>
<img alt="telemetry: none" src="https://img.shields.io/badge/telemetry-none-3ddc97">
<!-- <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/github/license/backslsh/anchor?color=9aa6bd"></a> -->
<img alt="." src="https://github.com/backslsh/anchor/actions/workflows/release.yml/badge.svg">
<img src="https://img.shields.io/npm/unpacked-size/anchor-tracker">
</p>

</div>


Habits with colors, a master calendar, goals, daily quotes, urge support, and a
permanent record you can amend but never erase.

No account. No subscription. No servers. No telemetry. No build step, and not a
single dependency — clone it, run one command, and it works offline forever.

Most habit and recovery trackers want an email address, a monthly fee, and a
copy of the most private thing about you on someone else's database. Anchor is
the other option: it is *private by architecture*, because there is no backend
that could leak. When you set a passphrase, your entries are encrypted on your
own device with AES-256-GCM, and the key never leaves your browser.

It is also honest about its limits — see **[SECURITY.md](SECURITY.md)** for the
full threat model, in plain language, including the things it cannot protect
you from.
> [!NOTE]
> This software has only been tested thoroughly on a Windows device. It is not guaranteed to function properly or at all on non-Windows operating systems. If you are using Anchor on Linux, macOS, or another OS, please let us know if it functions!

> [!IMPORTANT]
> **Not medical software.** Anchor is a self-tracking tool, not treatment. If
> what you are tracking involves alcohol, drugs, self-harm, or anything where a
> relapse could be dangerous, please keep a real person in the loop too and consider ways to get assistance.

> [!NOTE]
> This software is provided as-is, with NO WARRANTY, to the extent of applicable law.
> You can find more information and screenshots by scrolling down. ↓↓

## Table of Contents:
- [Download](https://github.com/backslsh/anchor/#download-nothing-to-install)
- [Run with npx](https://github.com/backslsh/anchor/#run-it-with-one-command)
- [Quick Start](https://github.com/backslsh/anchor/#quick-start)
- [Server Options](https://github.com/backslsh/anchor/#server-options)
- [Using Anchor on a mobile device](https://github.com/backslsh/anchor/#using-it-on-your-phone)
- [Permanence Rule](https://github.com/backslsh/anchor/#the-permanence-rule)
- [Password Protection](https://github.com/backslsh/anchor/#password-protection)
- [Streak Pet](https://github.com/backslsh/anchor/#dashboard-crystal)
- [What's Included](https://github.com/backslsh/anchor/#whats-in-it)
- [Things to Find](https://github.com/backslsh/anchor/#things-to-find)
- [Files](https://github.com/backslsh/anchor/#files)
- [Building the executables](https://github.com/backslsh/anchor/#building-the-executables)
- [Contributing](https://github.com/backslsh/anchor/#contributing)
- [License](https://github.com/backslsh/anchor/#license)
- [IMPORTANT NOTE](https://github.com/backslsh/anchor/#a-note)
- [Full Feature List](https://github.com/backslsh/anchor/blob/main/FEATURES.md)

---

## Download (nothing to install)

Grab the file for your system from the
[latest release](https://github.com/backslsh/anchor/releases/latest):

| System | File |
| --- | --- |
| Windows | `Anchor-windows.exe` |
| macOS | `Anchor-macos` |
| Linux | `Anchor-linux` |

Double-click it and Anchor opens in your browser.

> [!NOTE]
> **This is not an installer.** It is the whole application in one file. It
> copies nothing into Program Files, writes nothing to the registry, and needs
> no admin rights. Anchor runs while the window is open and stops when you close
> it, so keep the file somewhere handy and double-click it whenever you want it.

Your data lives in a folder called `.anchor` in your home directory, *not* next
to the file — so moving the app, renaming it, or downloading a newer version
never loses your history. Pass `--portable` if you would rather keep everything
together on a USB stick.

> [!IMPORTANT]
> The downloads are not code-signed, because certificates cost money a free tool
> does not have. Windows SmartScreen will say "Windows protected your PC" —
> click **More info → Run anyway**. macOS will refuse the first launch —
> **right-click → Open**, then confirm. On Linux, `chmod +x Anchor-linux` first.

---

## Run it with one command

If you already have Node:

```bash
npx anchor-tracker
```

Nothing is installed permanently — `npx` fetches it, runs it, and Anchor opens
in your browser. Your data goes to a `.anchor` folder in your home directory, so
it survives updates and cache clears.

To keep it around:

```bash
npm install -g anchor-tracker
anchor-tracker
```

---

## Quick start
For Mac users, open 'Terminal' and enter:
```bash
git clone https://github.com/YOUR-USERNAME/anchor.git
cd anchor
node serve.js --open
```

### Windows users can just double-click **`start.bat`**.

> [!TIP]
> Node 18+ is the only requirement. There is nothing to install — no `npm
install`, no bundler, no framework.
> [Install Node 18+](https://nodejs.org/en/download/current)
> _Be sure to select the correct operating system you are using, eg., Windows_

On first run you get a blank slate: no habits, no entries, no passphrase. Set
one in **Settings → Privacy & lock** and it encrypts everything from then on.

---

## Server options

It serves at <http://127.0.0.1:4321/> and binds to loopback only, so nothing
else on your network can reach it.

| Flag | Meaning |
| --- | --- |
| `--lan` | HTTPS + sync, reachable from your phone (see below) |
| `--port 5000` | Use a different port |
| `--open` | Open your browser automatically |
| `--portable` | Keep data beside the executable instead of in your home folder |
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

The demo also has **every theme unlocked**, so you can try the palettes without
waiting a year for the gold one. That applies to the demo vault only — a real
vault still has to earn them. Use `?demo=locked` if you want authentic lock
states instead.

It only fills an **empty** vault. If you already have a habit or a single entry
it refuses, so it can never overwrite a real record. Clear it afterwards with
**Settings → Erase everything**.

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

**A certificate warning.** The cert is self-signed and generated on first run,
in-process — Anchor builds the X.509 itself, so nothing needs to be installed
and OpenSSL is not required. It covers `localhost` and every local IP, and is
issued for under 825 days so iOS accepts it. Tap *Advanced → Continue*. You must
accept it — see below.

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
afternoon, and you end up with both.

Turn it off per device in **Settings → Sync with this PC**.

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
<img width="547" height="859" alt="image" src="https://github.com/user-attachments/assets/d543c07c-5021-4f2a-80ad-1d87862e5872" />


The single escape hatch is **Settings → Erase everything**, which wipes the
entire vault at once and requires typing `ERASE`. That is a decision, not an
edit.

---

## Password protection

Anchor's lock screen is **not** a JavaScript `if (password === …)` check that a
determined person could step around in devtools.
<img width="1919" height="959" alt="image" src="https://github.com/user-attachments/assets/87fa3345-9e2f-42e0-bc8d-9eed3ab6e5ca" />


When you set a passphrase in **Settings → Privacy & lock**:
<img width="1696" height="953" alt="image" src="https://github.com/user-attachments/assets/ed815e2c-bfae-4d8a-9ea3-c61d1d5c10cc" />


- The passphrase is stretched with **PBKDF2-SHA256, 600,000 iterations**
- That yields an **AES-256-GCM** key
- Your whole vault is encrypted with it before being written to `localStorage`
- The passphrase itself is never stored — only a random salt and a small
  verifier blob, so a wrong passphrase simply fails to decrypt

Without the passphrase, the stored data is ciphertext. Not hidden — unreadable.

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

<img width="436" height="339" alt="image" src="https://github.com/user-attachments/assets/05f23cf6-b991-4312-94a7-7da33a611f38" />

- **Height** is your current clean run measured against your personal best
- The hollow **ghost** standing over it is that record — the gap between the two
  tips is how many days you still need
- Each **satellite crystal** at the base is a milestone this run has cleared
  (1, 3, 7, 10, 14, 21, 30 …)
- Log a relapse and it **shatters**, then regrows from a chip

Hover over any piece to see what it represents. Drag to spin it.

---

## What's in it

**Dashboard** — current clean run, a WebGL solid that gets calmer and brighter
the longer you go, the day's quote, per-habit streaks with sparklines, active
goals, next milestone, and an estimate of money and time reclaimed.
<img width="1705" height="969" alt="image" src="https://github.com/user-attachments/assets/1604be5a-82db-4f89-86cb-dbc19759adf2" />


**Calendar** — month grid with a color bar per habit on each day, plus a year
view of twelve mini heatmaps and per-year totals. Click the legend to filter.
<img width="1711" height="969" alt="image" src="https://github.com/user-attachments/assets/938c0fac-632a-459d-9cdd-a79e908424ed" />


**Habits** — one color per behavior, an optional written reason you will read
back on a bad night, a 30-day heat strip, and optional cost/minutes per slip.
<img width="1706" height="966" alt="image" src="https://github.com/user-attachments/assets/f01471ab-6200-4c21-89bb-b928ec64f9e0" />


**Goals** — three kinds:
- *Clean run* — reach N days; completes itself
- *Budget* — at most N slips per week/month/year
- *Milestone* — free-form, with an optional deadline
<img width="1699" height="955" alt="image" src="https://github.com/user-attachments/assets/383f1b90-ed98-4413-b34c-d259b78089e2" />


**Insights** — by month, by weekday, by hour on a 24-hour clock, split by habit,
every clean run in order, your named triggers weighted by frequency, and
intensity distribution.
<img width="1705" height="961" alt="image" src="https://github.com/user-attachments/assets/c8e8d6b5-1f7c-4349-b692-090923d9def7" />


**Urge support** — a 4-7-8 breathing overlay that also shows your current run,
what is riding on it, and the notes you wrote to yourself after previous slips.
<img width="1705" height="960" alt="image" src="https://github.com/user-attachments/assets/feb6c7be-87df-420f-bfac-2d0eee974138" />


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
runtime, and depends on nothing at all.

The only build-time dependency is `postject`, fetched on demand via `npx`, which
performs the injection. Nothing from it ends up in the output.

Single Executable Applications cannot cross-compile — a Windows `.exe` has to be
built on Windows. `.github/workflows/release.yml` builds all three platforms on
a tag push, smoke tests each from an empty directory, and attaches them to a
draft release.

---

## Contributing

> [!WARNING]
> Only install and run Anchor from repositories you trust; @backslsh is the original author.
> Other dependencies may have maliciously modified code; use at your own risk.

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
