if (!globalThis.BridgeMatch) {
    throw new Error("The matching script must load before app.js.");
}

const STUDENT_ID = 1;
const STORAGE_KEY = `bridge-aws-student-${STUDENT_ID}`;

const projects = [];

// Initial placeholders only; replaced with the database profile on startup.
const persona = {
    name: "",
    email: "",
    languages: [],
    interests: [],
    learn: [],
    year: "",
    major: "",
    experience: 1,
    hours_per_week: 2,
};

const defaults = {
    onboarded: false,
    name: persona.name,
    email: persona.email,
    languages: [...persona.languages],
    interests: [...persona.interests],
    learn: [...persona.learn],
    year: persona.year,
    major: persona.major,
    experience: persona.experience,
    hours_per_week: persona.hours_per_week,
    skills: [...persona.languages],
    topics: [...persona.interests],
    minutes: 30,
    mode: "help",
    goal: "Both",
    helps: 12,
    passed: [],
    saved: [],
    offers: [],
    joined: [],
    confirmed: [],
    reviews: [],
};
let state;
try {
    state = BridgeMatch.applyStoredProfile(defaults, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
} catch {
    state = { ...defaults };
}
normalizeStoredIds();
let deckRecord = null;
let swipeInFlight = false;
let page = "Overview",
    step = 0,
    draft = {},
    dragStart = null;
const esc = (s) =>
    String(s).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
function personInitials(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return "?";
    const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
    return letters.toUpperCase();
}
function firstName() {
    const name = String(state.name || "").trim();
    return name ? name.split(/\s+/)[0] : "this student";
}
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const tier = () =>
    state.helps >= 25
        ? "Community Champion"
        : state.helps >= 10
          ? "Connector"
          : state.helps >= 3
            ? "Contributor"
            : "New Neighbor";
function toast(msg) {
    document.getElementById("toast").innerHTML = '<div class="toast" role="status">' + esc(msg) + "</div>";
    clearTimeout(window.tt);
    window.tt = setTimeout(() => (document.getElementById("toast").innerHTML = ""), 3500);
}
function navigate(p) {
    page = p;
    render();
}
const MAJORS = [
    "Computer Science",
    "Data Science",
    "Design",
    "Biology",
    "Business",
    "Electrical Engineering",
    "Mechanical Engineering",
    "Psychology",
];
const YEARS = ["First-year", "Sophomore", "Junior", "Senior"];
function studentProfile() {
    return BridgeMatch.profileFromState(state);
}
function score(p) {
    return BridgeMatch.scoreProject(studentProfile(), p);
}
function matchReason(p) {
    return BridgeMatch.reasonFor(studentProfile(), p);
}
function feed() {
    return BridgeMatch.deckFromState(state, projects).map((row) => row.project);
}
function tagChips(list) {
    return (list || []).map((item) => '<span class="chip">' + esc(item) + "</span>").join("");
}
function choiceButtons(key, options) {
    return options
        .map(
            (option) =>
                '<button type="button" class="choice ' +
                (draft[key].some((item) => BridgeMatch.norm(item) === BridgeMatch.norm(option)) ? "on" : "") +
                "\" onclick=\"toggleChoice('" +
                key +
                "','" +
                option +
                "')\">" +
                esc(option) +
                "</button>"
        )
        .join("");
}
function rankRows(full = false) {
    const youName = state.name || "You";
    let users = [
        { name: "Riley Patel", field: "Design · Senior", n: 28, initials: "RP", color: "#f7e6dc" },
        { name: "Jordan Williams", field: "Engineering · Junior", n: 21, initials: "JW", color: "#e2ede7" },
        { name: "Sam Rivera", field: "Business · Senior", n: 17, initials: "SR", color: "#e8e6f5" },
        {
            name: youName,
            field: "You · " + (state.major || "Ohio State"),
            n: state.helps,
            initials: personInitials(youName),
            color: "#e9e3fc",
            you: true,
        },
    ]
        .filter(
            (person) =>
                person.you || person.name.trim().toLowerCase() !== youName.trim().toLowerCase()
        )
        .sort((a, b) => b.n - a.n);
    return users
        .map(
            (u, i) =>
                '<div class="rankrow ' +
                (u.you ? "yourow" : "") +
                '"><span class="num">' +
                (i + 1) +
                '</span><div class="avatar" style="background:' +
                u.color +
                '">' +
                u.initials +
                "</div><div><b>" +
                u.name +
                "</b><small>" +
                u.field +
                "</small></div><strong>" +
                u.n +
                ' <span style="font-weight:400;color:#999;font-size:10px">helps</span></strong></div>'
        )
        .join("");
}
function render() {
    document.getElementById("nav").innerHTML = [
        ["Overview", "◫"],
        ["Discover", "◇"],
        ["My connections", "♧"],
        ["Leaderboard", "↗"],
        ["My profile", "◎"],
    ]
        .map(
            ([p, i]) =>
                '<button class="nav ' +
                (page === p ? "active" : "") +
                '" onclick="navigate(\'' +
                p +
                "')\"><span>" +
                i +
                '</span><em style="font-style:normal">' +
                p +
                "</em></button>"
        )
        .join("");
    document.getElementById("crumb").textContent = page;
    let html = "";
    if (page === "Overview" || page === "Discover") {
        html =
            '<div class="pageheading"><div><h1>' +
            (page === "Overview" ? "Good things start together." : "Find your next connection.") +
            '</h1><p style="margin:0">' +
            (page === "Overview"
                ? "Find your next project. Share what you know. Make a difference."
                : "A little of your time can move someone’s project forward.") +
            '</p></div><button class="outline" onclick="openOnboarding()">⚙ &nbsp; Your preferences</button></div>';
        if (page === "Overview")
            html +=
                '<div class="stats"><div class="stat"><div class="stathead">Peers helped <span class="purple">♧</span></div><strong>' +
                state.helps +
                '</strong><small class="green">✓ Confirmed by your peers</small></div><div class="stat"><div class="stathead">Your community tier <span>✧</span></div><strong style="font-size:23px">' +
                tier() +
                '</strong><small>Every contribution counts</small></div><div class="stat"><div class="stathead">Active connections <span class="purple">◇</span></div><strong>' +
                (state.offers.length + state.joined.length) +
                '</strong><small>Building something together</small></div><div class="stat"><div class="stathead">Community standing <span>↗</span></div><strong>#' +
                ([28, 21, 17].filter((x) => x > state.helps).length + 1) +
                "</strong><small>Among 4 demo members</small></div></div>";
        html +=
            '<div class="layout"><div><section class="panel"><div class="panelhead"><h2>Your next connection</h2><div class="tabs"><button class="' +
            (state.mode === "join" ? "selected" : "") +
            '" onclick="setMode(\'join\')">Join a project</button><button class="' +
            (state.mode === "help" ? "selected" : "") +
            '" onclick="setMode(\'help\')">Give back</button></div></div>' +
            card() +
            '</section><section class="panel below"><div class="panelhead"><h2>Your reputation, in their words</h2><button class="link" onclick="navigate(\'My profile\')">View profile ↗</button></div><div class="quote"><p>“' +
            esc(firstName()) +
            ' breaks down tricky problems without making you feel behind. They helped us get our first working prototype, and made sure we understood why it worked.”</p><div class="quoteby"><div class="avatar" style="width:29px;height:29px;font-size:10px;background:#e2ede7">JL</div><div><b>Jamie Lee</b><small>Teammate · Campus robotics project · Sample endorsement</small></div><span class="badge" style="margin-left:auto">PEER WRITTEN</span></div></div></section></div><div class="side"><section class="panel tier"><div class="label">YOUR GROWTH</div><div class="tiermark" style="margin-top:18px">✧</div><h3>' +
            tier() +
            '</h3><p>You’re turning what you know into someone else’s next step.</p><div class="progress"><span style="width:' +
            Math.min(100, (state.helps / 25) * 100) +
            '%"></span></div><div style="display:flex;justify-content:space-between;font-size:10px;color:#8d8999"><span>' +
            state.helps +
            ' confirmed helps</span><span>25 to Champion</span></div><button class="link" style="padding:18px 0 0" onclick="navigate(\'Leaderboard\')">Explore the tiers →</button></section><section class="panel"><div class="panelhead"><h2>Community builders</h2><button class="link" onclick="navigate(\'Leaderboard\')">View all</button></div><div style="padding:0 22px 22px">' +
            rankRows() +
            '</div></section><div style="padding:0 5px"><div class="label">A LITTLE HELP GOES A LONG WAY</div><p style="font-size:12px">A code review. A fresh perspective. Twenty minutes can be someone’s breakthrough.</p></div></div></div>';
    } else if (page === "Leaderboard") {
        html =
            '<div class="pageheading"><div><h1>Small acts. Lasting impact.</h1><p>Celebrating the people who help our community grow.</p></div></div><div class="layout"><section class="panel"><div class="panelhead"><h2>Community leaderboard</h2><span class="badge">ALL TIME</span></div><div style="padding:0 25px 25px">' +
            rankRows(true) +
            '</div></section><section class="panel tier"><h2>How helps count</h2><p>One completed request, confirmed by the receiving teammate, counts as one help. Sending an offer or swiping never earns a help.</p><p>Counts show participation, not a measure of someone’s ability or worth.</p></section></div><div class="tiergrid">' +
            [
                ["○", "New Neighbor", "0–2 helps"],
                ["✦", "Contributor", "3–9 helps"],
                ["✧", "Connector", "10–24 helps"],
                ["♛", "Community Champion", "25+ helps"],
            ]
                .map(
                    (t) =>
                        '<div class="tierbox"><span style="font-size:28px;color:var(--purple)">' +
                        t[0] +
                        "</span><h3>" +
                        t[1] +
                        "</h3><p>" +
                        t[2] +
                        "</p></div>"
                )
                .join("") +
            "</div>";
    } else if (page === "My connections") {
        let ids = [...new Set([...state.offers, ...state.joined])];
        html =
            '<div class="pageheading"><div><h1>Make a connection count.</h1><p>Follow through on your offers and build something together.</p></div></div><section class="panel"><div class="panelhead"><h2>Your projects & help offers</h2><span class="badge">' +
            ids.length +
            " CONNECTIONS</span></div>" +
            (ids.length
                ? ids
                      .map((id) => {
                          let p = projectById(id),
                              done = state.confirmed.includes(id);
                          if (!p) return "";
                          return (
                              '<div class="listcard"><span class="badge">' +
                              (done
                                  ? "HELP CONFIRMED"
                                  : state.offers.includes(id)
                                    ? "HELP OFFER SENT"
                                    : "JOIN REQUEST SENT") +
                              "</span><h3>" +
                              esc(p.title) +
                              "</h3><p>" +
                              esc(scheduleLine(p) || "Schedule not listed") +
                              " · " +
                              esc((p.spots ?? "?") + " spots left") +
                              (p.mentor ? " · " + esc(p.mentor) : "") +
                              "</p><p>" +
                              (done
                                  ? "Sample teammate confirmed your contribution. Your tier and leaderboard have updated."
                                  : "Awaiting a response from the project team. For this prototype, you can simulate the receiving teammate confirming a completed help request.") +
                              "</p>" +
                              (state.offers.includes(id) && !done
                                  ? '<button class="primary" onclick="confirmHelp(' +
                                    id +
                                    ')">Demo: teammate confirms completed help</button>'
                                  : "") +
                              "</div>"
                          );
                      })
                      .join("")
                : '<div class="empty"><h3>Your next connection is waiting.</h3><p>Offer help or request to join a project in Discover.</p><button class="primary" onclick="navigate(\'Discover\')">Explore projects →</button></div>') +
            "</section>";
    } else {
        html =
            '<div class="pageheading"><div><h1>Your story, told together.</h1><p>A profile built from what others experienced working with you.</p></div><button class="outline" onclick="openOnboarding()">Edit preferences</button></div><div class="layout"><section class="panel"><div style="padding:28px"><div class="avatar" style="width:72px;height:72px;font-size:23px">' +
            esc(personInitials(state.name)) +
            "</div><h3>" +
            esc(state.name) +
            "</h3><p>" +
            esc(state.major) +
            " · " +
            esc(state.year) +
            " · Ohio State University</p><p>" +
            esc(state.email) +
            '</p><span class="badge">' +
            tier().toUpperCase() +
            '</span> <span class="chip">' +
            state.helps +
            ' confirmed helps</span><hr style="border:0;border-top:1px solid var(--line);margin:25px 0"><div class="label">WHAT PEERS SAY</div><p style="color:#515968">“Patient, practical, and always ready to work through a difficult problem together.”</p><small style="color:#999">Jamie Lee · Sample teammate endorsement</small>' +
            state.reviews
                .map(
                    (r) =>
                        '<div style="border-top:1px solid var(--line);margin-top:22px;padding-top:12px"><p>“' +
                        esc(r.text) +
                        '”</p><small style="color:#999">' +
                        esc(r.author) +
                        " · Demo peer endorsement</small></div>"
                )
                .join("") +
            '<div style="margin-top:25px"><button class="outline" onclick="openReview()">Demo: write as a peer</button></div></div></section><section class="panel tier"><h2>How you like to contribute</h2><p>Experience ' +
            esc(state.experience) +
            " · " +
            esc(state.hours_per_week) +
            ' hours per week</p><p>Languages</p><div class="chips">' +
            tagChips(state.languages) +
            '</div><p>Interests</p><div class="chips">' +
            tagChips(state.interests) +
            '</div><p>Wants to learn</p><div class="chips">' +
            (state.learn && state.learn.length ? tagChips(state.learn) : '<span class="chip">Not specified</span>') +
            "</div><p>Goal: " +
            esc(state.goal) +
            '</p><div class="why">Your preferences are self-selected. The profile descriptions above are written by peers.</div></section></div>';
    }
    document.getElementById("view").innerHTML = html;
    let art = document.getElementById("projectcard");
    if (art) {
        art.onpointerdown = (e) => {
            if (e.target.closest("button")) return;
            dragStart = e.clientX;
        };
        art.onpointerup = (e) => {
            if (dragStart === null) return;
            let dx = e.clientX - dragStart;
            dragStart = null;
            if (Math.abs(dx) > 80) act(dx > 0 ? "offer" : "pass");
        };
        art.onpointercancel = () => (dragStart = null);
    }
}
function card() {
    let list = feed(),
        p = list[0];
    if (!p)
        return '<div class="empty"><h3>You’re all caught up.</h3><p>Adjust your preferences or revisit the sample projects.</p><button class="outline" onclick="state.passed=[];save();render()">Revisit passed projects</button> <button class="link" onclick="openOnboarding()">Edit preferences</button></div>';
    return (
        '<div class="feedbody" id="projectcard" data-project-id="' +
        p.id +
        '" data-score="' +
        score(p) +
        '" style="touch-action:pan-y"><div class="projectart" style="background:' +
        p.color +
        '">' +
        projectArt(p) +
        '<span class="badge">' +
        (state.mode === "help" ? "A LITTLE HELP NEEDED" : "BUILD SOMETHING MEANINGFUL") +
        "</span><small>" +
        esc((p.topic || p.org || "Project").toUpperCase()) +
        '</small></div><div class="projectmeta"><span class="label">' +
        esc(p.org || "") +
        '</span><span class="badge" id="fit-score">' +
        score(p) +
        "% FIT</span></div><h3>" +
        esc(p.title) +
        '</h3><p class="projectdesc">' +
        esc(p.description || p.desc || "") +
        '</p><div class="chips">' +
        tagChips([...(p.languages || []), ...(p.interests || [])]) +
        '<span class="chip">' +
        esc(state.mode === "help" ? p.type || "Company project" : "Student teammate") +
        '</span></div><div class="facts"><span>◷ ' +
        esc(scheduleLine(p)) +
        "</span><span>♧ " +
        esc(p.spots + " spots left") +
        '</span></div><p style="font-size:11px;margin:-5px 0 14px">' +
        esc(p.mentor || "") +
        '</p><div class="why" id="match-reason"><b>✧ &nbsp; Why this connection?</b><br>' +
        esc(matchReason(p)) +
        '</div><div class="swipeactions"><button class="round" aria-label="Pass project" onclick="act(\'pass\')">×</button><button class="round" aria-label="Save project" onclick="act(\'save\')">' +
        (state.saved.includes(p.id) ? "★" : "☆") +
        '</button><button class="matchbtn" onclick="act(\'offer\')">' +
        (state.mode === "help" ? "♡ &nbsp; Offer to help" : "＋ &nbsp; Request to join") +
        '</button></div><div class="feedfoot">Swipe left to pass · Swipe right to connect · ' +
        list.length +
        " opportunities for you</div></div>"
    );
}
function setMode(m) {
    state.mode = m;
    save();
    render();
}
async function act(a) {
    let p = feed()[0];
    if (!p) return;
    const projectId = Number(p.id);
    if (a === "save") {
        if (!state.saved.includes(projectId)) {
            state.saved.push(projectId);
            toast("Saved. You can still offer help or join this project.");
        } else {
            state.saved = state.saved.filter((x) => x !== projectId);
            toast("Removed from saved projects.");
        }
        save();
        render();
        return;
    }
    if (swipeInFlight) return;
    const bucket = a === "pass" ? state.passed : state.mode === "help" ? state.offers : state.joined;
    if (bucket.includes(projectId)) return;
    swipeInFlight = true;
    try {
        let deck;
        try {
            deck = await ensureDeck();
        } catch (error) {
            console.error(error);
            toast("Could not save this deck. Check the database and try again.");
            return;
        }
        const swipeScore = deck.scores[projectId];
        try {
            await fetchJSON("/api/swipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event_id: crypto.randomUUID(),
                    deck_id: deck.id,
                    student_id: STUDENT_ID,
                    project_id: projectId,
                    action: a === "pass" ? "pass" : "like",
                    score: swipeScore,
                }),
            });
        } catch (error) {
            console.error(error);
            toast("Could not record that swipe. Nothing was changed.");
            return;
        }
        if (a === "pass") {
            state.passed.push(projectId);
        } else {
            (state.mode === "help" ? state.offers : state.joined).push(projectId);
            toast(
                state.mode === "help"
                    ? "Help offer sent! Follow up in My connections."
                    : "Join request sent! See My connections."
            );
        }
        save();
        render();
    } finally {
        swipeInFlight = false;
    }
}
function confirmHelp(id) {
    if (state.confirmed.includes(id)) return;
    state.confirmed.push(id);
    state.helps++;
    save();
    render();
    toast("Teammate confirmation simulated. +1 confirmed help!");
}
function openOnboarding() {
    const profile = studentProfile();
    draft = {
        goal: state.goal,
        major: state.major || profile.major,
        year: state.year || profile.year,
        experience: Number(state.experience == null ? profile.experience : state.experience) || 3,
        languages: [...profile.languages],
        interests: [...profile.interests],
        learn: [...(state.learn || profile.learn || [])],
        hours_per_week: state.hours_per_week == null ? profile.hours_per_week : state.hours_per_week,
    };
    step = 0;
    showOnboarding();
}
function toggleChoice(key, val) {
    const selected = draft[key].some((item) => BridgeMatch.norm(item) === BridgeMatch.norm(val));
    draft[key] = selected
        ? draft[key].filter((item) => BridgeMatch.norm(item) !== BridgeMatch.norm(val))
        : [...draft[key], val];
    showOnboarding();
}
function optionList(options, current) {
    const values = current && !options.map(String).includes(String(current)) ? [current, ...options] : options;
    return values
        .map(
            (option) =>
                "<option " +
                (String(current) === String(option) ? "selected" : "") +
                ' value="' +
                esc(option) +
                '">' +
                esc(option) +
                "</option>"
        )
        .join("");
}
function showOnboarding() {
    let title = ["What brings you to Bridge?", "What can you share?", "Make it fit your life."][step],
        desc = [
            "Tell us your year, major, and how much you have built so far.",
            "Languages are matched against what the project is written in.",
            "Interests, what you want to learn, and weekly hours set the deck order.",
        ][step];
    let content =
        step === 0
            ? "<label>Your goal</label>" +
              ["Join a project", "Mentor others", "Both"]
                  .map(
                      (x) =>
                          '<button type="button" class="choice ' +
                          (draft.goal === x ? "on" : "") +
                          '" onclick="draft.goal=\'' +
                          x +
                          "';showOnboarding()\">" +
                          x +
                          "</button>"
                  )
                  .join("") +
              '<label for="major">Major</label><select id="major" onchange="draft.major=this.value">' +
              optionList(MAJORS, draft.major) +
              '</select><label for="year">Year</label><select id="year" onchange="draft.year=this.value">' +
              optionList(YEARS, draft.year) +
              "</select><label>Experience</label>" +
              BridgeMatch.EXPERIENCE_LEVELS.map(
                  (level) =>
                      '<button type="button" class="choice ' +
                      (Number(draft.experience) === level.level ? "on" : "") +
                      '" onclick="draft.experience=' +
                      level.level +
                      ';showOnboarding()">' +
                      level.level +
                      " · " +
                      esc(level.label) +
                      "</button>"
              ).join("")
            : step === 1
              ? "<label>Languages · select at least one</label>" + choiceButtons("languages", BridgeMatch.LANGUAGES)
              : "<label>Interests · select at least one</label>" +
                choiceButtons("interests", BridgeMatch.INTERESTS) +
                "<label>What you want to learn</label>" +
                choiceButtons("learn", BridgeMatch.INTERESTS) +
                '<label for="hours">Hours per week</label><select id="hours" onchange="draft.hours_per_week=this.value===\'8+\'?\'8+\':Number(this.value)">' +
                optionList(BridgeMatch.HOUR_OPTIONS, draft.hours_per_week) +
                "</select>";
    document.getElementById("overlay").innerHTML =
        '<div class="modalback"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="close" aria-label="Close onboarding" onclick="closeModal()">×</button><div class="label purple">GET CONNECTED · STEP ' +
        (step + 1) +
        ' OF 3</div><h2 id="modalTitle">' +
        title +
        "</h2><p>" +
        desc +
        '</p><div class="progress"><span style="width:' +
        ((step + 1) / 3) * 100 +
        '%"></span></div>' +
        content +
        '<div class="modalfooter"><button class="link" onclick="' +
        (step ? "step--;showOnboarding()" : "closeModal()") +
        '">' +
        (step ? "← Back" : "Explore first") +
        '</button><button class="primary" onclick="nextStep()">' +
        (step === 2 ? "Find my connections →" : "Continue →") +
        "</button></div></section></div>";
    document.querySelector(".modal .close").focus();
}
async function nextStep() {
    if (step === 1 && !draft.languages.length) {
        toast("Choose at least one language.");
        return;
    }
    if (step === 2) {
        if (!draft.interests.length) {
            toast("Choose at least one interest.");
            return;
        }
        const previous = {
            goal: state.goal,
            major: state.major,
            year: state.year,
            experience: state.experience,
            languages: [...state.languages],
            interests: [...state.interests],
            learn: [...(state.learn || [])],
            hours_per_week: state.hours_per_week,
            skills: [...(state.skills || [])],
            topics: [...(state.topics || [])],
            mode: state.mode,
            onboarded: state.onboarded,
        };
        state.goal = draft.goal;
        state.major = draft.major;
        state.year = draft.year;
        state.experience = Number(draft.experience);
        state.languages = [...draft.languages];
        state.interests = [...draft.interests];
        state.learn = [...draft.learn];
        state.hours_per_week = draft.hours_per_week === "8+" ? "8+" : Number(draft.hours_per_week);
        state.skills = [...draft.languages];
        state.topics = [...draft.interests];
        state.onboarded = true;
        if (draft.goal === "Join a project") state.mode = "join";
        if (draft.goal === "Mentor others") state.mode = "help";
        try {
            applyStudent(await saveStudentProfile());
        } catch (error) {
            console.error(error);
            Object.assign(state, previous);
            toast("Could not save your profile to the database.");
            return;
        }
        save();
        closeModal();
        render();
        ensureDeck().catch((error) => {
            console.error(error);
            toast("Profile saved, but the new deck was not stored.");
        });
        toast("Your personalized feed is ready.");
    } else {
        step++;
        showOnboarding();
    }
}
function closeModal() {
    document.getElementById("overlay").innerHTML = "";
}
function openReview() {
    document.getElementById("overlay").innerHTML =
        '<div class="modalback"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="close" aria-label="Close" onclick="closeModal()">×</button><div class="label">DEMO PEER VIEW</div><h2 id="modalTitle">Tell their story.</h2><p>Describe a specific way ' +
        esc(firstName()) +
        ' helped you. This simulates another person writing an endorsement.</p><form onsubmit="submitReview(event)"><label for="author">Your name</label><input id="author" required maxlength="60" placeholder="e.g. Jamie Lee"><label for="review">What was it like working together?</label><textarea id="review" required minlength="15" maxlength="600" placeholder="What did they help with? What did you learn?"></textarea><div class="modalfooter"><small style="color:#999">Visible in this demo only</small><button class="primary">Add endorsement</button></div></form></section></div>';
    document.getElementById("author").focus();
}
function submitReview(e) {
    e.preventDefault();
    state.reviews.push({
        author: document.getElementById("author").value.trim(),
        text: document.getElementById("review").value.trim(),
    });
    save();
    closeModal();
    render();
    toast("Peer endorsement added.");
}
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
});
async function fetchJSON(path, options) {
    const response = await fetch(path, options);
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { detail: text };
        }
    }
    if (!response.ok) {
        const detail = data && data.detail ? data.detail : response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    return data;
}

