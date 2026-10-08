# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## 0.1.0 — first release

- **Delete one Session** from the Session row's "…" menu, with a confirmation
  naming it.
- **Delete a picked group**: a pick button on the row (and the same action in the
  menu) marks Sessions, a floating bar counts them, and one confirmation deletes
  the whole set with progress and a per-title failure list.
- While anything is picked, **every** delete entry point acts on the picked set.
- Host route `POST /api/session.delete` removes the stored Session directory, its
  projection cache and its workspace registration, refuses live Sessions and
  traversal-shaped ids, and reports locked logs instead of half-deleting.
- `repair-registry.mjs` drops registry entries whose Session files are gone
  (ghost rows left behind by archiving before deletion).
- Arabic and English copy, following the interface language.
