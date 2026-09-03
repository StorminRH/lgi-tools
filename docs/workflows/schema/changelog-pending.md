# Pending changelog fragments (retired)

Do not write fragments under `content/changelog/pending/`.

Ordinary work and lifecycle work both land on `development`, then promote
to `staging` with as-builts. The public changelog is written at release
from those as-builts. See `docs/workflows/schema/changelog-entry.md` and
`docs/workflows/schema/session-as-built.md`.

Leave `README.md` there so older loaders keep skipping the directory.
Leftover fragment files may remain until a release changelog absorbs
their bullets. Do not add new ones.
