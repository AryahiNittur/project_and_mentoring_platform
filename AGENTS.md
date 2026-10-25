# Bridge — HackOHI/O 2026 Honda Bridge Builder

Rung 4 of the ladder: students join a 4–6 week project with a company mentor. The demo is a swipe deck. Students fill out a survey, projects are the cards, and the deck is ordered by how likely that student is to choose the project and stay on it.

Sample data is fine. One complete flow beats extra features. The live deck uses the weighted score below. Swipes are stored so the same features can later become a measured probability.

Existing UI prototype: `frontend/index.html`. `score()` and `feed()` (around lines 918–936) are the integration point. Replace that scoring body once survey state has the fields below. Styling and app logic live in that file. Demo state is `localStorage` key `bridge-v1`.

## Roles

- **Aryahi — data.** DynamoDB tables for projects, profiles, matches, and confirmed contributions. Also store swipes: `student_id`, `project_id`, `action` (`like` or `pass`), `score`, `created_at`. The ranker does not talk to the database. Persist a match when a deck is built and when someone swipes.
- **Junna — mock data.** Generate students and projects that share the schema and vocabulary below. About 15 students and 8 projects, with a spread: one near-perfect pair, one high-interest low-skill pair, one high-skill wrong-interest pair, experience 1–5, and hours of 2, 4, 6, and 8. Emails are Gmail addresses.
- **Anirudh — swipe UI.** Cards, swipe gestures, and project videos. Render `rankProjects` order. Show the score and the one-line reason on the card. Write one swipe row on every like or pass.
- **Maanav — matching.** Own `scoreProject` and `rankProjects`. Unit-test with one student and eight projects and assert the expected order. That test stands alone if the swiper is unfinished.

## Survey and project schema

Student fields: `name`, `email` (Gmail), `languages`, `interests`, `learn`, `year`, `major`, `experience` (1–5), `hours_per_week` (2, 4, 6, or 8+).

Project fields: `id`, `title`, `org`, `description`, `languages`, `interests`, `learn_outcomes`, `target_experience` (1–5), `hours_per_week`, `weeks` (4–6), `spots`, `majors` (optional), `mentor`, video if the card has one.

Experience scale, same meaning in every mock record: 1 coursework only, 2 class projects, 3 personal projects or hackathons, 4 internship or research, 5 shipped something or led a team.

Name, email, and year stay on the profile. Year is for the card and for mixing a team. Experience is what the score uses.

Shared tags. Overlap is case-insensitive string equality after trim.

- Languages: Python, JavaScript, Java, C++, SQL, HTML/CSS, Swift, R
- Interests: Machine Learning, AI, Cybersecurity, Web, Mobile, Data, Robotics, Sustainability, Design, Healthcare, Education

`learn` and `learn_outcomes` use the interest list.

## Matching algorithm

Each feature is 0–1. Coverage is the fraction of the project’s tags the student has, not how broad the student is.

| Feature | How | Weight |
|---|---|---|
| Interests | coverage(student.interests, project.interests) | 0.30 |
| Learn | coverage(student.learn, project.learn_outcomes) | 0.20 |
| Languages | coverage(student.languages, project.languages) | 0.20 |
| Experience | `1 - abs(student - target) / 4`, floored at 0 | 0.18 |
| Time | `min(1, student_hours / project_hours)` | 0.12 |

`match = round(100 * sum of weight * feature)`. If `project.majors` is non-empty and includes `student.major`, add 5, then cap at 100. An open project (no majors listed) gets no major bonus.

Empty `languages` and empty `interests` score 0 with reason “Add languages and interests to rank projects.”

Drop a project only when the student already passed it, already joined it, or `spots` is 0. Sort by score descending, then spots left, then project id.

Attach one reason from the strongest hits, for example: “78% — Machine Learning lines up, you have Python, and your experience is close to this team.”

```javascript
const WEIGHTS = { interest: 0.3, learn: 0.2, skill: 0.2, experience: 0.18, time: 0.12 };
const norm = (s) => String(s).trim().toLowerCase();

function coverage(studentTags, projectTags) {
  if (!projectTags?.length) return 0;
  const have = new Set((studentTags || []).map(norm));
  return projectTags.filter((t) => have.has(norm(t))).length / projectTags.length;
}

function experienceFit(studentExp, target) {
  return Math.max(0, 1 - Math.abs(studentExp - target) / 4);
}

function scoreProject(student, project) {
  if (!student.languages?.length && !student.interests?.length) return 0;
  const match = Math.round(
    100 *
      (WEIGHTS.interest * coverage(student.interests, project.interests) +
        WEIGHTS.learn * coverage(student.learn, project.learn_outcomes) +
        WEIGHTS.skill * coverage(student.languages, project.languages) +
        WEIGHTS.experience * experienceFit(student.experience, project.target_experience) +
        WEIGHTS.time * Math.min(1, student.hours_per_week / project.hours_per_week))
  );
  const majorBonus = project.majors?.length && project.majors.includes(student.major) ? 5 : 0;
  return Math.min(100, match + majorBonus);
}

function rankProjects(student, projects, passedIds = [], joinedIds = []) {
  return projects
    .filter((p) => p.spots > 0 && !passedIds.includes(p.id) && !joinedIds.includes(p.id))
    .map((p) => ({ project: p, score: scoreProject(student, p) }))
    .sort((a, b) => b.score - a.score || b.project.spots - a.project.spots || a.project.id - b.project.id);
}
```

After swipes exist, the same five features are inputs to a logistic regression whose output is P(like). Fit it offline on mock students. Label a like when interest coverage is at least 0.5 and time fit is at least 0.5. Keep the weighted score on the live deck.
