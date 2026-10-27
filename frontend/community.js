// Community pages, survey, and connection review. Data access stays in the API layer.
let community = [], surveyDraft = null, surveyStep = 0, introDismissed = false;
let requestEvent = null, reviewEvent = null;
function helps(person = student) {
    return Object.values(person.help_offers || {}).filter(offer => offer.status === 'confirmed').length;
}
function tier(count = helps()) {
    return count >= 25 ? 'Community Champion' : count >= 10 ? 'Connector' : count >= 3 ? 'Contributor' : 'New Neighbor';
}
function communityRows() {
    return [...community].sort((a,b) => b.helps-a.helps || a.name.localeCompare(b.name));
}
function leaderboardRows(limit = 1000) {
    return communityRows().slice(0,limit).map((member,index) => `<div class="rankrow ${member.id === STUDENT_ID ? 'yourow' : ''}"><span class="ranknumber">${index+1}</span><div class="avatar color${member.id%4}">${esc(initials(member.name))}</div><div><b>${esc(member.name)}${member.id === STUDENT_ID ? ' · You' : ''}</b><small>${esc(member.major)} · ${esc(member.year)}</small></div><strong>${member.helps}<small>helps</small></strong></div>`).join('');
}
function growthPanel() {
    const count = helps();
    return `<section class="panel growth"><div class="eyebrow">YOUR GROWTH</div><span class="growthstar">✧</span><h2>${tier()}</h2><p>You’re turning what you know into someone else’s next step.</p><progress max="25" value="${Math.min(25,count)}" aria-label="Progress to Community Champion"></progress><p>${count} confirmed helps · 25 to Champion</p><button onclick="setPage('leaderboard')">Explore the tiers →</button></section>`;
}
function renderOverview() {
    const count = helps(), standing = communityRows().findIndex(member => member.id === STUDENT_ID)+1;
    const requests = Object.values(student.connection_requests || {}).concat(Object.values(student.connection_inbox || {}));
    const p = deck[0]?.project;
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">YOUR COMMUNITY WORKSPACE</div><h1>Good things start together.</h1><p>Find your next project. Share what you know. Make a difference.</p></div><button onclick="openSurvey()">Your preferences</button></div>
    <div class="stats"><section class="panel"><small>Peers helped</small><strong>${count}</strong><p>Completed contributions</p></section><section class="panel"><small>Your community tier</small><strong class="tiername">${tier()}</strong><p>Every contribution counts</p></section><section class="panel"><small>Active connections</small><strong>${requests.filter(r => r.status === 'accepted').length}</strong><p>Building something together</p></section><section class="panel"><small>Community standing</small><strong>${standing ? '#'+standing : '—'}</strong><p>Among ${community.length} members</p></section></div>
    <div class="communitylayout"><div><section class="panel"><div class="panelheading"><h2>Your next connection</h2><button onclick="setPage('discover')">Explore projects ↗</button></div>${p ? projectCard(p) : '<p>Your next connection is waiting in My connections.</p>'}</section><section class="panel contribution"><div class="eyebrow">EVERY CONTRIBUTION COUNTS</div><h2>A little help. A big difference.</h2><p>A code review. A fresh perspective. Twenty minutes can be someone’s breakthrough.</p><button class="primary" onclick="setPage('giveback')">Give back →</button></section><section class="panel"><div class="panelheading"><h2>Your reputation, in their words</h2><button onclick="setPage('profile')">View profile ↗</button></div>${endorsementsHtml()}</section></div><div>${growthPanel()}<section class="panel"><div class="panelheading"><h2>Community builders</h2><button onclick="setPage('leaderboard')">View all</button></div>${leaderboardRows(4)}</section></div></div>
    <p class="hint">Demo teammate confirmations and endorsements are labeled where they appear. Offers and requests never earn contribution credit.</p>`;
}
function renderLeaderboard() {
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">COMMUNITY LEADERBOARD</div><h1>Small acts. Lasting impact.</h1><p>Celebrating the people who help our community grow.</p></div></div><div class="communitylayout"><section class="panel">${leaderboardRows()}<p class="hint">Participation counts, including labeled demo confirmations. Counts do not measure someone’s ability or worth.</p></section><div>${growthPanel()}<section class="panel"><h2>How helps count</h2><p>One completed request, confirmed by the receiving teammate, counts as one help. Sending an offer or a connection request never earns a help.</p><p>The demo confirmation button simulates the receiving teammate; it is not verified peer activity.</p></section></div></div><div class="tiergrid">${[['○','New Neighbor','0–2'],['✦','Contributor','3–9'],['✧','Connector','10–24'],['♛','Community Champion','25+']].map(([icon,name,range])=>`<section class="panel"><span class="growthstar">${icon}</span><h2>${name}</h2><p>${range} helps</p></section>`).join('')}</div>`;
}
function endorsementsHtml() {
    const reviews = Object.values(student.endorsements || {});
    return reviews.length ? reviews.map(r => `<blockquote><p>“${esc(r.text)}”</p><small>${esc(r.author)} · ${r.demo ? 'Demo peer endorsement' : 'Peer endorsement'}</small></blockquote>`).join('') : '<p>Your story grows through the people you help. Peer endorsements will appear here.</p>';
}
function renderProfile() {
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">MY PROFILE</div><h1>Your story, told together.</h1><p>A profile built from what others experience working with you.</p></div><button onclick="openSurvey()">Edit preferences</button></div><div class="communitylayout"><section class="panel"><div class="avatar color1">${esc(initials(student.name))}</div><h2>${esc(student.name)}</h2><p>${esc(student.major)} · ${esc(student.year)} · Ohio State</p><p>${esc(student.email)}</p><span class="tag">${tier()}</span><span class="tag">${helps()} confirmed helps</span><h2>What peers say</h2>${endorsementsHtml()}<button onclick="openReview()">Demo: write as a peer</button></section><section class="panel"><h2>How you like to contribute</h2><p>Experience ${student.experience} · ${esc(student.hours_per_week)} hours/week</p><h3>Languages</h3><div class="tags">${tags(student.languages)}</div><h3>Interests</h3><div class="tags">${tags(student.interests)}</div><h3>Wants to learn</h3><div class="tags">${tags(student.learn)}</div><p>Goal: ${esc(student.goal || 'Both')}</p><p>Learning goal: ${esc(student.learning_goal || 'Learn new tech')}</p><p>Work preference: ${esc(student.work_preference || 'Flexible')}</p><p>Personality: ${esc(student.personality_type || 'Balanced')}</p><p>Communication: ${esc(student.communication_preference || 'Weekly syncs')}</p></section></div>`;
}
function renderGiveBack() {
    const offers = student.help_offers || {};
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">GIVE BACK</div><h1>Someone could use your perspective.</h1><p>Offer a code review, feedback, or a fresh set of eyes. An offer starts a conversation; it isn’t a completed help.</p></div></div><div class="workspace">${projects.map(p => `<section class="panel"><div class="eyebrow">${esc(p.org)}</div><h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><div class="tags">${tags(p.languages)}</div><button class="primary" onclick="offerHelp(${p.id})" ${busy || offers[p.id] ? 'disabled' : ''}>${offers[p.id] ? 'Help offered ✓' : 'Offer your skills →'}</button></section>`).join('')}</div>`;
}
function requestRows(records, incoming) {
    return Object.values(records || {}).map(r => `<section class="panel"><span class="tag">${esc(r.status.toUpperCase())}</span><h2>${esc(incoming ? r.from_name : r.to_name)}</h2><p>${esc(r.project_title)}</p><blockquote>${esc(r.message)}</blockquote>${incoming && r.status === 'pending' ? `<div class="actions"><button class="primary" onclick="replyRequest('${esc(r.id)}',${r.from_id},'accepted')">Accept</button><button onclick="replyRequest('${esc(r.id)}',${r.from_id},'declined')">Decline</button></div>` : ''}</section>`).join('');
}
function renderConnections() {
    const offers = Object.values(student.help_offers || {});
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">MY CONNECTIONS</div><h1>Make a connection count.</h1><p>Follow through on your offers and build something together.</p></div></div><h2>Incoming requests</h2><div class="workspace">${requestRows(student.connection_inbox,true) || '<p>No incoming requests yet.</p>'}</div><h2>Sent requests</h2><div class="workspace">${requestRows(student.connection_requests,false) || '<p>No requests sent yet. Build your team to get started.</p>'}</div><h2>Your projects & help offers</h2><div class="workspace">${offers.map(o => `<section class="panel"><span class="tag">${o.status === 'confirmed' ? 'HELP CONFIRMED · DEMO' : 'HELP OFFERED'}</span><h2>${esc(o.title)}</h2><p>${o.status === 'confirmed' ? 'Teammate confirmation simulated. Your tier and leaderboard include this demo contribution.' : 'Follow up with the team. When help is complete, the receiving teammate can confirm it.'}</p>${o.status !== 'confirmed' ? `<button onclick="confirmHelp(${o.project_id})">Demo: teammate confirms completed help</button>` : ''}</section>`).join('') || '<p>Offer your skills in Give back.</p>'}</div>`;
}
function renderConnect() {
    const p = projectById(team.project);
    if (!p || team.kept.length !== 4) { page='team'; renderTeam(); return; }
    $('#view').innerHTML = `<div class="sectionheading"><div><div class="eyebrow">STEP 03 / MAKE IT HAPPEN</div><h1>Your crew. Your next move.</h1><p>You’ve picked your dream team. Introduce yourself and invite them to build together.</p></div><button onclick="setPage('team')">Edit team</button></div><section class="panel"><div class="eyebrow">${esc(p.org)}</div><h2>${esc(p.title)}</h2><div class="chosencrew">${team.kept.map(id => {const m=members.find(m=>m.id===id);return `<div><div class="avatar color${id%4}">${esc(initials(m.name))}</div><b>${esc(m.name)}</b><p>${esc(m.major)}</p></div>`}).join('')}</div><form onsubmit="sendTeamRequests(event)"><label for="connectionMessage">Your connection request</label><textarea id="connectionMessage" maxlength="1000" required rows="4">${esc(requestEvent?.message || `Hi! I’m ${student.name}. I’m putting together a team for “${p.title}” and thought your skills would be a great addition. Would you like to connect and explore it together?`)}</textarea><p class="hint">Requests appear in each selected member’s Bridge inbox. They can accept or decline; no spots are reserved.</p><div class="actions"><button type="button" onclick="setPage('team')">← Back to team</button><button class="primary" ${busy ? 'disabled' : ''}>Send connection requests →</button></div></form></section>`;
}
async function reloadCommunity() {
    [student, community] = await Promise.all([api(`/api/students/${STUDENT_ID}`),api('/api/community')]);
}
async function offerHelp(projectId) {
    if (busy) return; busy=true;
    try { await api(`/api/students/${STUDENT_ID}/help-offers`,'POST',{project_id:projectId}); await reloadCommunity(); page='connections'; notify('Help offer recorded. Follow up in My connections.'); }
    catch(error){notify(error.message)} finally{busy=false;render()}
}
async function confirmHelp(projectId) {
    if (busy) return;busy=true;
    try {await api(`/api/students/${STUDENT_ID}/help-offers/${projectId}/demo-confirm`,'POST',{});await reloadCommunity();notify('Teammate confirmation simulated. +1 demo confirmed help.');}
    catch(error){notify(error.message)}finally{busy=false;render()}
}
async function replyRequest(id,senderId,decision) {
    if (busy) return;busy=true;
    try{await api(`/api/students/${STUDENT_ID}/connection-requests/${encodeURIComponent(id)}`,'PUT',{sender_id:senderId,decision});await reloadCommunity();notify(`Connection request ${decision}.`)}
    catch(error){notify(error.message)}finally{busy=false;render()}
}
async function sendTeamRequests(event) {
    event.preventDefault();if(busy)return;
    const message=$('#connectionMessage').value.trim();if(!message){notify('Write a short introduction first.');return}
    if(requestEvent && requestEvent.message!==message){notify('Retry the original request first to confirm its result.');return}
    requestEvent ||= {event_id:crypto.randomUUID(),project_id:team.project,member_ids:[...team.kept],message};checkpoint();busy=true;render();
    try{
        await api(`/api/students/${STUDENT_ID}/team`,'PUT',{project_id:team.project,slots:team.slots,kept:team.kept,round:team.round,seen:team.seen});
        await api(`/api/students/${STUDENT_ID}/connection-requests`,'POST',requestEvent);
        await reloadCommunity();dirty=false;requestEvent=null;checkpoint();page='connections';notify('Connection requests sent to your team’s Bridge inboxes.');
    }catch(error){notify(error.message+' Retry to confirm the same request.')}finally{busy=false;render()}
}
function modal(content) {
    const overlay=$('#overlay');overlay.innerHTML=`<div class="modalback"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="modalclose" aria-label="Close dialog" onclick="closeModal()">×</button>${content}</section></div>`;
    document.body.style.overflow='hidden';$('.modalclose')?.focus();
}
function closeModal(){introDismissed=true;checkpoint();$('#overlay').innerHTML='';document.body.style.overflow='';}
function openSurvey(){if(busy)return;surveyStep=0;surveyDraft={goal:student.goal||'Both',major:student.major||'',year:student.year||'Junior',experience:student.experience,work_preference:student.work_preference||'Flexible',personality_type:student.personality_type||'Balanced',learning_goal:student.learning_goal||'Learn new tech',communication_preference:student.communication_preference||'Weekly syncs',languages:[...student.languages],interests:[...student.interests],learn:[...student.learn],hours_per_week:student.hours_per_week};paintSurvey()}
function surveyChoice(key,value){surveyDraft[key]=surveyDraft[key].includes(value)?surveyDraft[key].filter(x=>x!==value):[...surveyDraft[key],value];paintSurvey()}
function choices(key,options){return options.map(value=>`<button type="button" class="choice ${surveyDraft[key].includes(value)?'on':''}" aria-pressed="${surveyDraft[key].includes(value)}" onclick="surveyChoice('${key}','${esc(value)}')">${esc(value)}</button>`).join('')}
function surveySelect(id,values,current){const all=[...new Set([current,...values])];return `<select id="${id}" onchange="surveyDraft.${id}=this.value">${all.map(value=>`<option value="${esc(value)}" ${String(value)===String(current)?'selected':''}>${esc(value)}</option>`).join('')}</select>`}
function paintSurvey(){
 const titles=['What brings you to Bridge?','What can you share?','Make it fit your life.'];
 const demoNote=demoRun?'<p>Your answers are filled in. Continue to see your ranked matches.</p>':'';
 const content=surveyStep===0?`${demoNote}<label>Your goal</label><div class="choices">${['Join a project','Mentor others','Both'].map(goal=>`<button type="button" class="choice ${surveyDraft.goal===goal?'on':''}" onclick="surveyDraft.goal='${goal}';paintSurvey()">${goal}</button>`).join('')}</div><label>What do you want to achieve?</label><div class="choices">${['Build portfolio','Learn new tech','Meet people','Make impact'].map(lg=>`<button type="button" class="choice ${surveyDraft.learning_goal===lg?'on':''}" onclick="surveyDraft.learning_goal='${lg}';paintSurvey()">${lg}</button>`).join('')}</div><label for="major">Major</label>${surveySelect('major',['Computer Science and Engineering','Mechanical Engineering','Design','Business','Data Science','Public Health'],surveyDraft.major)}<label for="year">Year</label>${surveySelect('year',['Freshman','Sophomore','Junior','Senior','Graduate'],surveyDraft.year)}<label for="experience">Experience</label>${surveySelect('experience',[1,2,3,4,5],surveyDraft.experience)}<p>${BridgeMatch.EXPERIENCE_LEVELS.map(l=>`${l.level}: ${esc(l.label)}`).join(' · ')}</p><label>Work preference</label><div class="choices">${['Prefer working alone','Flexible','Prefer working in groups'].map(pref=>`<button type="button" class="choice ${surveyDraft.work_preference===pref?'on':''}" onclick="surveyDraft.work_preference='${pref}';paintSurvey()">${pref}</button>`).join('')}</div><label>Personality type</label><div class="choices">${['Introverted','Balanced','Extroverted'].map(type=>`<button type="button" class="choice ${surveyDraft.personality_type===type?'on':''}" onclick="surveyDraft.personality_type='${type}';paintSurvey()">${type}</button>`).join('')}</div>`:surveyStep===1?`<label>Languages · select at least one</label><div class="choices">${choices('languages',BridgeMatch.LANGUAGES)}</div>`:`<label>Interests · select at least one</label><div class="choices">${choices('interests',BridgeMatch.INTERESTS)}</div><label>What you want to learn</label><div class="choices">${choices('learn',BridgeMatch.INTERESTS)}</div><label for="hours_per_week">Hours per week</label>${surveySelect('hours_per_week',BridgeMatch.HOUR_OPTIONS,surveyDraft.hours_per_week)}<label>How do you prefer to stay in touch?</label><div class="choices">${['Frequent check-ins','Weekly syncs','Async updates','Independent work'].map(cp=>`<button type="button" class="choice ${surveyDraft.communication_preference===cp?'on':''}" onclick="surveyDraft.communication_preference='${cp}';paintSurvey()">${cp}</button>`).join('')}</div>`;
 modal(`<div class="eyebrow">GET CONNECTED · STEP ${surveyStep+1} OF 3</div><h2 id="modalTitle">${titles[surveyStep]}</h2><progress max="3" value="${surveyStep+1}" aria-label="Survey progress"></progress>${content}<div class="actions"><button onclick="${surveyStep?'surveyStep--;paintSurvey()':'closeModal()'}">${surveyStep?'← Back':'Explore first'}</button><button class="primary" onclick="nextSurveyStep()" ${busy?'disabled':''}>${surveyStep===2?'Find my connections →':'Continue →'}</button></div>`);
}
async function nextSurveyStep(){
 if(busy)return;
 if(surveyStep===1&&!surveyDraft.languages.length){notify('Choose at least one language.');return}
 if(surveyStep<2){surveyStep++;paintSurvey();return}
 if(!surveyDraft.interests.length){notify('Choose at least one interest.');return}
 busy=true;paintSurvey();
 try{
    const body={...surveyDraft,experience:Number(surveyDraft.experience),hours_per_week:surveyDraft.hours_per_week==='8+'?'8+':Number(surveyDraft.hours_per_week)};
    student=await api(`/api/students/${STUDENT_ID}`,'PUT',body);await buildDeck();closeModal();page=(demoRun || student.goal !== 'Mentor others')?'discover':'giveback';notify('Your preferences are saved. Your personalized feed is ready.');
 }catch(error){notify(error.message)}finally{busy=false;render();if($('#overlay').innerHTML)paintSurvey()}
}
function openReview(){reviewEvent=null;modal(`<div class="eyebrow">DEMO PEER VIEW</div><h2 id="modalTitle">Tell their story.</h2><p>Simulate a teammate writing an endorsement for ${esc(student.name)}.</p><form onsubmit="submitReview(event)"><label for="reviewAuthor">Your name</label><input id="reviewAuthor" required maxlength="60"><label for="reviewText">What was it like working together?</label><textarea id="reviewText" required minlength="15" maxlength="600" rows="4"></textarea><div class="actions"><small>Saved as a demo peer endorsement.</small><button class="primary">Add endorsement</button></div></form>`)}
async function submitReview(event){event.preventDefault();if(busy)return;reviewEvent||={event_id:crypto.randomUUID(),author:$('#reviewAuthor').value.trim(),text:$('#reviewText').value.trim()};busy=true;try{await api(`/api/students/${STUDENT_ID}/endorsements`,'POST',reviewEvent);await reloadCommunity();closeModal();notify('Demo peer endorsement added.')}catch(error){notify(error.message)}finally{busy=false;render()}}