function hoursFromDatabase(value) {
    if (typeof value === "string" && value.trim().replace(/\s+/g, "") === "8+") return "8+";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
}

function numericId(value) {
    const text = String(value ?? "")
        .trim()
        .replace(/^(help|join)/i, "");
    return /^\d+$/.test(text) ? Number(text) : value;
}

function normalizeStoredIds() {
    for (const key of ["passed", "saved", "offers", "joined", "confirmed"]) {
        state[key] = [...new Set((state[key] || []).map(numericId))];
    }
}

function projectById(id) {
    const key = String(numericId(id));
    return projects.find((project) => String(project.id) === key);
}

function scheduleLine(project) {
    const parts = [];
    if (project.hours_per_week != null && project.hours_per_week !== "") {
        parts.push(project.hours_per_week + " hrs/week");
    }
    if (project.weeks != null && project.weeks !== "") parts.push(project.weeks + " weeks");
    return parts.join(" · ");
}

function projectArt(project) {
    if (!project.video) return '<div class="artgrid"></div><div class="artshape"></div>';
    return '<video class="projectvideo" src="' + esc(project.video) + '" controls playsinline></video>';
}

function applyStudent(student) {
    const required = ["languages", "interests", "experience", "hours_per_week"];
    for (const field of required) {
        if (student[field] === undefined || student[field] === null) {
            throw new Error(`Student is missing ${field}.`);
        }
    }
    Object.assign(state, {
        id: Number(student.id || STUDENT_ID),
        name: student.name || "",
        email: student.email || "",
        languages: [...student.languages],
        interests: [...student.interests],
        learn: [...(student.learn || [])],
        year: student.year || "",
        major: student.major || "",
        experience: Number(student.experience),
        hours_per_week: hoursFromDatabase(student.hours_per_week),
        skills: [...student.languages],
        topics: [...student.interests],
        onboarded: true,
    });
}

