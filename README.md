# Bridge — AWS project discovery and dream team builder

Bridge loads a student profile, open projects, and potential teammates from DynamoDB through FastAPI. The UI shows one project recommendation at a time. Choose a project to see four potential collaborators, keep any combination, and press **Space** (or **Refresh**) to replace only the others. The refresh fills the viewport with fire emojis when motion is enabled. Keep four people to complete a draft team.

The existing `frontend/matching/rank.js` supplies scores, explanations, and project ordering. It is byte-for-byte identical to the matcher on `maanav` at `962abb43320e480d80dd7b66c0cf0e8f98f57e27`. Its scoring algorithm has not changed; it never queries AWS. Each prospective teammate's percentage applies the same project-fit score to that student's profile, rather than estimating interpersonal compatibility or P(like).

## Run on your Mac

From the repo root, in the terminal that has your temporary AWS credentials exported:

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

If you do not have a virtual environment yet, run `python3 -m venv .venv` first.

Open **http://127.0.0.1:8000/?student=1**. The ID chooses an existing `Students` record (for example, Maya). The first visit opens the original three-step intro survey, which saves profile edits to `Students` before rebuilding the ranked deck. Overview, Give back, My connections, Saved projects, Leaderboard, and My profile remain available. Use Uvicorn rather than `python -m http.server`; the latter cannot provide the API. Port already in use? Change `--port 8000` to `--port 8001` and open that port instead.

The server defaults to `us-east-2`; set `AWS_DEFAULT_REGION` if your tables live elsewhere. AWS keys stay in the backend terminal environment, never in JavaScript or Git. Refresh expired student-account credentials in the same terminal, then restart Uvicorn.

## Existing DynamoDB setup

No new tables or indexes are required. All four existing tables use `pk` (String), without a sort key:

| Table | Existing record key / use |
| --- | --- |
| `Students` | `student#1`, etc. Your current updated student JSON includes `languages`, `interests`, `learn`, `experience`, `hours_per_week`, `major`, and `year`. |
| `Projects` | `project#1`, etc. Contains the project schema in `AGENTS.md`. |
| `Matches` | Immutable `deck#UUID#project#ID` and `event#UUID` snapshots. |
| `Swipes` | Actual `event#UUID` like/pass actions. |

The runtime IAM identity needs:

- `Students`: `GetItem`, **`Scan`**, **`UpdateItem`** (the latter two are newly used).
- `Projects`: `Scan`, **`GetItem`**.
- `Matches`: `GetItem`, `PutItem`.
- `Swipes`: `GetItem`, `PutItem`, **`Scan`**.

The transaction is authorized through the two tables' `PutItem` permissions. If a request fails, the backend logs the AWS error code and the UI retains the action for retry.

## What persists

1. Loading a deck saves each project's match snapshot, including `student_id`, `project_id`, `action=deck_built`, `score`, `created_at`, and `deck_id`. It does not invent swipe events.
2. Like/pass writes one `Swipes` row and one `Matches` snapshot atomically. The card advances only after backend confirmation. Retrying an uncertain write reuses its event UUID, including after a page reload.
3. Passes restore from AWS and leave future decks. Likes appear in My workspace; they are interest, not confirmed membership. Because likes are not joins, they can reappear in a newly built deck.
4. Click **Save team draft to AWS** to update the selected student's `dream_team_draft` field. This saves the project, current four candidate slots, kept IDs, round, seen IDs, and timestamp without replacing the student's other profile fields. One active draft is stored per student.
5. Until saved, team changes are local browser drafts, marked as unsaved. Reload restores an unsaved browser draft first, otherwise the AWS draft. Switching projects asks before discarding unsaved team changes.

Four candidate collaborators are a brainstorming shortlist separate from the project's actual open spots. Keeping the fourth teammate automatically opens a review-and-introduction screen. Clicking **Send connection requests** first saves the team, then atomically adds requests to the sender’s outbox and each selected member’s Bridge inbox. Recipients can accept or decline in My connections. Saving a draft alone does not send invitations, reserve spots, or confirm membership. No email or external message is sent. The active student is excluded from recommendations, as are records missing the updated ranking fields. If fewer than four eligible peers exist, only those records appear. No synthetic profiles are inserted. Community leaderboard rows also come from `Students`, not invented sample rankings.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/students/{id}` | Student profile and saved team draft. |
| `GET /api/students` | Other-student recommendation fields; omits emails and private drafts. |
| `GET /api/projects` | Open projects. |
| `GET /api/students/{id}/history` | Latest like/pass per project. |
| `POST /api/decks` | Save ranked match snapshots. |
| `POST /api/swipes` | Save atomic match/swipe pair. |
| `PUT /api/students/{id}/team` | Save the active team draft. |
| `PUT /api/students/{id}` | Save the original survey preferences and mark onboarding complete. |
| `POST /api/students/{id}/connection-requests` | Save outgoing requests and the selected teammates’ inbox records atomically. |
| `PUT /api/students/{id}/connection-requests/{request_id}` | Accept or decline an incoming request. |
| `POST /api/students/{id}/help-offers` | Record an offer of help without awarding credit. |
| `POST /api/students/{id}/help-offers/{project_id}/demo-confirm` | Simulate a receiving teammate confirming completed help; labeled as demo activity. |
| `POST /api/students/{id}/endorsements` | Add a labeled demo peer endorsement. |
| `GET /api/community` | Public leaderboard counts and demo-contribution counts. |

This remains a local hackathon demo without authentication. Student IDs select records; they do not authorize access. Run on loopback. Scores are calculated client-side and checked against stored deck snapshots, not independently attested by a server ranker. Paginated scans suit the small hackathon dataset; larger deployments should use keyed queries/indexes. Draft saves use last-write-wins if the same student opens multiple browser tabs.

## Validation

```bash
npm test
python -m pip install -r requirements-dev.txt
python -m unittest discover -s backend/tests -v
python -m unittest backend.test_main -v
```

Node tests cover the existing matcher and offline model, four-slot selection, preservation of kept people, visiting the full candidate pool, API-backed UI flow, retrying failed swipes, loading saved drafts, keyboard behavior, and read failures. Python tests use Moto's mocked AWS for reads, immutable decks, atomic match/swipe persistence, duplicate retries, team validation, draft restoration, and static hosting. They do not contact your live AWS account.

The original use cases are restored: Your community tier, Every contribution counts, Your growth, community leaderboard, give-back offers, teammate confirmation simulation, saved projects, peer endorsements, and editable intro survey. Offers and connection requests never earn help credit. Confirmed contributions count once; simulated confirmations are labeled as demo contributions and do not claim verified peer activity.

The Three.js r170 constellation from the dashboard is bundled locally under `frontend/vendor/`, including its MIT license. It renders a pointer-responsive torus knot, orbital rings, and connected nodes; a CSS constellation remains if WebGL is unavailable. There is no Pause motion button. Device reduced-motion preferences disable decorative motion and emoji overlays. Project videos open through HTTPS links when present; this UI has no paid APIs or additional frontend dependencies.

The revision merges the latest `aryahi` database fixes, including Decimal serialization and survey writes, and retains its backend regression tests. Runtime tests use mocked AWS; live-account permissions/credentials and browser/WebGL rendering still need local verification.