// Project commenting system
async function loadComments(projectId){
    try{
        const data=await api(`/api/projects/${projectId}/comments`);
        projectComments.set(projectId,data);
        return data;
    }catch(error){
        notify('Could not load comments.');
        return {comments:[],count:0};
    }
}
async function openComments(projectId){
    if(busy)return;
    const project=projectById(projectId);
    if(!project)return;
    busy=true;
    const data=await loadComments(projectId);
    busy=false;
    paintComments(projectId,project,data);
}
function paintComments(projectId,project,data){
    const comments=data.comments||[];
    const commentsHtml=comments.length?comments.map(c=>{
        const canDelete=c.student_id===STUDENT_ID;
        const timeAgo=formatTimeAgo(c.created_at);
        return `<div class="comment" data-comment-id="${esc(c.comment_id)}"><div class="commentheader"><strong>${esc(c.student_name)}</strong><small>${timeAgo}</small>${canDelete?`<button onclick="deleteComment(${projectId},'${esc(c.comment_id)}')" class="deletecomment" aria-label="Delete comment">×</button>`:''}</div><p>${esc(c.text)}</p></div>`;
    }).join(''):'<p class="hint">No comments yet. Be the first to share your thoughts!</p>';
    modal(`<div class="eyebrow">PROJECT DISCUSSION</div><h2 id="modalTitle">${esc(project.title)}</h2><p>${comments.length} comment${comments.length!==1?'s':''}</p><div class="commentslist" style="max-height:300px;overflow-y:auto;margin:16px 0;">${commentsHtml}</div><form onsubmit="submitComment(event,${projectId})"><label for="commentText">Add your comment</label><textarea id="commentText" required minlength="1" maxlength="500" rows="3" placeholder="Ask a question, share insights, or discuss this project..."></textarea><div class="actions"><button type="button" onclick="closeModal()">Close</button><button class="primary" ${busy?'disabled':''}>Post comment</button></div></form>`);
}
async function submitComment(event,projectId){
    event.preventDefault();
    if(busy)return;
    const text=$('#commentText').value.trim();
    if(!text)return;
    busy=true;
    try{
        await api(`/api/projects/${projectId}/comments?student_id=${STUDENT_ID}`,'POST',{comment_id:crypto.randomUUID(),text});
        const data=await loadComments(projectId);
        const project=projectById(projectId);
        notify('Comment posted!');
        paintComments(projectId,project,data);
        render();
    }catch(error){
        notify(error.message);
    }finally{
        busy=false;
    }
}
async function deleteComment(projectId,commentId){
    if(busy||!confirm('Delete this comment?'))return;
    busy=true;
    try{
        await api(`/api/projects/${projectId}/comments/${commentId}?student_id=${STUDENT_ID}`,'DELETE');
        const data=await loadComments(projectId);
        const project=projectById(projectId);
        notify('Comment deleted.');
        paintComments(projectId,project,data);
        render();
    }catch(error){
        notify(error.message);
    }finally{
        busy=false;
    }
}
function formatTimeAgo(timestamp){
    try{
        const date=new Date(timestamp);
        const now=new Date();
        const seconds=Math.floor((now-date)/1000);
        if(seconds<60)return 'just now';
        const minutes=Math.floor(seconds/60);
        if(minutes<60)return `${minutes}m ago`;
        const hours=Math.floor(minutes/60);
        if(hours<24)return `${hours}h ago`;
        const days=Math.floor(hours/24);
        if(days<7)return `${days}d ago`;
        return date.toLocaleDateString();
    }catch{
        return '';
    }
}
