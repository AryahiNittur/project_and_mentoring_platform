'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STUDENT_ID = Number(new URLSearchParams(location.search).get('student') || 1);
const KEY = `bridge-team-aws-${STUDENT_ID}`;
let student, projects = [], members = [], deck = [], deckId;
let history = {passed_ids: [], liked_ids: []};
let team = {project: null, slots: [], kept: [], round: 0, seen: []};
let page = 'overview', busy = false, dirty = false, toastTimer;
let motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let pendingSwipe = null, scores = new Map(), savedIds = [], demoRun = false;

async function api(path, method = 'GET', body) {
    const response = await fetch(path, {method, headers: {'Content-Type': 'application/json'},
        ...(body === undefined ? {} : {body: JSON.stringify(body)})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `${path}: HTTP ${response.status}`);
    return data;
}
function notify(message) {
    $('#toast').textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').textContent = '', 5000);
}
function checkpoint() {
    try { localStorage.setItem(KEY, JSON.stringify({team, dirty, pendingSwipe, requestEvent, introDismissed, savedIds})); }
    catch { notify('Browser storage is unavailable. Use Save team draft before leaving.'); }
}
function setPage(next) { if (busy || !student) return; page = next; render(); }
function score(person, project) {
    const value = BridgeMatch.scoreProject(person, project);
    if (!Number.isFinite(value)) throw new Error(`Invalid matching score for project ${project.id}. Check its ranking fields.`);
    return Math.max(0, Math.min(100, Math.round(value)));
}
function projectById(id) { return projects.find(p => p.id === id); }
function initials(name) { return String(name || '?').split(/\s+/).map(s => s[0]).slice(0, 2).join(''); }
function tags(values) { return (values || []).map(t => `<span class="tag">${esc(t)}</span>`).join(''); }
function fire() {
    if (!motion) return;
    const overlay = document.createElement('div');
    overlay.className = 'fire'; overlay.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 120; i++) {
        const bit = document.createElement('span'); bit.textContent = '🔥';
        bit.style.cssText = `left:${(i % 12) * 9}%;top:${Math.floor(i / 12) * 11}%;animation-delay:${Math.random() * .15}s`;
        overlay.appendChild(bit);
    }
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1300);
}
function safeVideo(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function projectCard(p, canChoose = true) {
    return `<article class="project" data-project="${p.id}">
        <div class="projectart"><div class="orb" aria-hidden="true">✳</div><span class="badge">${scores.get(p.id)}% recommendation</span></div>
        <div class="projectbody"><div class="eyebrow">${esc(p.org || 'Community project')}</div>
        <h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><div class="tags">${tags(p.languages)}${tags(p.interests)}</div>
        <button class="saveproject" aria-pressed="${savedIds.includes(p.id)}" onclick="saveProject(${p.id})">${savedIds.includes(p.id) ? '★ Saved' : '☆ Save project'}</button>
        <div class="facts">${esc(p.hours_per_week)} hrs/week · ${esc(p.weeks)} weeks · ${esc(p.spots)} project openings</div>
        <p class="reason">${esc(BridgeMatch.reasonFor(student, p))}</p>
        ${safeVideo(p.video) ? `<p class="projectvideo"><a href="${esc(safeVideo(p.video))}" target="_blank" rel="noopener noreferrer">Watch project video ↗</a></p>` : ''}
        ${p.mentor ? `<p>Mentor: ${esc(p.mentor)}</p>` : ''}
        ${canChoose ? `<div class="actions"><button onclick="swipeProject(${p.id},'pass')" ${busy ? 'disabled' : ''}>← Pass</button><button class="primary" onclick="swipeProject(${p.id},'like')" ${busy ? 'disabled' : ''}>Choose project →</button></div>` : ''}</div></article>`;
}
function render() {
    document.querySelectorAll('[data-page]').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
        el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false');
        el.disabled = busy;
    });
    const resetButton = $('#resetDemo');
    if (resetButton) resetButton.disabled = busy;
    $('#profile').textContent = `${student.name} · ${student.major} · ${student.hours_per_week} hrs/week`;
    $('#saveStatus').textContent = dirty ? 'Team draft has unsaved changes' : 'Live community workspace';
    if (page === 'overview') renderOverview();
    else if (page === 'leaderboard') renderLeaderboard();
    else if (page === 'profile') renderProfile();
    else if (page === 'connections') renderConnections();
    else if (page === 'giveback') renderGiveBack();
    else if (page === 'connect') renderConnect();
    else if (page === 'discover') {
        const p = deck[0]?.project;
        $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">STEP 01 / FIND YOUR MISSION</div><h1>One project.<br><em>Endless possibilities.</em></h1><p>Choose a project, then assemble four potential teammates.</p></div><span class="counter">${deck.length} projects left</span></div>
        ${p ? `<div class="single">${projectCard(p)}</div><p class="hint">Drag left to pass · right to choose</p>` : `<div class="empty"><h2>You're through this deck.</h2><p>Revisit a liked project to build its team.</p><button onclick="setPage('workspace')">Open workspace</button></div>`}`;
        bindSwipe();
    } else if (page === 'team') renderTeam();
    else renderWorkspace();
}
function renderTeam() {
    const p = projectById(team.project);
    if (!p) { $('#view').innerHTML = `<div class="empty"><h1>Start with a project.</h1><p>Select your mission before finding your crew.</p><button class="primary" onclick="setPage('discover')">Discover projects →</button></div>`; return; }
    const complete = team.kept.length === 4;
    $('#view').innerHTML = `<div class="mission"><div><div class="eyebrow">YOUR SELECTED PROJECT</div><h2>${esc(p.title)}</h2><p>${esc(p.org)} · ${esc(p.hours_per_week)} hrs/week</p></div><button onclick="setPage('discover')" ${busy ? 'disabled' : ''}>Change project</button></div>
    <div class="sectionheading"><div><div class="eyebrow">STEP 02 / FIND YOUR PEOPLE</div><h1>${complete ? 'Your dream team.' : 'Keep your favorites.'}</h1><p>Click to keep. Press <kbd>Space</kbd> to refresh everyone else.</p></div><span class="counter">${team.kept.length}/4 kept · Round ${team.round + 1}</span></div>
    <div class="people">${team.slots.map(id => {
        const m = members.find(m => m.id === id), kept = team.kept.includes(id);
        return `<article class="person ${kept ? 'kept' : ''}"><button class="personpick" data-pick="${id}" aria-pressed="${kept}" onclick="togglePerson(${id})" ${busy ? 'disabled' : ''}>
            <div class="personmeta"><span>${score(m, p)}% project fit</span><b>${kept ? '✓ KEPT' : '＋ KEEP'}</b></div><div class="avatar color${id % 4}">${esc(initials(m.name))}</div>
            <h2>${esc(m.name)}</h2><p>${esc(m.major)} · ${esc(m.year)}</p><div class="tags">${tags(m.languages)}</div><p>${esc(m.bio || `Interested in ${(m.interests || []).join(', ')}.`)}</p>
            <div class="personfacts">${esc(m.hours_per_week)} hrs/week<br>Wants to learn: ${esc((m.learn || []).join(', ') || 'Not specified')}</div><strong>${kept ? 'Locked in · Click to release' : 'Click to keep on your team'}</strong></button></article>`;
    }).join('')}</div>
    ${team.slots.length < 4 ? '<p class="hint">Fewer than four eligible students are available in your database.</p>' : ''}
    <div class="teamactions"><p>Kept teammates stay in their slots.</p><div class="actions"><button onclick="refreshPeople()" ${busy || complete ? 'disabled' : ''}>🔥 Refresh <kbd>Space</kbd></button><button class="primary" onclick="saveTeam()" ${busy ? 'disabled' : ''}>${busy ? 'Working…' : complete ? 'Continue to connection requests →' : 'Save team draft'}</button></div></div>
    <p class="hint">Four potential collaborators, separate from the project's actual openings. Saving a draft does not send invitations or reserve spots.</p>`;
}
function saveProject(id) { savedIds = savedIds.includes(id) ? savedIds.filter(x=>x!==id) : [...savedIds,id]; checkpoint(); render(); }
function renderWorkspace() {
    const liked = [...new Set([...history.liked_ids,...savedIds])].map(projectById).filter(Boolean);
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">YOUR WORKSPACE</div><h1>Your next chapter.</h1><p>Your chosen and saved projects, ready for the next step.</p></div></div>
    ${team.project ? '<button class="primary" onclick="setPage(\'team\')">Resume team builder →</button>' : ''}
    <div class="workspace">${liked.map(p => `<section>${projectCard(p, false)}<button class="primary wide" onclick="selectProject(${p.id})" ${busy ? 'disabled' : ''}>Build this team →</button></section>`).join('') || '<div class="empty">No liked projects yet.</div>'}</div>`;
}
function chooseSlots(pool, current, kept, seen = []) {
    return BridgeTeam.nextSlots(pool.map(m => m.id), current, kept, seen);
}
function memberPool() {
    const p = projectById(team.project);
    return [...members].sort((a, b) => score(b, p) - score(a, p) || a.id - b.id);
}
function selectProject(id, confirmed = false) {
    if (busy) return;
    if (requestEvent && requestEvent.project_id !== id) { notify('Confirm your pending connection requests before switching teams.'); return; }
    if (team.project !== id) {
        if (!confirmed && dirty && !confirm('Switch projects and discard this unsaved team draft?')) return;
        team = {project: id, slots: [], kept: [], round: 0, seen: []};
        team.slots = memberPool().slice(0, 4).map(m => m.id); team.seen = [...team.slots]; dirty = true; checkpoint();
    }
    page = 'team'; render();
}
function togglePerson(id) {
    if (requestEvent) { notify('Confirm your pending connection requests before editing the team.'); return; }
    if (busy || !team.slots.includes(id)) return;
    team.kept = team.kept.includes(id) ? team.kept.filter(x => x !== id) : [...team.kept, id];
    dirty = true; if(team.kept.length===4) page='connect'; checkpoint(); render();
    // Keep keyboard focus, so Space works immediately after clicking a card.
    $(`[data-pick="${id}"]`)?.focus({preventScroll: true});
}
async function refreshPeople() {
    if (requestEvent) { notify('Confirm your pending connection requests before refreshing the team.'); return; }
    if (busy || !team.project || team.kept.length === 4) return;
    const pool = memberPool();
    const eligible = pool.filter(m => !team.kept.includes(m.id) && !team.slots.includes(m.id));
    if (eligible.length && eligible.every(m => team.seen.includes(m.id))) team.seen = [...team.slots];
    const next = chooseSlots(pool, team.slots, team.kept, team.seen);
    if (next.join() === team.slots.join()) { notify('No fresh students are available. All eligible database profiles are already on screen.'); return; }
    busy = true; render(); fire();
    await new Promise(resolve => setTimeout(resolve, motion ? 420 : 0));
    team.slots = next; team.seen = [...new Set([...team.seen, ...next])]; team.round++; dirty = true; busy = false; checkpoint(); render();
    $('#view').focus({preventScroll: true});
}
async function saveTeam() {
    if (busy || !team.project) return;
    busy = true; render();
    try {
        await api(`/api/students/${STUDENT_ID}/team`, 'PUT', {project_id: team.project, slots: team.slots, kept: team.kept, round: team.round, seen: team.seen});
        dirty = false; checkpoint(); if(team.kept.length===4)page='connect'; notify('Team draft saved.');
    } catch (error) { notify(error.message); }
    finally { busy = false; render(); }
}
async function swipeProject(id, action) {
    if (busy || !scores.has(id)) return;
    if (pendingSwipe && (pendingSwipe.project_id !== id || pendingSwipe.action !== action)) {
        notify('Retry the previous project action first so its result is confirmed.'); return;
    }
    if (action === 'like' && team.project !== id && dirty && !confirm('Choose this project and discard your unsaved team draft?')) return;
    pendingSwipe ||= {event_id: crypto.randomUUID(), deck_id: deckId, student_id: STUDENT_ID, project_id: id, action, score: scores.get(id)};
    checkpoint(); busy = true; render();
    try {
        await api('/api/swipes', 'POST', pendingSwipe);
        history.passed_ids = history.passed_ids.filter(x => x !== id);
        history.liked_ids = history.liked_ids.filter(x => x !== id);
        history[action === 'like' ? 'liked_ids' : 'passed_ids'].push(id);
        deck = deck.filter(row => row.project.id !== id);
        pendingSwipe = null; checkpoint();
        const card = $('.single .project');
        if (motion && card) await card.animate(action === 'like' ? [
            {transform: 'scale(1)', opacity: 1}, {transform: 'rotate(20deg) scale(.1)', filter: 'blur(16px)', opacity: 0}
        ] : [{transform: 'translateX(0)', opacity: 1}, {transform: 'translateX(-100vw) rotate(-30deg)', opacity: 0}], {duration: 450, fill: 'forwards'}).finished.catch(() => {});
        if (action === 'pass') fire();
        busy = false;
        if (action === 'like') selectProject(id, true);
        else render();
    } catch (error) { busy = false; render(); notify(`${error.message} Retry the same action.`); }
}
function bindSwipe() {
    const card = $('.single .project'); if (!card) return;
    let start = null;
    card.onpointerdown = e => { if (busy || e.target.closest('button,a')) return; start = e.clientX; card.setPointerCapture(e.pointerId); };
    card.onpointermove = e => { if (start !== null) card.style.transform = `translateX(${e.clientX - start}px) rotate(${(e.clientX - start) / 24}deg)`; };
    card.onpointerup = e => { if (start === null) return; const distance = e.clientX - start; start = null; card.style.transform = ''; if (Math.abs(distance) > 90) swipeProject(Number(card.dataset.project), distance > 0 ? 'like' : 'pass'); };
    card.onpointercancel = () => { start = null; card.style.transform = ''; };
}
async function buildDeck() {
    scores = new Map(projects.map(p => [p.id, score(student, p)]));
    // Ranker receives data only. It never calls DynamoDB.
    const profile = {...student, skills: student.languages, topics: student.interests, passed: history.passed_ids, joined: [], mode: 'join'};
    deck = BridgeMatch.deckFromState(profile, projects).map(row => ({project: row.project, score: scores.get(row.project.id)}))
        .filter(row => row.project.spots > 0 && !history.passed_ids.includes(row.project.id));
    deckId = crypto.randomUUID();
    await api('/api/decks', 'POST', {deck_id: deckId, student_id: STUDENT_ID, matches: deck.map(row => ({project_id: row.project.id, score: row.score}))});
}
function clearLocalDemo() {
    try { localStorage.removeItem(KEY); }
    catch { try { localStorage.setItem(KEY, '{}'); } catch {} }
}
async function resetDemo() {
    if (busy) return;
    await initializeDashboard({fresh: true});
}
async function initializeDashboard(options = {}) {
    const fresh = Boolean(options.fresh) || new URLSearchParams(location.search).get('demo') === '1';
    busy = true;
    demoRun = fresh;
    $('#view').setAttribute('aria-busy', 'true');
    $('#view').innerHTML = `<div class="empty"><h2>${fresh ? 'Resetting the demo…' : 'Loading your workspace…'}</h2></div>`;
    try {
        if (!globalThis.BridgeMatch?.scoreProject || !globalThis.BridgeMatch?.deckFromState) throw new Error('Load your existing matching/rank.js before app.js.');
        if (!Number.isSafeInteger(STUDENT_ID) || STUDENT_ID <= 0) throw new Error('Invalid student ID. Use ?student=1.');
        if (fresh) {
            clearLocalDemo();
            await api(`/api/students/${STUDENT_ID}/demo-reset`, 'POST', {});
            const params = new URLSearchParams(location.search);
            if (params.has('demo') && globalThis.history?.replaceState) {
                params.delete('demo');
                const query = params.toString();
                globalThis.history.replaceState(null, '', `${location.pathname || '/'}${query ? `?${query}` : ''}`);
            }
        }
        let cached = {};
        if (!fresh) try { const value = JSON.parse(localStorage.getItem(KEY) || '{}'); if (value && typeof value === 'object') cached = value; } catch {}
        [student, projects, members, history] = await Promise.all([
            api(`/api/students/${STUDENT_ID}`), api('/api/projects'), api('/api/students'), api(`/api/students/${STUDENT_ID}/history`)
        ]);
        for (const field of ['id', 'languages', 'interests', 'learn', 'experience', 'hours_per_week']) if (student[field] === undefined) throw new Error(`Student is missing ${field}. Import the updated student JSON.`);
        if (![projects, members].every(Array.isArray)) throw new Error('Expected student and project arrays.');
        projects.forEach(p => p.id = Number(p.id)); members.forEach(m => m.id = Number(m.id));
        members = members.filter(m => m.id !== STUDENT_ID && m.name && Array.isArray(m.languages) && Array.isArray(m.interests) && Array.isArray(m.learn) && Number.isFinite(Number(m.experience)) && BridgeMatch.parseHours(m.hours_per_week) > 0);
        await buildDeck();
        // Finish an uncertain prior swipe with its original event/deck IDs.
        if (cached.pendingSwipe) {
            await api('/api/swipes', 'POST', cached.pendingSwipe);
            const old = cached.pendingSwipe;
            history.passed_ids = history.passed_ids.filter(id => id !== old.project_id);
            history.liked_ids = history.liked_ids.filter(id => id !== old.project_id);
            history[old.action === 'like' ? 'liked_ids' : 'passed_ids'].push(old.project_id);
            deck = deck.filter(row => row.project.id !== old.project_id);
        }
        const draft = cached.dirty ? cached.team : student.dream_team_draft ? {project: student.dream_team_draft.project_id, ...student.dream_team_draft} : null;
        if (draft && projectById(Number(draft.project))) {
            const available = new Set(members.map(m => m.id));
            team = {project: Number(draft.project), slots: [...new Set(draft.slots || [])].filter(id => available.has(id)).slice(0, 4), kept: [...new Set(draft.kept || [])], round: Number(draft.round || 0), seen: Array.isArray(draft.seen) ? draft.seen : []};
            team.kept = team.kept.filter(id => team.slots.includes(id));
            dirty = Boolean(cached.dirty); page = 'team';
        }
        savedIds = Array.isArray(cached.savedIds) ? cached.savedIds.filter(id=>projectById(id)) : [];
        requestEvent = cached.requestEvent || null; introDismissed = Boolean(cached.introDismissed);
        if (fresh) {
            team = {project: null, slots: [], kept: [], round: 0, seen: []};
            dirty = false;
            pendingSwipe = null;
            requestEvent = null;
            introDismissed = false;
            savedIds = [];
            page = 'overview';
        }
        community = await api('/api/community');
        if(requestEvent && team.kept.length===4)page='connect';
        pendingSwipe = null; busy = false; checkpoint(); render(); $('#view').setAttribute('aria-busy', 'false');
        if(!student.survey_completed&&!introDismissed){
            openSurvey();
            if (fresh) notify('Demo reset. Your answers are filled in — continue to see your matches.');
        }
    } catch (error) {
        busy = false;
        $('#view').innerHTML = `<div class="empty"><h2>Could not load the workspace</h2><p>${esc(error.message)}</p><button onclick="initializeDashboard()">Retry</button></div>`;
        $('#view').setAttribute('aria-busy', 'false');
        console.error(error);
    }
}
document.querySelectorAll('[data-page]').forEach(el => el.onclick = () => setPage(el.dataset.page));
document.body.classList.toggle('still', !motion);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if($('#overlay').innerHTML)closeModal(); return; }
    if ($('#overlay').innerHTML) {
        if(e.key==='Tab') {const items=[...$('.modal').querySelectorAll('button,input,select,textarea,a')].filter(el=>!el.disabled), first=items[0], last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
        return;
    }
    if (e.code !== 'Space' || e.repeat || page !== 'team' || !team.project || e.target.closest('input,textarea,select,a,[contenteditable]')) return;
    if (e.target.closest('button') && !e.target.closest('.personpick')) return;
    e.preventDefault(); refreshPeople();
});
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
initializeDashboard();
