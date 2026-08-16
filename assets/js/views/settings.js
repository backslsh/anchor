/* views/settings.js */

import { el, clear, plural, fmtDate, DOW_FULL } from '../util.js';
import * as S from '../store.js';
import * as vault from '../vault.js';
import * as sync from '../sync.js';
import { strength, hasSubtle } from '../crypto.js';
import { modal, toast, field, segmented, switchRow, confirmDialog, confetti, toggleShortcuts } from '../ui.js';
import { quotePool } from '../quotes.js';

const ACCENTS = [
  { id: 'aurora', label: 'Aurora', c: ['#7c5cff', '#00d6c2'] },
  { id: 'tide',   label: 'Tide',   c: ['#2f9bff', '#61e8ff'] },
  { id: 'moss',   label: 'Moss',   c: ['#3ddc97', '#a8e05f'] },
  { id: 'ember',  label: 'Ember',  c: ['#ff7a45', '#ffc861'] },
  { id: 'rose',   label: 'Rose',   c: ['#ff5c9d', '#c17bff'] },
  { id: 'ash',    label: 'Ash',    c: ['#9aa6bd', '#d7e0f0'], lock: 90,
    note: 'Unlocks at a 90-day run' },
];

export function render(root, ctx) {
  clear(root);
  ctx.setSub('');
  const streak = S.currentStreak().days;
  const unlocked = S.setting('unlocked');

  /* ── appearance ─────────────────────────────────────── */
  root.appendChild(section('Appearance',
    el('div',
      el('label.fl', 'Accent'),
      el('div.row.wrap', { style: { gap: '10px' } }, ACCENTS.map(a => {
        const locked = a.lock && streak < a.lock && !unlocked.includes(a.id);
        const b = el('button.chip', {
          style: { opacity: locked ? .4 : 1, borderColor: S.setting('accent') === a.id ? a.c[0] : '',
                   background: S.setting('accent') === a.id ? a.c[0] + '22' : '' },
          title: locked ? a.note : a.label,
        },
          el('span', { style: { width: '26px', height: '13px', borderRadius: '4px', display: 'inline-block',
            background: `linear-gradient(90deg,${a.c[0]},${a.c[1]})` } }),
          a.label, locked ? el('span.muted', { style: { fontSize: '11px' } }, '🔒') : null);
        b.onclick = () => {
          if (locked) { toast('Locked', { sub: a.note, kind: 'warn' }); return; }
          S.setSetting('accent', a.id);
          document.documentElement.dataset.accent = a.id;
          ctx.rerender();
        };
        return b;
      })),
      el('p.hint', { style: { marginTop: '10px' } }, 'One theme is earned rather than chosen. There may be others.')),

    field('Week starts on', segmented(
      [{ value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }],
      S.setting('weekStart'), v => { S.setSetting('weekStart', v); toast('Calendar updated'); })),

    switchRow('Mark clean days on the calendar', S.setting('showClean'),
      v => { S.setSetting('showClean', v); }),
  ));

  /* ── privacy & lock ─────────────────────────────────── */
  const prot = vault.isProtected();
  root.appendChild(section('Privacy & lock',
    el('div.notice' + (prot ? '.info' : ''), el('span', prot ? '🔐' : '⚠'),
      el('span', prot
        ? 'Your vault is encrypted with AES-256-GCM. The key is derived from your passphrase and is never stored — losing it means losing the data.'
        : 'Your data is currently stored in plain text in this browser. That is fine on a machine only you use. Set a passphrase before you host this anywhere.')),

    el('div.row.wrap', { style: { gap: '10px' } },
      el('button.btn.' + (prot ? 'btn-ghost' : 'btn-primary'), { onclick: () => passphraseDialog(ctx, prot) },
        prot ? 'Change passphrase' : 'Set a passphrase'),
      prot ? el('button.btn.btn-ghost', { onclick: () => ctx.lock() }, 'Lock now') : null,
      prot ? el('button.btn.btn-danger', { onclick: () => removeProtection(ctx) }, 'Remove protection') : null),

    prot ? field('Auto-lock after inactivity', segmented(
      [{ value: 0, label: 'Never' }, { value: 5, label: '5 min' }, { value: 15, label: '15 min' }, { value: 60, label: '1 hour' }],
      S.setting('autoLockMin'), v => { S.setSetting('autoLockMin', v); ctx.resetIdle(); toast(v ? `Auto-lock set to ${v} minutes` : 'Auto-lock off'); })) : null,
  ));

  /* ── sync ───────────────────────────────────────────── */
  const st = sync.status();
  if (st.available) {
    root.appendChild(section('Sync with this PC',
      el('div.notice.info', el('span', '🔄'), el('span',
        'Your PC keeps the master copy. It stores only the encrypted blob — the passphrase and the key never leave the browser, so the server cannot read a single entry.')),

      prot
        ? switchRow('Keep this device in sync', sync.isEnabled(), v => {
            sync.setEnabled(v);
            toast(v ? 'Sync on' : 'Sync off',
              { sub: v ? 'Changes flow both ways within a few seconds.' : 'This device now keeps its own copy.' });
            ctx.rerender();
          })
        : el('div.notice', el('span', '⚠'), el('span',
            'Set a passphrase first. The sync store refuses anything that is not encrypted, so there is nothing safe to send yet.')),

      sync.isEnabled() ? el('div.kpi',
        kbox('r' + st.rev, 'Revision'),
        kbox(st.lastSyncAt ? new Date(st.lastSyncAt).toLocaleTimeString() : '—', 'Last sync'),
        kbox(st.busy ? 'Working' : st.lastError ? 'Error' : 'Idle', 'Status')) : null,

      st.lastError ? el('div.notice', el('span', '⚠'), el('span', st.lastError)) : null,

      sync.isEnabled() ? el('div.row.wrap', { style: { gap: '10px' } },
        el('button.btn.btn-ghost', { onclick: async () => {
            const r = await sync.pull();
            toast(r === 'in-sync' ? 'Already up to date'
                : r === 'merged' ? 'Merged from the PC'
                : r === 'error' ? 'Sync failed' : 'Synced',
              { sub: sync.status().lastError || '', kind: r === 'error' ? 'bad' : 'ok' });
            ctx.rerender();
          } }, '↻ Sync now')) : null,

      el('p.hint',
        'Open the same address on your phone and unlock with the same passphrase — it will pull your history down. Entries merge rather than overwrite, so a slip logged on either device always survives.')));
  }

  /* ── data ───────────────────────────────────────────── */
  const bytes = new Blob([JSON.stringify(S.S)]).size;
  root.appendChild(section('Your data',
    el('div.kpi',
      kbox(String(S.relapses().length), 'Entries'),
      kbox(String(S.habits({ all: true }).length), 'Habits'),
      kbox(String(S.goals({ all: true }).length), 'Goals'),
      kbox(bytes > 1024 ? (bytes / 1024).toFixed(1) + ' KB' : bytes + ' B', 'Vault size')),

    el('div.row.wrap', { style: { gap: '10px', marginTop: '4px' } },
      el('button.btn.btn-ghost', { onclick: () => exportDialog() }, '↓ Export backup'),
      el('button.btn.btn-ghost', { onclick: () => importDialog(ctx) }, '↑ Import backup'),
      el('button.btn.btn-danger', { onclick: () => wipeDialog(ctx) }, 'Erase everything')),

    el('p.hint',
      'Everything lives in this browser on this device — nothing is sent anywhere. Clearing site data in your browser will delete it, so keep a backup somewhere you trust.')));

  /* ── quotes ─────────────────────────────────────────── */
  const custom = S.setting('customQuotes');
  const favs = S.setting('favoriteQuotes');
  const pool = quotePool(custom);
  root.appendChild(section('Quotes',
    el('div.row-b',
      el('p.hint', { style: { margin: 0 } },
        `${pool.length} lines in rotation · ${plural(favs.length, 'favourite')} · one is picked per day.`),
      el('button.btn.btn-ghost.btn-sm', { onclick: () => addQuoteDialog(ctx) }, '+ Add your own')),

    custom.length ? el('div.dlist', { style: { marginTop: '4px' } }, custom.map(q =>
      el('div.drow',
        el('div.drow-main', el('div.drow-t', `“${q.text}”`), el('div.drow-s', '— ' + q.by)),
        el('button.icon-btn', { title: 'Remove', onclick: () => { S.removeCustomQuote(q.id); ctx.rerender(); } }, '✕')))) : null,

    favs.length ? el('div', { style: { marginTop: '14px' } },
      el('div.card-t', { style: { marginBottom: '8px' } }, 'Favourites'),
      el('div.dlist', favs.map(id => {
        const q = pool.find(x => x.id === id);
        if (!q) return null;
        return el('div.drow',
          el('div.drow-main', el('div.drow-t', `“${q.text}”`), el('div.drow-s', '— ' + q.by)),
          el('button.btn.btn-ghost.btn-sm', { onclick: () => { S.setSetting('pinnedQuote', id); toast('Pinned to the dashboard'); } }, 'Pin'),
          el('button.icon-btn', { onclick: () => { S.toggleFavorite(id); ctx.rerender(); } }, '✕'));
      }).filter(Boolean))) : null,

    S.setting('pinnedQuote') ? el('button.btn.btn-ghost.btn-sm', { style: { marginTop: '12px' },
      onclick: () => { S.setSetting('pinnedQuote', null); toast('Back to the daily rotation'); ctx.rerender(); } }, 'Unpin daily quote') : null));

  /* ── about ──────────────────────────────────────────── */
  root.appendChild(section('About the permanent record',
    el('p.hint', { style: { fontSize: '13px', lineHeight: 1.7 } },
      'Anchor will not let you delete a relapse. You can amend any detail — the habit it belongs to, the date, the time, the notes — and each amendment is timestamped and kept alongside the entry. This is deliberate. A tracker you can quietly tidy up is a tracker that lies to you on the days it matters most.'),
    el('p.hint', { style: { fontSize: '13px', lineHeight: 1.7 } },
      'The one escape hatch is “Erase everything” above, which wipes the whole vault at once. That is a decision, not an edit.'),
    el('div.row.wrap', { style: { gap: '10px', marginTop: '6px' } },
      el('button.btn.btn-ghost.btn-sm', { onclick: () => toggleShortcuts() }, 'Keyboard shortcuts'),
      el('button.btn.btn-ghost.btn-sm', { onclick: () => ctx.replayTour() }, 'Show the tips again'))));
}

