# Security & threat model

Anchor holds some of the most sensitive data a person can write down. This
document says plainly what it protects against and what it does not. If you are
deciding whether to trust it with your record, read the second half first.

**Anchor has not been independently audited.** It is a small, dependency-free
project. The cryptography uses the browser's own WebCrypto primitives rather
than hand-rolled maths, which is the right call, but "used standard primitives"
is not the same as "reviewed by a cryptographer."

---

## What it actually does

**No backend, no account, no telemetry.** There is no sign-up, no analytics, no
crash reporting, no CDN. The app makes zero outbound requests — the only network
call it can make is to its own sync endpoint on your machine, and only if you
turn that on. You can verify this: `grep -r "http" assets/js` and check the
Network tab.

**Encryption at rest.** When you set a passphrase:

| | |
| --- | --- |
| Key derivation | PBKDF2-SHA256, 600,000 iterations, 16-byte random salt |
| Cipher | AES-256-GCM (authenticated — tampering is detected, not just hidden) |
| Key storage | none; derived fresh from your passphrase each unlock |
| Stored instead | the salt, and a small verifier blob so a wrong passphrase fails cleanly |

The passphrase is never written to disk, never sent anywhere, and never leaves
the browser tab. There is no recovery mechanism, by design.

**Sync stores ciphertext only.** In LAN mode your PC keeps
`.anchor-data/vault.json`, which contains one AES-GCM envelope and nothing else.
The Node process has no key and cannot read a single entry. Writes are
authenticated with a token derived from the second half of the same PBKDF2
output the key comes from — it proves you know the passphrase without being
reversible into the key.

**Permanence.** A logged relapse cannot be deleted, only amended, with every
amendment timestamped. This is a data-integrity property, not a security one —
it protects the record from you on a bad night, not from an attacker.

---

## What it does not protect against

Please read this part.

**Anyone who can run code in your browser can read everything.** While the vault
is unlocked, your entries exist as plain JavaScript objects. That means:

- **Browser extensions** with page access can read your data. This is the most
  realistic threat to most people, and Anchor cannot defend against it.
- **Anyone at your unlocked computer** can open devtools and read the state.
- **Malware or a keylogger** on your device defeats the passphrase entirely.

**Whoever serves the app controls the app.** This is the fundamental limit of
browser-delivered cryptography. If someone can modify the files being served to
you, they can serve a version that quietly copies your passphrase. Concretely:

- On **LAN mode**, the certificate is self-signed, so there is no identity
  verification. Another device on your network could in principle impersonate
  the server. They would only get ciphertext from the store — but they could
  serve you altered JavaScript. Use it on networks you trust.
- On a **public host** (Netlify, GitHub Pages), you are trusting that host and
  your DNS. The encryption still protects the data at rest in your browser, but
  the code delivering it is only as trustworthy as the origin.

Running it locally from your own machine avoids this entirely, which is why that
is the recommended mode.

**A forgotten passphrase is unrecoverable.** There is no reset, no backdoor, no
support email that can help. That is what makes it private. Export a backup.

**Clearing browser data deletes your history.** localStorage is not durable
storage. "Clear site data", some privacy cleaners, and iOS's storage reclamation
can all wipe it. Keep backups.

**Local storage is not encrypted unless you set a passphrase.** Before you set
one, entries sit in plain text in your browser profile. Anchor tells you this on
first run, and again if it detects it is running on a public host.

**Encryption is unavailable outside a secure context.** Browsers only expose
WebCrypto over HTTPS or on localhost. Over plain `http://` at a LAN address it is
simply absent, and Anchor will warn you rather than pretend. Use `--lan`, which
serves HTTPS.

---

## If you are writing about this project

Accurate things to say:

- No account, no subscription, no servers, no telemetry
- Entries are encrypted on your own device with a passphrase only you know
- Private by architecture — there is no backend that *could* leak
- Free and open source; you can read every line

Please do **not** say "100% secure", "unhackable", "military-grade", or
"impossible to access." Those are false for all software including this, and
people making decisions about deeply personal data deserve better than
marketing. "Private by design, and here is exactly what that means" is a
stronger claim anyway, because it is true.

---

## Reporting a vulnerability

Open an issue for anything non-sensitive. For something that could put users at
risk, contact the maintainer privately first and give a reasonable window before
disclosing.

---

## Not a medical device

Anchor is a self-tracking tool, not treatment. If what you are tracking involves
alcohol, drugs, self-harm, or anything where a relapse could be dangerous, keep
a real person in the loop — a doctor, a therapist, or a helpline. A calendar is
a good mirror and a poor safety net.