function profileSignature() {
    const profile = studentProfile();
    return JSON.stringify({
        languages: profile.languages,
        interests: profile.interests,
        learn: profile.learn,
        major: profile.major,
        experience: profile.experience,
        hours_per_week: profile.hours_per_week,
        projects: projects.map((project) => [
            project.id,
            project.languages,
            project.interests,
            project.learn_outcomes,
            project.target_experience,
            project.hours_per_week,
            project.majors,
            project.spots,
        ]),
    });
}

function deckMatches() {
    return projects
        .filter((project) => Number(project.spots) > 0)
        .map((project) => {
            const match = {
                project_id: Number(project.id),
                score: score(project),
            };
            if (!Number.isInteger(match.project_id) || match.project_id <= 0 || !Number.isInteger(match.score)) {
                throw new Error("A project score could not be saved.");
            }
            return match;
        });
}

function ensureDeck() {
    const signature = profileSignature();
    if (deckRecord && deckRecord.signature === signature) return deckRecord.ready;
    const deck_id = crypto.randomUUID();
    const matches = deckMatches();
    const scores = Object.fromEntries(matches.map((match) => [match.project_id, match.score]));
    const ready = fetchJSON("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            deck_id,
            student_id: STUDENT_ID,
            matches,
        }),
    })
        .then(() => ({ id: deck_id, scores }))
        .catch((error) => {
            if (deckRecord && deckRecord.signature === signature) deckRecord = null;
            throw error;
        });
    deckRecord = { signature, ready };
    return ready;
}