/* ── helpers ────────────────────────────────────────────── */

function section(title, ...content) {
  return el('div.card', { style: { marginBottom: '18px' } },
    el('div.card-t', { style: { marginBottom: '16px' } }, title),
    el('div', { style: { display: 'grid', gap: '16px' } }, content.filter(Boolean)));
}
const kbox = (v, l) => el('div.kbox', el('b', v), el('span', l));

/* ── passphrase ─────────────────────────────────────────── */
function passphraseDialog(ctx, changing) {
  let current = '', next = '', confirm = '', hint = '';
  const meter = el('div.strength', el('span'));
  const err = el('p.lock-err');

  const npass = el('input.inp', { type: 'password', placeholder: 'New passphrase', autocomplete: 'new-password' });
  npass.oninput = () => {
    next = npass.value;
    meter.firstChild.style.width = Math.round(strength(next) * 100) + '%';
  };
  const cpass = el('input.inp', { type: 'password', placeholder: 'Repeat it', autocomplete: 'new-password' });
  cpass.oninput = () => (confirm = cpass.value);
  const cur = el('input.inp', { type: 'password', placeholder: 'Current passphrase', autocomplete: 'current-password' });
  cur.oninput = () => (current = cur.value);
  const hintIn = el('input.inp', { placeholder: 'Optional reminder shown on the lock screen', value: vault.getHint() });
  hintIn.oninput = () => (hint = hintIn.value);
  hint = vault.getHint();

  modal({
    title: changing ? 'Change passphrase' : 'Set a passphrase',
    sub: 'Everything in the vault gets re-encrypted with the new key.',
    body: el('div.form',
      changing ? field('Current', cur) : null,
      field('New passphrase', npass), meter,
      field('Confirm', cpass),
      field('Hint', hintIn, 'Visible to anyone who opens the lock screen — keep it oblique.'),
      el('div.notice', el('span', '⚠'), el('span',
        'There is no recovery. If you forget this, the data is gone — that is what makes it private. Export a backup first if you are unsure.')),
      err),
    footer: [
      { label: 'Cancel', onClick: c => c() },
      { label: changing ? 'Re-encrypt' : 'Enable encryption', cls: 'btn-primary', onClick: async c => {
          err.textContent = '';
          if (next.length < 6) { err.textContent = 'Use at least 6 characters — longer is better than clever.'; return; }
          if (next !== confirm) { err.textContent = 'The two passphrases do not match.'; return; }
          if (changing && !(await vault.unlock(current))) { err.textContent = 'Current passphrase is not right.'; return; }
          await vault.protect(next, S.S, hint);
          c();
          confetti({ count: 60, spread: .7 });
          toast('Vault encrypted', { sub: 'Safe to put on the internet now.', kind: 'ok', ms: 5000 });
          ctx.rerender(); ctx.resetIdle();
        } },
    ],
  });
}

