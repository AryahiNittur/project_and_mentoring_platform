# Bridge dashboard

Personalized project matching for the HackOHI/O Honda Bridge Builder demo. The browser ranks projects. FastAPI reads and writes DynamoDB.

## Run locally

From the repository root:

```bash
python -m venv .venv
```

Activate it with `.venv\Scripts\activate` on Windows or `source .venv/bin/activate` on macOS and Linux. Then:

```bash
pip install -r requirements.txt
```

Copy `.env.example` to `.env`.

Put AWS credentials in `.env`. The app reads that file from the repository root and uses `AWS_DEFAULT_REGION` (default `us-east-2`).

```bash
python -m uvicorn backend.main:app --reload
```

Open http://127.0.0.1:8000.

The page is served by FastAPI, which also exposes `/api`. `python -m http.server` has no API, so the dashboard stops on “Could not load the dashboard.”

## What is stored

- `GET /api/projects` and `GET /api/students/{id}` load the deck.
- Saving preferences sends `PUT /api/students/{id}`. The Students table is the profile. `"8+"` stays the string `"8+"`.
- Building a deck sends `POST /api/decks`. A like or pass then sends `POST /api/swipes` for that same deck and score.
- Passed projects, join requests, and help offers for this browser also stay in `localStorage` under `bridge-aws-student-1`.

## Checks

```bash
npm test
python -m unittest backend.test_main
```

`npm test` covers the weighted ranker. `backend.test_main` covers the API against a local stand-in for DynamoDB, including the deck-then-swipe order.

## Layout

Styling is in `frontend/styles.css`. Page behavior is in `frontend/app.js`. Ranking is in `frontend/matching/rank.js`. The API is `backend/main.py`.
