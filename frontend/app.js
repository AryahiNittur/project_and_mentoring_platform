const projects = [
    {
        id: 1,
        title: "A fresher future for campus food",
        org: "Sustainability × Computer Science",
        desc: "Help an interdisciplinary team build a food-waste monitor for campus kitchens.",
        skills: ["Python", "Computer Vision"],
        topic: "Sustainability",
        time: 20,
        type: "Code review",
        weeks: 4,
        people: "3 students · 2 majors",
        color: "#eeecf9",
        need: "Review our food-detection pipeline",
        mentor: "Industry mentor: Jordan · Food systems",
    },
    {
        id: 2,
        title: "Make campus easier to navigate",
        org: "Design × Engineering",
        desc: "Build an accessible campus map with designers, engineers, and students with lived experience.",
        skills: ["Design", "JavaScript"],
        topic: "Accessibility",
        time: 30,
        type: "Feedback",
        weeks: 6,
        people: "4 students · 3 majors",
        color: "#e8f2f0",
        need: "Give feedback on our navigation prototype",
        mentor: "Industry mentor: Sam · Product design",
    },
    {
        id: 3,
        title: "Small robots. Big possibilities.",
        org: "Engineering × Education",
        desc: "Create a hands-on robotics kit that makes engineering approachable for local classrooms.",
        skills: ["Robotics", "Python"],
        topic: "Education",
        time: 20,
        type: "Mentoring",
        weeks: 5,
        people: "3 students · 2 majors",
        color: "#f9efe1",
        need: "Help troubleshoot robot movement",
        mentor: "Industry mentor: Alex · Automation",
    },
    {
        id: 4,
        title: "Turn campus data into stories",
        org: "Business × Data Science",
        desc: "Make student spending data useful through clear visualizations and thoughtful research.",
        skills: ["Data Analysis", "Design"],
        topic: "Community",
        time: 15,
        type: "Feedback",
        weeks: 4,
        people: "4 students · 3 majors",
        color: "#ecf0fa",
        need: "Review our dashboard and research questions",
        mentor: "Industry mentor: Taylor · Analytics",
    },
    {
        id: 5,
        title: "A better way to find your people",
        org: "Psychology × Computer Science",
        desc: "Help first-year students discover small campus communities around shared interests.",
        skills: ["JavaScript", "Design"],
        topic: "Community",
        time: 20,
        type: "Code review",
        weeks: 6,
        people: "3 students · 3 majors",
        color: "#f5eaf1",
        need: "Review our community discovery interface",
        mentor: "Industry mentor: Casey · Software",
    },
];
const defaults = {
    onboarded: false,
    skills: ["Python", "Robotics"],
    topics: ["Sustainability", "Education"],
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
    state = { ...defaults, ...JSON.parse(localStorage.getItem("bridge-v1") || "{}") };
} catch {
    state = { ...defaults };
}
let page = "Overview",
    step = 0,
    draft = {},
    dragStart = null;
const esc = (s) =>
    String(s).replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
