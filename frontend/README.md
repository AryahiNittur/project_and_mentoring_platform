# Bridge dashboard

An interactive prototype for personalized student project matching and peer mentorship.

## Run locally

Extract this ZIP and open index.html in your browser. No installation or API keys are needed.

Alternatively, from this folder run:

    python3 -m http.server 8000

Then open http://localhost:8000.

## Included features

- Three-step onboarding for goals, skills, interests, and availability
- Personalized project feed with swipe gestures and buttons
- Join requests and help offers
- Simulated teammate confirmation of completed help
- Help-based tiers and leaderboard
- Peer-written endorsements through a demo peer view

## Implementation

The delivered dashboard uses vanilla HTML, CSS, and JavaScript in index.html. It does not use React or a Python backend. Styling and application logic are embedded in the same file for easy editing.

Data persists in browser localStorage under bridge-v1. Sample profiles, contributions, and projects are fictional demo content. Peer confirmation is simulated; there is no authentication or cross-user verification. AWS, FastAPI, SQLite, and DynamoDB are not connected. The matching score is a deterministic heuristic, not a probability or an AI model.

Google Fonts are optional and require internet; system fallback fonts work offline.

To restart onboarding and reset demo changes, clear this site's browser storage (the bridge-v1 localStorage key).
