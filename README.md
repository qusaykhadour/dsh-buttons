# dsh-buttons

**Extra buttons for the DeepSeek Harness sidebar.** The first one deletes Sessions
for good — one row, or a whole selected group.

> **بالعربي:** بلِجن لـ DeepSeek Harness يضيف زر **حذف المحادثة نهائياً** على صف
> المحادثة، مع تحديد جماعي: تختار كذا محادثة وتنحذف كلها بتأكيد واحد. الواجهة عربية
> أولاً (تتبع لغة الواجهة). الحذف **نهائي — ما في سلة ولا رجعة**.

DSH has no per-Session delete. The ACP agent advertises
`sessionCapabilities: { close, list, resume }` — no `delete` — and the workspace
controller only archives, pins and reorders. The sidebar's Session row menu
therefore offers Rename, Fork, Pin and Archive, and nothing that removes the
stored conversation. Archived Sessions are hidden, never deleted: the log stays in
`~/.dsh/sessions/…` forever.

This plugin adds the missing action as a client plugin — no app patch, no
`app.asar` edit:

| Half | File | What it does |
|---|---|---|
| Host | `index.js` | registers `POST /api/session.delete` on the authenticated Connection |
| Host | `lib/delete-session.js` | removes the Session directory, its projection cache and its registry entry |
| Browser | `lib/client.js` | adds a pick button and two menu entries to the Session row, a counting bar, and the confirmation dialogs |
| Tool | `repair-registry.mjs` | drops registry entries whose Session files are gone |

## Install

Pick one, then **restart DSH** (the profile's plugin graph is composed at host
startup, so a page refresh alone is not enough).

```powershell
# 1. from npm (recommended)
dsh plugin --profile desktop add dsh-buttons

# 2. from a GitHub tarball (no npm account, no git on PATH needed)
dsh plugin --profile desktop add https://github.com/qusaykhadour/dsh-buttons/archive/refs/heads/main.tar.gz

# 3. from a folder you already have
dsh plugin --profile desktop add link:C:\path\to\dsh-buttons
```

Replace `desktop` with your profile name (`web`, `tui`, …). The GUI does the same
thing: **Settings → Plugins → Plugin Manager** accepts the same spec.

## Two ways to delete

**One Session** — the row's "…" menu → **Delete session** → a confirmation
naming it.

**A group** — the checklist button on row hover, or the menu's **Select for bulk
delete**, marks Sessions. A floating bar counts them ("3 sessions selected") and
offers **Delete selected (N)** / **Clear selection**. One confirmation lists the
picked titles and one **Delete permanently (N)** button; the deletions then run
one by one with progress ("Deleted 4 of 9…"), and any failure is listed by title
and reason (running now · locked · files already gone · host unreachable).

While anything is picked, **every** delete entry point acts on the picked set:
the row menu's own delete item becomes **Delete selected (N)** too, so opening a
row menu can never quietly delete one Session out of a group.

Selection is plugin state: the sidebar is untouched, no row is restyled, and
nothing is written to disk until the deletion runs. Archived and grouped rows
carry the same two actions, so a Session can be picked from either filter.

## What is removed

For `sessionId`:

1. `~/.dsh/sessions/<workspace-slug>/<sessionId>/` — the stored log (every slug
   that holds the id, so a Session registered under two workspaces goes entirely);
2. `~/.dsh/storages/session_projcache/sessions/<sessionId>.json` — the title /
   projection cache;
3. the id inside `~/.dsh/storages/workspace.json` — `sessionIds`,
   `pinnedSessionIds`, `archivedSessionIds`, rewritten atomically.

The dialog archives the Session first (through the app's own workspace
controller) so the row leaves the sidebar before its log disappears; a refusal
there is not fatal.

**There is no trash and no undo.** The confirmation dialog says so.

## Safety rules

- the id must match `^[A-Za-z0-9][A-Za-z0-9._-]{6,79}$` — no separators, no
  `..`, so no request can reach outside `sessions/`;
- every path is re-checked to be inside `<dshHome>/sessions` before removal;
- a Session the host currently holds open is refused (`409 session-active`);
- a log file locked by a running app is reported as `409 file-locked` instead of
  being half-deleted;
- deleting the Session you are talking in fails on the same lock — close it
  first.

## Ghost rows, and the repair tool

Archiving is what the running app remembers: it keeps its own registry in memory
and can write a deleted id back into `archivedSessionIds`, which then renders as
an archived row that cannot be opened. To reconcile the file with the disk, run
(with **DSH closed**, so the app cannot overwrite the repair):

```powershell
node repair-registry.mjs            # dry run: shows what would change
node repair-registry.mjs --apply    # backs up workspace.json, then rewrites it
```

## Test

```powershell
npm test
# or run the two suites directly:
node test\delete-session.test.mjs
node test\client-bundle.test.mjs
```

The first suite builds a throwaway DSH home and asserts the three artefacts are
gone, that a neighbouring Session survives, that an unknown id reports
`not-found`, and that traversal-shaped ids are rejected. The second loads the
browser half against a stubbed module loader, React and primitives, then checks
that `apply()` registers all five slot entries with unique ids, that the pick
button, the counting bar and the bulk dialog render the picked state, and that a
row menu follows the picked set.

`node --test test/` also works, except inside the DSH file sandbox: the runner
spawns child processes with piped stdio, which the sandbox refuses. Run the two
files directly there.

## Compatibility

Tested against the DSH **0.2.0-rc.2** desktop runtime (client packages
`0.2.0-rc.2`) on Windows 11 with Node 24.

No `peerDependencies` are declared — the same choice the [`dsh-arabic`](https://www.npmjs.com/package/dsh-arabic)
plugin makes — so the installer never refuses a newer DSH. The trade-off is
honest: DSH is pre-release, and if the sidebar slot names
(`sidebar.workspaces.session.menu.item`, `sidebar.workspaces.session.row.action`,
`shell.overlay`) or the UI primitives change, the buttons may stop rendering
until this plugin is updated. Nothing else in DSH breaks; disable the plugin from
**Settings → Plugins**, or use the app's own recovery entry **"Disable
third-party plugins, back up profile patch, and restart"**.

## Limits

- The sidebar may keep a row until the next page refresh if the workspace
  controller still holds the Session in memory.
- Sessions whose files another process keeps open (a second DSH instance) are
  refused, not forced.

## License

MIT — see [LICENSE](LICENSE).
