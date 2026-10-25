const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const BridgeMatch = require('./matching/rank.js');
const BridgeTeam = require('./team.js');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function start({failSwipe = false, failLoad = false, remoteDraft} = {}) {
    const calls = [], listeners = {}, elements = new Map(), cache = new Map();
    const element = selector => {
        if (!elements.has(selector)) elements.set(selector, {innerHTML: '', textContent: '',
            classList: {toggle() {}}, setAttribute() {}, focus() {}, dataset: {},
            closest() { return null; }});
        return elements.get(selector);
    };
    const people = Array.from({length: 13}, (_, i) => ({id: i + 1, name: `Database Person ${i+1}`,
        languages: ['Python'], interests: ['Robotics'], learn: ['Robotics'], experience: 3,
        hours_per_week: i === 12 ? '8+' : 6, major: 'Engineering', year: 'Junior'}));
    const projects = [1,2].map(id => ({id, title: `Database Project ${id}`, org: 'Honda',
        description: 'A database description', languages: ['Python'], interests: ['Robotics'],
        learn_outcomes: ['Robotics'], target_experience: 3, hours_per_week: 6, weeks: 4, spots: 4}));
    const context = {BridgeMatch, BridgeTeam, console: {error() {}}, URL, URLSearchParams,
        location: {search: '?student=1'}, crypto: webcrypto, matchMedia: () => ({matches: true}),
        localStorage: {getItem: k => cache.get(k) || null, setItem: (k,v) => cache.set(k,v)},
        confirm: () => true, setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
        document: {querySelector: element, querySelectorAll: () => [],
            body: {classList: {toggle() {}}}, addEventListener: (event, fn) => listeners[event] = fn},
        window: {addEventListener() {}},
        fetch: async (path, options) => {
            const body = options.body ? JSON.parse(options.body) : undefined;
            calls.push({path, body, method: options.method});
            if (failLoad && path === '/api/projects') return {ok: false, status: 503, json: async () => ({detail: 'AWS unavailable'})};
            if (path === '/api/swipes' && failSwipe) return {ok: false, status: 503, json: async () => ({detail: 'AWS unavailable'})};
            let value = {saved: true};
            if (path === '/api/students/1') value = {...people[0], ...(remoteDraft ? {dream_team_draft: remoteDraft} : {})};
            if (path === '/api/students') value = people;
            if (path === '/api/projects') value = projects;
            if (path.endsWith('/history')) value = {passed_ids: [], liked_ids: []};
            return {ok: true, json: async () => value};
        }};
    vm.createContext(context); vm.runInContext(source, context); await tick();
    return {context, calls, listeners, element, run: text => vm.runInContext(text, context), allowSwipe: () => failSwipe = false};
}

test('loads database profiles and one project, saves deck, and excludes the current student', async () => {
    const app = await start();
    assert.equal(app.run('members.length'), 12);
    assert.equal(app.run('members.some(m => m.id === STUDENT_ID)'), false);
    assert.equal(app.run('members.some(m => m.hours_per_week === "8+")'), true);
    assert.equal((app.element('#view').innerHTML.match(/<article class="project"/g) || []).length, 1);
    assert.ok(app.element('#view').innerHTML.includes('Database Project 1'));
    assert.equal(app.calls.find(c => c.path === '/api/decks').body.matches.length, 2);
    assert.equal(app.calls.filter(c => c.path === '/api/swipes').length, 0);
});

test('choose a project, keep multiple people, use Space to refresh, and save the draft', async () => {
    const app = await start();
    await app.context.swipeProject(1, 'like');
    assert.equal(app.run('page'), 'team');
    assert.equal(app.run('team.slots.length'), 4);
    const slots = JSON.parse(app.run('JSON.stringify(team.slots)'));
    app.context.togglePerson(slots[1]); app.context.togglePerson(slots[3]);
    let prevented = false;
    app.listeners.keydown({code: 'Space', repeat: false, target: {closest: () => null}, preventDefault() {prevented = true;}});
    await tick();
    assert.equal(prevented, true);
    assert.equal(app.run('team.slots[1]'), slots[1]);
    assert.equal(app.run('team.slots[3]'), slots[3]);
    assert.notEqual(app.run('team.slots[0]'), slots[0]);
    await app.context.saveTeam();
    const saved = app.calls.find(c => c.path.endsWith('/team'));
    assert.deepEqual(saved.body.kept, [slots[1], slots[3]]);
    assert.equal(app.run('dirty'), false);
});

test('refresh walks through the full candidate pool before recycling', async () => {
    const app = await start();
    app.context.selectProject(1);
    const seen = new Set(JSON.parse(app.run('JSON.stringify(team.slots)')));
    for (let i = 0; i < 2; i++) {
        await app.context.refreshPeople();
        JSON.parse(app.run('JSON.stringify(team.slots)')).forEach(id => seen.add(id));
    }
    assert.equal(seen.size, 12);
});

test('a failed swipe stays on the same card and retries the original event', async () => {
    const app = await start({failSwipe: true});
    await app.context.swipeProject(1, 'pass');
    assert.equal(app.run('deck[0].project.id'), 1);
    const first = app.calls.find(c => c.path === '/api/swipes').body;
    app.allowSwipe(); await app.context.swipeProject(1, 'pass');
    const retry = app.calls.filter(c => c.path === '/api/swipes')[1].body;
    assert.equal(first.event_id, retry.event_id);
    assert.equal(app.run('deck[0].project.id'), 2);
});

test('restores the saved AWS team and does not refresh while typing', async () => {
    const app = await start({remoteDraft: {project_id: 1, slots: [2,3,4,5], kept: [2,4], round: 3, seen: [2,3,4,5]}});
    assert.equal(app.run('page'), 'team');
    assert.equal(app.run('team.kept.join()'), '2,4');
    app.listeners.keydown({code: 'Space', repeat: false, target: {closest: () => ({})}, preventDefault() {throw Error('space in input was intercepted');}});
    assert.equal(app.run('team.round'), 3);
});

test('an AWS read failure shows an error instead of sample projects', async () => {
    const app = await start({failLoad: true});
    assert.match(app.element('#view').innerHTML, /AWS unavailable/);
    assert.equal(app.calls.filter(c => c.path === '/api/decks').length, 0);
});
