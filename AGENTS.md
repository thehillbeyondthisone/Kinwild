# Repo map — two separate projects

- **This repo** (`creaturecreator`, root): **Creature Creator**, dev server on **:5173**.
- **`small-world-integration/`**: **Kinwild**, a nested git repo (its own `.git`, branch `codex/integration-foundation`), dev server on **:2001**. Default focus of current work unless told otherwise. See `small-world-integration/HANDOFF.md` and `small-world-integration/AUDIT-2026-07-29.md` before touching it; its house rules and test gate (`npm run check` + `node tests/determinism-seed.test.mjs`) apply there, not here.

`quickstart.bat` starts Kinwild only by default; `quickstart.bat creature` / `all` opts into Creature Creator.

When the user doesn't name a project, check the conversation context; if still ambiguous, ask rather than guessing.