function removeProtection(ctx) {
  let pass = '';
  const err = el('p.lock-err');
  const i = el('input.inp', { type: 'password', placeholder: 'Confirm with your passphrase' });
  i.oninput = () => (pass = i.value);
  modal({
    title: 'Remove protection?',
    sub: 'Your data will be written back as plain text in this browser.',
    body: el('div.form',
      el('div.notice', el('span', '⚠'), el('span',
        'Only do this if this device is yours alone and the app is not hosted anywhere.')),
      field('Passphrase', i), err),
    footer: [
      { label: 'Keep it encrypted', onClick: c => c() },
      { label: 'Remove protection', cls: 'btn-danger', onClick: async c => {
          if (!(await vault.unlock(pass))) { err.textContent = 'Not right.'; return; }
          await vault.unprotect(S.S);
          c(); toast('Protection removed', { kind: 'warn' }); ctx.rerender();
        } },
    ],
  });
}

/* ── export / import ────────────────────────────────────── */
function exportDialog() {
  let pass = '', usePass = true;
  const passIn = el('input.inp', { type: 'password', placeholder: 'Passphrase for the file' });
  passIn.oninput = () => (pass = passIn.value);
  const passWrap = el('div', field('File passphrase', passIn,
    'Anyone with the file and this passphrase can read it. Anyone without it cannot.'));

  modal({
    title: 'Export a backup',
    sub: 'A single JSON file containing every habit, entry and goal.',
    body: el('div.form',
      switchRow('Encrypt the file', true, v => { usePass = v; passWrap.style.display = v ? '' : 'none'; }),
      passWrap,
      el('div.notice.info', el('span', 'ℹ'), el('span',
        'This is also how you move your history onto another device — export here, import there.'))),
    footer: [
      { label: 'Cancel', onClick: c => c() },
      { label: 'Download', cls: 'btn-primary', onClick: async c => {
          if (usePass && pass.length < 4) { toast('Give the file a passphrase', { kind: 'warn' }); return; }
          const blob = await vault.exportBlob(S.S, usePass ? pass : null);
          const url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: 'application/json' }));
          const a = el('a', { href: url, download: `anchor-backup-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          c(); toast('Backup downloaded', { kind: 'ok' });
        } },
    ],
  });
}

function importDialog(ctx) {
  let file = null, pass = '', mode = 'merge';
  const err = el('p.lock-err');
  const input = el('input.inp', { type: 'file', accept: '.json,application/json' });
  input.onchange = () => (file = input.files[0]);
  const passIn = el('input.inp', { type: 'password', placeholder: 'Only if the file is encrypted' });
  passIn.oninput = () => (pass = passIn.value);

  modal({
    title: 'Import a backup',
    sub: 'Merging keeps everything you already have.',
    body: el('div.form',
      field('Backup file', input),
      field('File passphrase', passIn),
      field('How to apply it', segmented(
        [{ value: 'merge', label: 'Merge' }, { value: 'replace', label: 'Replace everything' }],
        'merge', v => (mode = v)),
        'Merge adds anything missing and never removes an entry. Replace overwrites this device entirely.'),
      err),
    footer: [
      { label: 'Cancel', onClick: c => c() },
      { label: 'Import', cls: 'btn-primary', onClick: async c => {
          err.textContent = '';
          if (!file) { err.textContent = 'Choose a file first.'; return; }
          try {
            const text = await file.text();
            const data = await vault.importBlob(JSON.parse(text), pass);
            if (mode === 'replace') {
              S.hydrate(data);
            } else {
              S.commit(s => {
                const hIds = new Set(s.habits.map(h => h.id));
                for (const h of data.habits || []) if (!hIds.has(h.id)) s.habits.push(h);
                const rIds = new Set(s.relapses.map(r => r.id));
                let added = 0;
                for (const r of data.relapses || []) if (!rIds.has(r.id)) { s.relapses.push(r); added++; }
                const gIds = new Set(s.goals.map(g => g.id));
                for (const g of data.goals || []) if (!gIds.has(g.id)) s.goals.push(g);
                s._added = added;
              });
            }
            await S.flush();
            c();
            toast('Backup imported', { sub: `${S.relapses().length} entries now on this device.`, kind: 'ok' });
            ctx.rerender();
          } catch (e) { err.textContent = e.message; }
        } },
    ],
  });
}

function wipeDialog(ctx) {
  let typed = '';
  const err = el('p.lock-err');
  const i = el('input.inp', { placeholder: 'Type ERASE to confirm' });
  i.oninput = () => (typed = i.value);
  modal({
    title: 'Erase everything?',
    sub: 'Every habit, every entry, every goal, and your passphrase.',
    body: el('div.form',
      el('div.notice', el('span', '⚠'), el('span',
        'This is the only way to remove a logged relapse, and it removes all of them at once. It cannot be undone. Export a backup first if there is any doubt.')),
      field('Confirm', i), err),
    footer: [
      { label: 'Keep my data', onClick: c => c() },
      { label: 'Erase everything', cls: 'btn-danger', onClick: c => {
          if (typed.trim().toUpperCase() !== 'ERASE') { err.textContent = 'Type ERASE exactly.'; return; }
          S.wipe(); c(); location.reload();
        } },
    ],
  });
}

function addQuoteDialog(ctx) {
  let text = '', by = 'You';
  const t = el('textarea.inp', { placeholder: 'Something that actually lands for you.' });
  t.oninput = () => (text = t.value);
  const b = el('input.inp', { value: 'You' });
  b.oninput = () => (by = b.value);
  modal({
    title: 'Add a quote',
    sub: 'It joins the daily rotation.',
    body: el('div.form', field('Quote', t), field('Attributed to', b)),
    footer: [
      { label: 'Cancel', onClick: c => c() },
      { label: 'Add', cls: 'btn-primary', onClick: c => {
          if (!text.trim()) return;
          S.addCustomQuote(text.trim(), by.trim() || 'You');
          c(); toast('Added to the rotation', { kind: 'ok' }); ctx.rerender();
        } },
    ],
  });
}
