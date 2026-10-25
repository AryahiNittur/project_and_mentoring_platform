const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    WEIGHTS,
    FEATURE_KEYS,
    LANGUAGES,
    INTERESTS,
    EMPTY_REASON,
    coverage,
    experienceFit,
    parseHours,
    timeFit,
    features,
    featureVector,
    scoreProject,
    reasonFor,
    rankProjects,
    profileFromState,
    deckFromState,
    applyStoredProfile,
} = require("./rank");
const { student, students, projects } = require("./fixtures");
const demo = require("./demoDeck");

function specScore(person, project) {
    if (!person.languages?.length && !person.interests?.length) return 0;
    const match = Math.round(
        100 *
            (WEIGHTS.interest * coverage(person.interests, project.interests) +
                WEIGHTS.learn * coverage(person.learn, project.learn_outcomes) +
                WEIGHTS.skill * coverage(person.languages, project.languages) +
                WEIGHTS.experience * experienceFit(person.experience, project.target_experience) +
                WEIGHTS.time * Math.min(1, parseHours(person.hours_per_week) / parseHours(project.hours_per_week)))
    );
    const bonus = project.majors?.length && project.majors.includes(person.major) ? 5 : 0;
    return Math.min(100, match + bonus);
}

test("weights sum to 1 and use the five named features", () => {
    const sum = FEATURE_KEYS.reduce((total, key) => total + WEIGHTS[key], 0);
    assert.ok(Math.abs(sum - 1) < 1e-12);
    assert.deepEqual(FEATURE_KEYS, ["interest", "learn", "skill", "experience", "time"]);
    assert.equal(LANGUAGES.length, 8);
    assert.equal(INTERESTS.length, 11);
});

test("coverage is the fraction of the project's tags, not the student's", () => {
    assert.equal(coverage(["Python", "Java", "SQL", "R"], ["Python"]), 1);
    assert.equal(coverage(["Python"], ["Python", "SQL"]), 0.5);
    assert.equal(coverage(["Python"], []), 0);
    assert.equal(coverage(["Python"], undefined), 0);
    assert.equal(coverage(undefined, ["Python"]), 0);
    assert.equal(coverage([" python "], ["Python"]), 1);
    assert.equal(coverage(["PYTHON"], ["python"]), 1);
});

test("experience fit floors at 0 and is 1 on an exact match", () => {
    assert.equal(experienceFit(4, 4), 1);
    assert.equal(experienceFit(4, 5), 0.75);
    assert.equal(experienceFit(1, 5), 0);
    assert.equal(experienceFit(5, 1), 0);
    assert.equal(experienceFit("4", 4), 1);
    assert.equal(experienceFit(undefined, 3), 0);
    assert.equal(experienceFit(3, undefined), 0);
});

test("time fit caps at 1 and reads 8+ as 8 hours", () => {
    assert.equal(timeFit(6, 6), 1);
    assert.equal(timeFit(6, 4), 1);
    assert.equal(timeFit(6, 8), 0.75);
    assert.equal(timeFit("8+", 8), 1);
    assert.equal(timeFit("8 +", 6), 1);
    assert.equal(timeFit(8, "8+"), 1);
    assert.equal(parseHours("8+"), 8);
    assert.equal(timeFit(0, 4), 0);
    assert.equal(timeFit(4, 0), 0);
    assert.equal(timeFit("soon", 4), 0);
});

test("one student and eight projects rank in the expected order", () => {
    assert.equal(students.length, 15);
    assert.equal(projects.length, 8);
    for (const person of students) assert.match(person.email, /@gmail\.com$/);
    assert.deepEqual(
        [...new Set(students.map((person) => person.experience))].sort(),
        [1, 2, 3, 4, 5]
    );
    assert.deepEqual([...new Set(students.map((person) => parseHours(person.hours_per_week)))].sort(), [2, 4, 6, 8]);

    const original = projects.map((project) => project.id);
    const ranked = rankProjects(student, projects);
    assert.deepEqual(projects.map((project) => project.id), original);
    assert.deepEqual(
        ranked.map((row) => row.project.id),
        [1, 2, 8, 3, 4, 5, 6]
    );
    assert.deepEqual(
        ranked.map((row) => row.score),
        [100, 80, 67, 55, 49, 37, 14]
    );
    assert.ok(ranked.every((row) => row.project.spots > 0));
    assert.ok(ranked.every((row) => row.reason === reasonFor(student, row.project)));
    assert.equal(ranked.find((row) => row.project.id === 7), undefined);

    for (const project of projects) {
        assert.equal(scoreProject(student, project), specScore(student, project));
    }
});

test("the three spread pairs behave as labeled", () => {
    const maya = students[0];
    const jonah = students[1];
    const notes = projects[0];
    const bedside = projects[1];
    const robot = projects[2];

    assert.equal(features(maya, notes).interest, 1);
    assert.equal(features(maya, notes).skill, 1);
    assert.equal(features(maya, notes).time, 1);
    assert.equal(scoreProject(maya, notes), 100);

    assert.equal(features(jonah, bedside).interest, 1);
    assert.equal(features(jonah, bedside).skill, 0);
    assert.ok(scoreProject(jonah, bedside) > scoreProject(jonah, robot));

    assert.equal(features(maya, robot).interest, 0);
    assert.equal(features(maya, robot).skill, 1);
    assert.equal(scoreProject(maya, robot), 55);
    assert.ok(scoreProject(maya, notes) > scoreProject(maya, robot));
});

