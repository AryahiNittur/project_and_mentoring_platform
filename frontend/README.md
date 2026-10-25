# Bridge frontend

Use the FastAPI server from the repository root. See [the root README](../README.md) for AWS table permissions, setup, and persistence details.

```bash
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/?student=1. Do not open `index.html` directly or use a static-only server: the app needs `/api/*` endpoints.

- `app.js`: AWS API loading, one-project deck, team rendering, keyboard/mouse/touch actions, and persistence.
- `team.js`: pure four-slot refresh selection; no network or storage calls.
- `matching/rank.js`: the team's existing weighted ranker, unchanged.
- `styles.css`: responsive navy/violet/lime layout, kept-card states, fire overlays, and reduced-motion handling.

Keep the script order in `index.html`: ranker, selection helper, then app. `matching/demoDeck.js` is retained for old fixtures/debugging but is not loaded in the AWS app.
