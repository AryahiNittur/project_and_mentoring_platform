// Weighted project matcher for the Bridge swipe deck.
// The live deck calls scoreProject, reasonFor, and rankProjects.
// It does not call the offline P(like) model in logistic.js.
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    root.BridgeMatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const WEIGHTS = Object.freeze({ interest: 0.3, learn: 0.2, skill: 0.2, experience: 0.18, time: 0.12 });
    const FEATURE_KEYS = Object.freeze(["interest", "learn", "skill", "experience", "time"]);
    const LANGUAGES = Object.freeze(["Python", "JavaScript", "Java", "C++", "SQL", "HTML/CSS", "Swift", "R"]);
    const INTERESTS = Object.freeze([
        "Machine Learning",
        "AI",
        "Cybersecurity",
        "Web",
        "Mobile",
        "Data",
        "Robotics",
        "Sustainability",
        "Design",
        "Healthcare",
        "Education",
    ]);
    const EXPERIENCE_LEVELS = Object.freeze([
        { level: 1, label: "Coursework only" },
        { level: 2, label: "Class projects" },
        { level: 3, label: "Personal projects or hackathons" },
        { level: 4, label: "Internship or research" },
        { level: 5, label: "Shipped something or led a team" },
    ]);
    const HOUR_OPTIONS = Object.freeze([2, 4, 6, "8+"]);
    const EMPTY_REASON = "Add languages and interests to rank projects.";

    const norm = (value) => String(value).trim().toLowerCase();

    function tagList(value) {
        return Array.isArray(value) ? value : [];
    }

    function coverage(studentTags, projectTags) {
        const wanted = tagList(projectTags);
        if (!wanted.length) return 0;
        const have = new Set(tagList(studentTags).map(norm));
        return wanted.filter((tag) => have.has(norm(tag))).length / wanted.length;
    }

    function experienceFit(studentExp, target) {
        const student = Number(studentExp);
        const goal = Number(target);
        if (!Number.isFinite(student) || !Number.isFinite(goal)) return 0;
        return Math.max(0, 1 - Math.abs(student - goal) / 4);
    }

    // Survey hours are 2, 4, 6, or 8+. "8+" counts as 8 in the ratio.
    function parseHours(value) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        const text = String(value ?? "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "");
        if (!text) return NaN;
        if (text === "8+") return 8;
        const parsed = Number(text);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    function timeFit(studentHours, projectHours) {
        const student = parseHours(studentHours);
        const project = parseHours(projectHours);
        if (!Number.isFinite(student) || !Number.isFinite(project) || project <= 0) return 0;
        return Math.min(1, student / project);
    }

    function features(student, project) {
        const person = student || {};
        const proj = project || {};
        return {
            interest: coverage(person.interests, proj.interests),
            learn: coverage(person.learn, proj.learn_outcomes),
            skill: coverage(person.languages, proj.languages),
            experience: experienceFit(person.experience, proj.target_experience),
            time: timeFit(person.hours_per_week, proj.hours_per_week),
        };
    }

    function featureVector(student, project) {
        const vector = features(student, project);
        return FEATURE_KEYS.map((key) => vector[key]);
    }

    function majorBonus(student, project) {
        const majors = project && project.majors;
        if (!Array.isArray(majors) || !majors.length) return 0;
        return majors.includes(student && student.major) ? 5 : 0;
    }

    function scoreProject(student, project) {
        const person = student || {};
        const proj = project || {};
        if (!tagList(person.languages).length && !tagList(person.interests).length) return 0;
        const vector = features(person, proj);
        const match = Math.round(
            100 *
                (WEIGHTS.interest * vector.interest +
                    WEIGHTS.learn * vector.learn +
                    WEIGHTS.skill * vector.skill +
                    WEIGHTS.experience * vector.experience +
                    WEIGHTS.time * vector.time)
        );
        return Math.min(100, match + majorBonus(person, proj));
    }

    function overlap(studentTags, projectTags) {
        const have = new Set(tagList(studentTags).map(norm));
        return tagList(projectTags).filter((tag) => have.has(norm(tag)));
    }

    function joinClause(parts) {
        if (parts.length <= 1) return parts[0] || "";
        if (parts.length === 2) return parts[0] + " and " + parts[1];
        return parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
    }

    function reasonFor(student, project) {
        const person = student || {};
        const proj = project || {};
        if (!tagList(person.languages).length && !tagList(person.interests).length) return EMPTY_REASON;

        const score = scoreProject(person, proj);
        const vector = features(person, proj);
        const hits = [];

        const interests = overlap(person.interests, proj.interests);
        if (interests.length) {
            hits.push({
                weight: WEIGHTS.interest * vector.interest,
                text: joinClause(interests) + (interests.length > 1 ? " line up" : " lines up"),
            });
        }

        const languages = overlap(person.languages, proj.languages);
        if (languages.length) {
            hits.push({
                weight: WEIGHTS.skill * vector.skill,
                text: "you have " + joinClause(languages),
            });
        }

        const learn = overlap(person.learn, proj.learn_outcomes);
        if (learn.length) {
            hits.push({
                weight: WEIGHTS.learn * vector.learn,
                text: "you want to learn " + joinClause(learn),
            });
        }

        const gap = Math.abs(Number(person.experience) - Number(proj.target_experience));
        if (vector.experience >= 0.75 && Number.isFinite(gap)) {
            hits.push({
                weight: WEIGHTS.experience * vector.experience,
                text: gap === 0 ? "your experience matches this team" : "your experience is close to this team",
            });
        }

        if (vector.time >= 1) {
            hits.push({
                weight: WEIGHTS.time * vector.time,
                text: "you can give the hours this project needs",
            });
        } else if (vector.time >= 0.5) {
            hits.push({
                weight: WEIGHTS.time * vector.time,
                text: "you can cover part of the weekly hours",
            });
        }

        if (majorBonus(person, proj)) {
            hits.push({ weight: 0.05, text: "your major is on this team" });
        }

        hits.sort((a, b) => {
            const diff = b.weight - a.weight;
            if (Math.abs(diff) > 1e-6) return diff;
            return a.text.localeCompare(b.text);
        });
        const top = hits.slice(0, 3);
        if (!top.length) return score + "% — interests, languages, and hours do not line up with this project yet.";
        return score + "% — " + joinClause(top.map((hit) => hit.text)) + ".";
    }

    function spotsLeft(project) {
        const spots = Number(project && project.spots);
        return Number.isFinite(spots) ? spots : 0;
    }

    function compareId(a, b) {
        const aText = typeof a === "string" ? a.trim() : a;
        const bText = typeof b === "string" ? b.trim() : b;
        const aNumeric = typeof aText === "number" || (typeof aText === "string" && aText !== "" && Number.isFinite(Number(aText)));
        const bNumeric = typeof bText === "number" || (typeof bText === "string" && bText !== "" && Number.isFinite(Number(bText)));
        if (aNumeric && bNumeric) return Number(aText) - Number(bText);
        return String(a).localeCompare(String(b));
    }

    function rankProjects(student, projects, passedIds = [], joinedIds = []) {
        const passed = new Set((passedIds || []).map((id) => String(id)));
        const joined = new Set((joinedIds || []).map((id) => String(id)));
        return (projects || [])
            .filter(
                (project) =>
                    spotsLeft(project) > 0 && !passed.has(String(project.id)) && !joined.has(String(project.id))
            )
            .map((project) => ({
                project,
                score: scoreProject(student, project),
                reason: reasonFor(student, project),
            }))
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const spots = spotsLeft(b.project) - spotsLeft(a.project);
                if (spots !== 0) return spots;
                return compareId(a.project.id, b.project.id);
            });
    }

    function pickKnown(values, vocabulary) {
        const allowed = new Set(vocabulary.map(norm));
        const found = [];
        for (const value of tagList(values)) {
            if (!allowed.has(norm(value))) continue;
            const canonical = vocabulary.find((item) => norm(item) === norm(value));
            if (!found.some((item) => norm(item) === norm(canonical))) found.push(canonical);
        }
        return found;
    }

    function hoursFromMinutes(minutes) {
        const amount = Number(minutes);
        if (!Number.isFinite(amount)) return 4;
        if (amount <= 15) return 2;
        if (amount <= 20) return 4;
        if (amount <= 30) return 6;
        return "8+";
    }

    function profileFromState(state) {
        const source = state || {};
        const languages = Array.isArray(source.languages) ? source.languages.slice() : pickKnown(source.skills, LANGUAGES);
        let interests = Array.isArray(source.interests) ? source.interests.slice() : pickKnown(source.topics, INTERESTS);
        if (!Array.isArray(source.interests)) {
            for (const interest of pickKnown(source.skills, INTERESTS)) {
                if (!interests.some((item) => norm(item) === norm(interest))) interests.push(interest);
            }
        }
        return {
            name: source.name || "",
            email: source.email || "",
            languages,
            interests,
            learn: Array.isArray(source.learn) ? source.learn.slice() : [],
            year: source.year || "",
            major: source.major || "",
            experience: source.experience == null || source.experience === "" ? 3 : source.experience,
            hours_per_week:
                source.hours_per_week == null || source.hours_per_week === ""
                    ? hoursFromMinutes(source.minutes)
                    : source.hours_per_week,
        };
    }

    function normalizeIds(list) {
        const ids = [];
        for (const entry of list || []) {
            if (typeof entry === "number" && Number.isFinite(entry)) {
                ids.push(entry);
                continue;
            }
            const text = String(entry ?? "").trim();
            const stripped = text.replace(/^(help|join)/i, "");
            if (/^\d+$/.test(stripped)) ids.push(Number(stripped));
            else if (text) ids.push(text);
        }
        return ids;
    }

    function deckFromState(state, projects) {
        const source = state || {};
        const joined = normalizeIds(source.joined);
        if (source.mode === "help") joined.push(...normalizeIds(source.offers));
        return rankProjects(profileFromState(source), projects, normalizeIds(source.passed), joined);
    }

    function applyStoredProfile(defaults, stored) {
        const base = defaults || {};
        const incoming = stored && typeof stored === "object" ? stored : {};
        const state = { ...base, ...incoming };
        const hasNewSurvey =
            Object.prototype.hasOwnProperty.call(incoming, "languages") ||
            Object.prototype.hasOwnProperty.call(incoming, "interests");
        if (hasNewSurvey || Object.keys(incoming).length === 0) return state;

        const derived = profileFromState({
            skills: incoming.skills || base.skills,
            topics: incoming.topics || base.topics,
            minutes: incoming.minutes == null ? base.minutes : incoming.minutes,
            learn: incoming.learn,
            name: incoming.name,
            email: incoming.email,
            year: incoming.year,
            major: incoming.major,
            experience: incoming.experience,
            hours_per_week: incoming.hours_per_week,
        });
        state.languages = derived.languages;
        state.interests = derived.interests;
        if (!Object.prototype.hasOwnProperty.call(incoming, "learn")) state.learn = base.learn ? [...base.learn] : [];
        if (!Object.prototype.hasOwnProperty.call(incoming, "hours_per_week")) state.hours_per_week = derived.hours_per_week;
        if (!Object.prototype.hasOwnProperty.call(incoming, "experience")) state.experience = base.experience;
        if (!Object.prototype.hasOwnProperty.call(incoming, "major")) state.major = base.major || "";
        if (!Object.prototype.hasOwnProperty.call(incoming, "year")) state.year = base.year || "";
        if (!Object.prototype.hasOwnProperty.call(incoming, "name")) state.name = base.name || "";
        if (!Object.prototype.hasOwnProperty.call(incoming, "email")) state.email = base.email || "";
        return state;
    }

    return {
        WEIGHTS,
        FEATURE_KEYS,
        LANGUAGES,
        INTERESTS,
        EXPERIENCE_LEVELS,
        HOUR_OPTIONS,
        EMPTY_REASON,
        norm,
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
        hoursFromMinutes,
    };
});