test("passed, joined, and full projects leave the deck", () => {
    const open = rankProjects(student, projects, [2], [8]);
    assert.deepEqual(
        open.map((row) => row.project.id),
        [1, 3, 4, 5, 6]
    );
    const stringIds = rankProjects(student, projects, ["2"], ["8"]);
    assert.deepEqual(
        stringIds.map((row) => row.project.id),
        [1, 3, 4, 5, 6]
    );
    assert.equal(rankProjects(student, projects).length, 7);
});

test("ties break by spots left, then project id", () => {
    const base = projects[5];
    const tied = [
        { ...base, id: 30, spots: 5 },
        { ...base, id: 2, spots: 5 },
        { ...base, id: 10, spots: 1 },
    ];
    assert.deepEqual(
        rankProjects(student, tied).map((row) => row.project.id),
        [2, 30, 10]
    );
    const named = [
        { ...base, id: "b", spots: 1 },
        { ...base, id: "a", spots: 1 },
    ];
    assert.deepEqual(
        rankProjects(student, named).map((row) => row.project.id),
        ["a", "b"]
    );
    const numeric = [
        { ...base, id: 10, spots: 1 },
        { ...base, id: 2, spots: 1 },
    ];
    assert.deepEqual(
        rankProjects(student, numeric).map((row) => row.project.id),
        [2, 10]
    );
});

test("missing spots, null inputs, and an empty profile", () => {
    const hidden = { ...projects[0], id: 9, spots: undefined };
    assert.equal(rankProjects(student, [hidden]).length, 0);
    assert.equal(rankProjects(student, null).length, 0);
    assert.equal(scoreProject(null, projects[0]), 0);
    assert.equal(reasonFor(null, projects[0]), EMPTY_REASON);

    const blank = { ...student, languages: [], interests: [] };
    assert.equal(scoreProject(blank, projects[0]), 0);
    assert.equal(reasonFor(blank, projects[0]), EMPTY_REASON);
    const ranked = rankProjects(blank, projects);
    assert.equal(ranked[0].score, 0);
    assert.equal(ranked[0].reason, EMPTY_REASON);
    assert.deepEqual(
        ranked.map((row) => row.project.id),
        [5, 4, 3, 2, 1, 8, 6]
    );
});

test("only one of languages or interests is enough to score", () => {
    const languagesOnly = { ...student, interests: [] };
    const interestsOnly = { ...student, languages: [] };
    assert.ok(scoreProject(languagesOnly, projects[0]) > 0);
    assert.ok(scoreProject(interestsOnly, projects[0]) > 0);
    assert.equal(coverage(languagesOnly.languages, projects[0].languages), 1);
});

test("major bonus is 5, case-sensitive, and capped at 100", () => {
    const perfect = {
        ...student,
        hours_per_week: 6,
    };
    const project = {
        ...projects[0],
        hours_per_week: 8,
        majors: ["Computer Science"],
    };
    assert.equal(scoreProject(perfect, { ...project, majors: [] }), 97);
    assert.equal(scoreProject(perfect, { ...project, majors: undefined }), 97);
    assert.equal(scoreProject(perfect, project), 100);
    assert.equal(scoreProject({ ...perfect, major: "computer science" }, project), 97);
    assert.equal(scoreProject({ ...perfect, major: "Design" }, projects[7]), 62);
    assert.equal(scoreProject({ ...perfect, major: "Biology" }, projects[7]), 67);
    assert.equal(scoreProject(perfect, projects[7]), 67);
});

test("reasons cite the strongest hits and the empty-profile sentence", () => {
    assert.equal(
        reasonFor(student, projects[0]),
        "100% — Machine Learning and Healthcare line up, you have Python and SQL, and you want to learn Machine Learning and Data."
    );
    assert.equal(
        reasonFor(student, projects[2]),
        "55% — you have Python and SQL, your experience matches this team, and you can give the hours this project needs."
    );
    assert.equal(
        reasonFor(student, projects[3]),
        "49% — your experience is close to this team, Machine Learning lines up, and you want to learn Data."
    );
    assert.equal(reasonFor(student, projects[5]), "14% — you can cover part of the weekly hours.");

    const quiet = {
        ...student,
        languages: ["Java"],
        interests: ["Design"],
        learn: [],
        experience: 1,
        hours_per_week: 0,
    };
    const far = {
        id: 11,
        languages: ["Python"],
        interests: ["Robotics"],
        learn_outcomes: ["Healthcare"],
        target_experience: 5,
        hours_per_week: 8,
        spots: 1,
        majors: [],
    };
    assert.equal(scoreProject(quiet, far), 0);
    assert.equal(reasonFor(quiet, far), "0% — interests, languages, and hours do not line up with this project yet.");
    assert.match(reasonFor({ ...student, languages: [" python "] }, { ...projects[5], languages: ["Python"], interests: ["Healthcare"], learn_outcomes: [], target_experience: 1, hours_per_week: 8, majors: [] }), /you have Python/);
});