function saveStudentProfile() {
    return fetchJSON(`/api/students/${STUDENT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            languages: state.languages,
            interests: state.interests,
            learn: state.learn || [],
            year: state.year || "",
            major: state.major || "",
            experience: Number(state.experience),
            hours_per_week: state.hours_per_week === "8+" ? "8+" : Number(state.hours_per_week),
        }),
    });
}

function adaptProject(project) {
    const interests = project.interests || [];
    return {
        ...project,
        id: Number(project.id),
        description: project.description || "",
        desc: project.description || "",
        skills: project.languages || [],
        topic: interests.join(" · "),
        color: project.color || "#eeecf9",
        hours_per_week: hoursFromDatabase(project.hours_per_week),
        weeks: project.weeks,
        spots: Number(project.spots),
        mentor: project.mentor || "",
        video: project.video || "",
        type: "Company project",
        people: `${project.spots} spots open`,
    };
}

async function initializeDashboard() {
    document.getElementById("view").innerHTML =
        '<div class="empty"><h3>Loading your student profile and projects…</h3></div>';

    try {
        const [student, databaseProjects] = await Promise.all([
            fetchJSON(`/api/students/${STUDENT_ID}`),
            fetchJSON("/api/projects"),
        ]);

        if (!Array.isArray(databaseProjects)) {
            throw new Error("The projects endpoint must return an array.");
        }

        applyStudent(student);
        deckRecord = null;

        projects.splice(0, projects.length, ...databaseProjects.map(adaptProject));

        save();
        render();
        ensureDeck().catch((error) => {
            console.error(error);
            toast("Projects loaded, but the deck was not saved to the database.");
        });

        console.log("Database student:", student);
        console.log("Database projects:", projects);
    } catch (error) {
        console.error(error);

        document.getElementById("view").innerHTML =
            '<div class="empty"><h3>Could not load the dashboard</h3><p>' +
            esc(error.message) +
            '</p><button class="primary" onclick="initializeDashboard()">Retry</button></div>';
    }
}

initializeDashboard();