const save = () => localStorage.setItem("bridge-v1", JSON.stringify(state));
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
function score(p) {
    let matches = p.skills.filter((x) => state.skills.includes(x)).length;
    return Math.round(
        (40 * matches) / p.skills.length +
            25 * Math.min(1, state.minutes / p.time) +
            20 * (state.topics.includes(p.topic) ? 1 : 0) +
            15
    );
}
function feed() {
    return projects
        .filter(
            (p) =>
                !state.passed.includes(state.mode + p.id) &&
                !(state.mode === "help" ? state.offers : state.joined).includes(p.id) &&
                (state.mode !== "help" || p.time <= state.minutes)
        )
        .sort((a, b) => score(b) - score(a));
}
function rankRows(full = false) {
    let users = [
        { name: "Maya Chen", field: "Design · Senior", n: 28, initials: "MC", color: "#f7e6dc" },
        { name: "Jordan Williams", field: "Engineering · Junior", n: 21, initials: "JW", color: "#e2ede7" },
        { name: "Sam Rivera", field: "Business · Senior", n: 17, initials: "SR", color: "#e8e6f5" },
        {
            name: "Aryahi Nittur",
            field: "You · Computer Science",
            n: state.helps,
            initials: "AN",
            color: "#e9e3fc",
            you: true,
        },
    ].sort((a, b) => b.n - a.n);
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
            '</section><section class="panel below"><div class="panelhead"><h2>Your reputation, in their words</h2><button class="link" onclick="navigate(\'My profile\')">View profile ↗</button></div><div class="quote"><p>“Aryahi breaks down tricky problems without making you feel behind. She helped us get our first working prototype, and made sure we understood why it worked.”</p><div class="quoteby"><div class="avatar" style="width:29px;height:29px;font-size:10px;background:#e2ede7">JL</div><div><b>Jamie Lee</b><small>Teammate · Campus robotics project · Sample endorsement</small></div><span class="badge" style="margin-left:auto">PEER WRITTEN</span></div></div></section></div><div class="side"><section class="panel tier"><div class="label">YOUR GROWTH</div><div class="tiermark" style="margin-top:18px">✧</div><h3>' +
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
                          let p = projects.find((x) => x.id === id),
                              done = state.confirmed.includes(id);
                          return (
                              '<div class="listcard"><span class="badge">' +
                              (done
                                  ? "HELP CONFIRMED"
                                  : state.offers.includes(id)
                                    ? "HELP OFFER SENT"
                                    : "JOIN REQUEST SENT") +
                              "</span><h3>" +
                              p.title +
                              "</h3><p>" +
                              p.need +
                              " · " +
                              p.time +
                              " minutes</p><p>" +
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
            '<div class="pageheading"><div><h1>Your story, told together.</h1><p>A profile built from what others experienced working with you.</p></div><button class="outline" onclick="openOnboarding()">Edit preferences</button></div><div class="layout"><section class="panel"><div style="padding:28px"><div class="avatar" style="width:72px;height:72px;font-size:23px">AN</div><h3>Aryahi Nittur</h3><p>Computer Science · Ohio State University</p><span class="badge">' +
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
            '<div style="margin-top:25px"><button class="outline" onclick="openReview()">Demo: write as a peer</button></div></div></section><section class="panel tier"><h2>How you like to contribute</h2><p>Skills you can share</p><div class="chips">' +
            state.skills.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") +
            '</div><p>Topics you care about</p><div class="chips">' +
            state.topics.map((s) => '<span class="chip">' + esc(s) + "</span>").join("") +
            "</div><p>Up to " +
            state.minutes +
            " minutes per help session</p><p>Goal: " +
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
    let matched = p.skills.filter((x) => state.skills.includes(x));
    return (
        '<div class="feedbody" id="projectcard" style="touch-action:pan-y"><div class="projectart" style="background:' +
        p.color +
        '"><div class="artgrid"></div><div class="artshape"></div><span class="badge">' +
        (state.mode === "help" ? "A LITTLE HELP NEEDED" : "BUILD SOMETHING MEANINGFUL") +
        "</span><small>" +
        esc(p.topic.toUpperCase()) +
        '</small></div><div class="projectmeta"><span class="label">' +
        p.org +
        '</span><span class="badge">' +
        score(p) +
        "% FIT</span></div><h3>" +
        p.title +
        '</h3><p class="projectdesc">' +
        (state.mode === "help" ? p.need + ". " + p.desc : p.desc) +
        '</p><div class="chips">' +
        p.skills.map((s) => '<span class="chip">' + s + "</span>").join("") +
        '<span class="chip">' +
        (state.mode === "help" ? p.type : "Student teammate") +
        '</span></div><div class="facts"><span>◷ ' +
        (state.mode === "help" ? p.time + " min of your time" : p.weeks + " week project") +
        "</span><span>♧ " +
        p.people +
        '</span></div><p style="font-size:11px;margin:-5px 0 14px">' +
        p.mentor +
        '</p><div class="why"><b>✧ &nbsp; Why this connection?</b><br>' +
        (matched.length
            ? "Your " + matched.join(" and ") + " skills match this team’s needs."
            : "Explore a team with a different skill set.") +
        " " +
        (state.topics.includes(p.topic)
            ? "You both care about " + p.topic.toLowerCase() + "."
            : "A chance to explore " + p.topic.toLowerCase() + ".") +
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
function act(a) {
    let p = feed()[0];
    if (!p) return;
    if (a === "save") {
        if (!state.saved.includes(p.id)) {
            state.saved.push(p.id);
            toast("Saved. You can still offer help or join this project.");
        } else {
            state.saved = state.saved.filter((x) => x !== p.id);
            toast("Removed from saved projects.");
        }
    } else if (a === "pass") {
        state.passed.push(state.mode + p.id);
    } else {
        (state.mode === "help" ? state.offers : state.joined).push(p.id);
        toast(
            state.mode === "help"
                ? "Help offer sent! Follow up in My connections."
                : "Join request sent! See My connections."
        );
    }
    save();
    render();
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
    draft = {
        skills: [...state.skills],
        topics: [...state.topics],
        minutes: state.minutes,
        goal: state.goal,
    };
    step = 0;
    showOnboarding();
}
function toggleChoice(key, val) {
    draft[key] = draft[key].includes(val) ? draft[key].filter((x) => x !== val) : [...draft[key], val];
    showOnboarding();
}
function showOnboarding() {
    let title = ["What brings you to Bridge?", "What can you share?", "Make it fit your life."][step],
        desc = [
            "Find your people through projects and small acts of help.",
            "Choose skills you can help someone practice. Every major belongs here.",
            "We’ll use these preferences to personalize your project feed.",
        ][step];
    let content =
        step === 0
            ? "<label>Your goal</label>" +
              ["Join a project", "Mentor others", "Both"]
                  .map(
                      (x) =>
                          '<button class="choice ' +
                          (draft.goal === x ? "on" : "") +
                          '" onclick="draft.goal=\'' +
                          x +
                          "';showOnboarding()\">" +
                          x +
                          "</button>"
                  )
                  .join("")
            : step === 1
              ? "<label>Skills you can share · select at least one</label>" +
                [
                    "Python",
                    "JavaScript",
                    "Robotics",
                    "Computer Vision",
                    "Design",
                    "Data Analysis",
                    "Research",
                    "Business",
                ]
                    .map(
                        (x) =>
                            '<button class="choice ' +
                            (draft.skills.includes(x) ? "on" : "") +
                            "\" onclick=\"toggleChoice('skills','" +
                            x +
                            "')\">" +
                            x +
                            "</button>"
                    )
                    .join("")
              : "<label>Topics you care about · select at least one</label>" +
                ["Sustainability", "Accessibility", "Education", "Community"]
                    .map(
                        (x) =>
                            '<button class="choice ' +
                            (draft.topics.includes(x) ? "on" : "") +
                            "\" onclick=\"toggleChoice('topics','" +
                            x +
                            "')\">" +
                            x +
                            "</button>"
                    )
                    .join("") +
                '<label for="time">Time available for a help session</label><select id="time" onchange="draft.minutes=Number(this.value)">' +
                [15, 20, 30, 60]
                    .map(
                        (n) =>
                            "<option " +
                            (draft.minutes === n ? "selected" : "") +
                            ' value="' +
                            n +
                            '">' +
                            n +
                            " minutes</option>"
                    )
                    .join("") +
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
function nextStep() {
    if (step === 1 && !draft.skills.length) {
        toast("Choose at least one skill.");
        return;
    }
    if (step === 2) {
        if (!draft.topics.length) {
            toast("Choose at least one topic.");
            return;
        }
        Object.assign(state, draft, { onboarded: true });
        if (draft.goal === "Join a project") state.mode = "join";
        if (draft.goal === "Mentor others") state.mode = "help";
        save();
        closeModal();
        render();
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
        '<div class="modalback"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="close" aria-label="Close" onclick="closeModal()">×</button><div class="label">DEMO PEER VIEW</div><h2 id="modalTitle">Tell their story.</h2><p>Describe a specific way Aryahi helped you. This simulates another person writing an endorsement.</p><form onsubmit="submitReview(event)"><label for="author">Your name</label><input id="author" required maxlength="60" placeholder="e.g. Jamie Lee"><label for="review">What was it like working together?</label><textarea id="review" required minlength="15" maxlength="600" placeholder="What did they help with? What did you learn?"></textarea><div class="modalfooter"><small style="color:#999">Visible in this demo only</small><button class="primary">Add endorsement</button></div></form></section></div>';
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
render();
if (!state.onboarded) setTimeout(openOnboarding, 700);