test("feature vectors stay in weight order and inside 0 to 1", () => {
    for (const person of students) {
        for (const project of projects) {
            const vector = featureVector(person, project);
            assert.equal(vector.length, 5);
            for (const value of vector) {
                assert.ok(value >= 0 && value <= 1);
                assert.ok(Number.isFinite(value));
            }
            const score = scoreProject(person, project);
            assert.equal(score, Math.round(score));
            assert.ok(score >= 0 && score <= 100);
        }
    }
});

test("legacy survey state maps into the schema", () => {
    const derived = profileFromState({
        skills: ["Python", "Robotics", "Computer Vision"],
        topics: ["Sustainability", "Accessibility"],
        minutes: 15,
    });
    assert.deepEqual(derived.languages, ["Python"]);
    assert.deepEqual(derived.interests, ["Sustainability", "Robotics"]);
    assert.equal(derived.hours_per_week, 2);
    assert.equal(derived.experience, 3);

    const explicit = profileFromState({
        languages: [],
        interests: [],
        skills: ["Python"],
        topics: ["Design"],
        hours_per_week: "8+",
        experience: 1,
    });
    assert.deepEqual(explicit.languages, []);
    assert.deepEqual(explicit.interests, []);
    assert.equal(explicit.hours_per_week, "8+");
    assert.equal(explicit.experience, 1);
});

test("stored profiles keep an explicit survey and migrate the old prototype", () => {
    const defaults = {
        name: "Aryahi Nittur",
        email: "aryahi.nittur@gmail.com",
        languages: ["Python"],
        interests: ["Robotics"],
        learn: ["Machine Learning"],
        year: "Junior",
        major: "Computer Science",
        experience: 3,
        hours_per_week: 4,
        skills: ["Python"],
        topics: ["Robotics"],
        minutes: 30,
    };
    assert.equal(applyStoredProfile(defaults, {}).hours_per_week, 4);
    assert.deepEqual(applyStoredProfile(defaults, {}).languages, ["Python"]);

    const legacy = applyStoredProfile(defaults, {
        onboarded: true,
        skills: ["JavaScript"],
        topics: ["Design"],
        minutes: 60,
        passed: ["help1"],
    });
    assert.deepEqual(legacy.languages, ["JavaScript"]);
    assert.deepEqual(legacy.interests, ["Design"]);
    assert.equal(legacy.hours_per_week, "8+");
    assert.equal(legacy.major, "Computer Science");
    assert.deepEqual(legacy.passed, ["help1"]);

    const fresh = applyStoredProfile(defaults, {
        languages: ["SQL"],
        interests: ["Data"],
        skills: ["Python"],
        hours_per_week: 2,
    });
    assert.deepEqual(fresh.languages, ["SQL"]);
    assert.deepEqual(fresh.interests, ["Data"]);
    assert.equal(fresh.hours_per_week, 2);
});

test("the live deck adapter drops passes, joins, and help offers", () => {
    const state = {
        ...demo.student,
        mode: "help",
        passed: ["help1", "join5"],
        joined: [4],
        offers: [3],
        saved: [2],
    };
    assert.deepEqual(
        deckFromState(state, demo.projects).map((row) => row.project.id),
        [2]
    );
    state.mode = "join";
    assert.deepEqual(
        deckFromState(state, demo.projects).map((row) => row.project.id),
        [3, 2]
    );
    assert.equal(deckFromState(state, demo.projects)[0].score, scoreProject(demo.student, demo.projects[2]));
});

test("the default demo student ranks the five visible projects", () => {
    const ranked = rankProjects(demo.student, demo.projects);
    assert.deepEqual(
        ranked.map((row) => [row.project.id, row.score]),
        [
            [1, 80],
            [3, 80],
            [5, 36],
            [4, 31],
            [2, 20],
        ]
    );
    assert.ok(ranked[0].project.spots > ranked[1].project.spots);
    assert.match(ranked[0].reason, /^80% — /);
    assert.match(ranked[0].reason, /Sustainability lines up/);
    assert.match(ranked[0].reason, /you have Python/);
});

test("the live page calls the weighted ranker and not the offline model", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "rank.js"), "utf8");
    assert.match(html, /matching\/rank\.js/);
    assert.doesNotMatch(html, /matching\/demoDeck\.js/);
    assert.match(app, /api\('\/api\/projects'\)/);
    assert.match(html, /app\.js/);
    assert.match(app, /BridgeMatch\.deckFromState/);
    assert.match(app, /BridgeMatch\.scoreProject/);
    assert.match(app, /BridgeMatch\.reasonFor/);
    assert.doesNotMatch(html + app, /predictLike|fitLogistic|40 \* matches/);
    assert.doesNotMatch(source, /fitLogistic|predictLike/);
});
