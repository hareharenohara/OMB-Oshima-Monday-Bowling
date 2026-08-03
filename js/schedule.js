let scheduleEvents = [];
let schedulesLoaded = false;
let scheduleFilter = 'upcoming';

function scheduleDateTimeLocal(value, fallbackHours = 19) {
  const date = value ? new Date(value) : new Date();
  if (!value) {
    date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
    date.setHours(fallbackHours, 0, 0, 0);
  }
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scheduleHorizon() {
  const max = new Date();
  max.setMonth(max.getMonth() + 2);
  max.setHours(23, 59, 59, 999);
  return max;
}

function scheduleTypeLabel(type) {
  return ({ bowling:'🎳 ボウリング', tournament:'🏆 大会', social:'🍻 イベント', other:'📌 その他' })[type] || '📌 予定';
}

function formatScheduleTime(value) {
  return new Intl.DateTimeFormat('ja-JP', { hour:'2-digit', minute:'2-digit' }).format(new Date(value));
}

function formatScheduleFull(value) {
  return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'numeric', day:'numeric', weekday:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
}

async function loadSchedules(force = false) {
  if (!supabaseClient || (!force && schedulesLoaded)) {
    renderSchedules();
    renderDashboardSchedule();
    return;
  }
  const list = document.getElementById('schedule-list');
  if (list) list.innerHTML = '<div class="announcement-empty">読み込み中...</div>';
  try {
    const { error: ensureError } = await supabaseClient.functions.invoke('ensure-monday-meetings');
    if (ensureError) console.warn('月曜会の自動補充に失敗しました:', ensureError.message);
  } catch (error) {
    console.warn('月曜会の自動補充に失敗しました:', error);
  }
  const { data, error } = await supabaseClient.from('schedule_events')
    .select('id,title,event_type,recurrence_key,starts_at,ends_at,location,details,response_deadline,status,created_at,updated_at,schedule_responses(member_id,response,updated_at,members(name))')
    .order('starts_at', { ascending:true });
  if (error) {
    if (list) list.innerHTML = `<div class="announcement-empty">予定を読み込めませんでした。<br><small>${escapeHtml(error.message)}</small></div>`;
    return;
  }
  scheduleEvents = data || [];
  schedulesLoaded = true;
  renderSchedules();
  renderDashboardSchedule();
}

function setScheduleFilter(filter) {
  scheduleFilter = filter;
  document.getElementById('schedule-filter-upcoming')?.classList.toggle('active', filter === 'upcoming');
  document.getElementById('schedule-filter-past')?.classList.toggle('active', filter === 'past');
  renderSchedules();
}

function scheduleMemberName(response) {
  return response.members?.name || appData.members?.find((member) => member.id === response.member_id)?.name || '不明';
}

function renderScheduleMemberGroup(event, response, label) {
  const members = (event.schedule_responses || []).filter((row) => row.response === response);
  return `<div class="attendance-group ${response}"><b><span>${label}</span><span>${members.length}名</span></b><div class="schedule-member-chips">${members.length ? members.map((row) => `<span>${response === 'attending' ? '●' : response === 'absent' ? '×' : '△'} ${escapeHtml(scheduleMemberName(row))}</span>`).join('') : '<span>なし</span>'}</div></div>`;
}

function renderUnansweredMembers(event) {
  const answered = new Set((event.schedule_responses || []).map((row) => row.member_id));
  const members = (appData.members || []).filter((member) => !answered.has(member.id));
  return `<div class="attendance-group unanswered"><b><span>未回答</span><span>${members.length}名</span></b><div class="schedule-member-chips">${members.length ? members.map((member) => `<span>— ${escapeHtml(member.name)}</span>`).join('') : '<span>なし</span>'}</div></div>`;
}

function renderSchedules() {
  const list = document.getElementById('schedule-list');
  if (!list) return;
  const now = Date.now();
  let rows = scheduleEvents.filter((event) => scheduleFilter === 'upcoming' ? new Date(event.starts_at).getTime() >= now : new Date(event.starts_at).getTime() < now);
  if (scheduleFilter === 'past') rows = rows.slice().reverse();
  if (!rows.length) {
    list.innerHTML = `<div class="announcement-empty">${scheduleFilter === 'upcoming' ? '今後の予定はまだ登録されていません。' : '過去の予定はありません。'}</div>`;
    return;
  }
  list.innerHTML = rows.map((event) => {
    const date = new Date(event.starts_at);
    const responses = event.schedule_responses || [];
    const mine = responses.find((row) => row.member_id === supabaseMemberId);
    const deadlineClosed = event.response_deadline && new Date(event.response_deadline).getTime() < now;
    const canRespond = event.status === 'scheduled' && !deadlineClosed && new Date(event.starts_at).getTime() >= now;
    const dateHtml = `<div class="schedule-date-box"><small>${date.getFullYear()}/${date.getMonth()+1}/</small><b>${date.getDate()}</b><em>（${new Intl.DateTimeFormat('ja-JP',{weekday:'short'}).format(date)}）</em></div>`;
    const metaHtml = `<div class="schedule-meta"><span>🕒 ${formatScheduleTime(event.starts_at)}${event.ends_at ? `～${formatScheduleTime(event.ends_at)}` : ''}</span>${event.location ? `<span>📍 ${escapeHtml(event.location)}</span>` : ''}${event.response_deadline ? `<span>⏳ 回答期限 ${formatScheduleFull(event.response_deadline)}</span>` : ''}</div>`;
    const headingHtml = event.recurrence_key
      ? `<div class="schedule-item-top">${dateHtml}<div class="schedule-main">${event.status === 'cancelled' ? '<div class="schedule-main-head"><span class="announcement-badge urgent">中止</span></div>' : ''}${metaHtml}</div></div>`
      : `<div class="schedule-event-heading">${dateHtml}<div class="schedule-event-badges"><span class="announcement-badge">${scheduleTypeLabel(event.event_type)}</span>${event.status === 'cancelled' ? '<span class="announcement-badge urgent">中止</span>' : ''}</div></div><h3 class="schedule-event-title">${escapeHtml(event.title)}</h3>${metaHtml}`;
    return `<article class="schedule-item ${event.recurrence_key ? 'recurring' : `special-event event-${event.event_type}`} ${event.status === 'cancelled' ? 'cancelled' : ''}" data-event-id="${event.id}">
      ${headingHtml}
      ${event.details ? `<div class="schedule-details">${escapeHtml(event.details)}</div>` : ''}
      ${canRespond ? `<div class="schedule-response"><div class="schedule-response-buttons"><button class="${mine?.response === 'attending' ? 'active attending' : ''}" onclick="setScheduleResponse('${event.id}','attending')">✅ 参加</button><button class="${mine?.response === 'absent' ? 'active absent' : ''}" onclick="setScheduleResponse('${event.id}','absent')">❌ 不参加</button><button class="${mine?.response === 'maybe' ? 'active maybe' : ''}" onclick="setScheduleResponse('${event.id}','maybe')">❓ 未定</button></div></div>` : event.status === 'cancelled' ? '<div class="schedule-deadline-closed">この予定は中止になりました。</div>' : deadlineClosed ? '<div class="schedule-deadline-closed">出欠の回答期限を過ぎています。</div>' : ''}
      <div class="schedule-members">${renderScheduleMemberGroup(event,'attending','参加')}${renderScheduleMemberGroup(event,'absent','不参加')}${renderScheduleMemberGroup(event,'maybe','未定')}${renderUnansweredMembers(event)}</div>
      ${isAdmin ? `<div class="schedule-admin-actions"><button class="btn btn-secondary btn-sm" onclick="openScheduleEditor('${event.id}')">編集</button></div>` : ''}
    </article>`;
  }).join('');
}

async function setScheduleResponse(eventId, response) {
  const card = document.querySelector(`.schedule-item[data-event-id="${eventId}"]`);
  card?.classList.add('saving');
  const { error } = await supabaseClient.from('schedule_responses').upsert({ event_id:eventId, member_id:supabaseMemberId, response, updated_at:new Date().toISOString() }, { onConflict:'event_id,member_id' });
  card?.classList.remove('saving');
  if (error) return showToast('出欠の保存に失敗しました: ' + error.message);
  const event = scheduleEvents.find((row) => row.id === eventId);
  if (event) {
    const member = appData.members?.find((row) => row.id === supabaseMemberId);
    const existing = (event.schedule_responses || []).find((row) => row.member_id === supabaseMemberId);
    if (existing) Object.assign(existing, { response, updated_at:new Date().toISOString() });
    else {
      if (!event.schedule_responses) event.schedule_responses = [];
      event.schedule_responses.push({ member_id:supabaseMemberId, response, updated_at:new Date().toISOString(), members:{ name:member?.name || '' } });
    }
  }
  const scrollTop = window.scrollY;
  renderSchedules();
  requestAnimationFrame(() => window.scrollTo(0, scrollTop));
  renderDashboardSchedule();
  showToast('出欠を更新しました。');
}

function openScheduleEditor(id = '') {
  if (!isAdmin) return showToast('管理者のみ操作できます。');
  const event = scheduleEvents.find((row) => row.id === id);
  document.getElementById('schedule-editor-title').textContent = event ? '📅 予定編集' : '📅 予定作成';
  document.getElementById('schedule-id').value = event?.id || '';
  document.getElementById('schedule-title').value = event?.title || '';
  document.getElementById('schedule-type').value = event?.event_type || 'bowling';
  document.getElementById('schedule-status').value = event?.status || 'scheduled';
  const startsInput = document.getElementById('schedule-starts-at');
  startsInput.value = scheduleDateTimeLocal(event?.starts_at);
  startsInput.min = scheduleDateTimeLocal(new Date());
  startsInput.max = scheduleDateTimeLocal(scheduleHorizon());
  document.getElementById('schedule-ends-at').value = event?.ends_at ? scheduleDateTimeLocal(event.ends_at) : '';
  document.getElementById('schedule-location').value = event?.location || '';
  document.getElementById('schedule-details').value = event?.details || '';
  document.getElementById('schedule-deadline').value = event?.response_deadline ? scheduleDateTimeLocal(event.response_deadline) : '';
  document.getElementById('schedule-delete-btn').style.display = event ? '' : 'none';
  showModal('modal-schedule-editor');
}

async function saveSchedule() {
  if (!isAdmin) return showToast('管理者のみ操作できます。');
  const id = document.getElementById('schedule-id').value;
  const oldEvent = scheduleEvents.find((row) => row.id === id);
  const title = document.getElementById('schedule-title').value.trim();
  const startsLocal = document.getElementById('schedule-starts-at').value;
  const endsLocal = document.getElementById('schedule-ends-at').value;
  const deadlineLocal = document.getElementById('schedule-deadline').value;
  if (!title || !startsLocal) return showToast('タイトルと開始日時を入力してください。');
  const startsAt = new Date(startsLocal);
  const endsAt = endsLocal ? new Date(endsLocal) : null;
  const deadline = deadlineLocal ? new Date(deadlineLocal) : null;
  if (endsAt && endsAt <= startsAt) return showToast('終了日時は開始日時より後にしてください。');
  if (!id && startsAt < new Date()) return showToast('過去の日時は新規登録できません。');
  if (startsAt > scheduleHorizon()) return showToast('今日から2か月先までの日付を選んでください。');
  if (deadline && deadline > startsAt) return showToast('回答期限は開始日時より前にしてください。');
  const payload = { title, event_type:document.getElementById('schedule-type').value, starts_at:startsAt.toISOString(), ends_at:endsAt?.toISOString() || null, location:document.getElementById('schedule-location').value.trim(), details:document.getElementById('schedule-details').value.trim(), response_deadline:deadline?.toISOString() || null, status:document.getElementById('schedule-status').value, updated_at:new Date().toISOString() };
  document.getElementById('schedule-save-btn').disabled = true;
  const query = id ? supabaseClient.from('schedule_events').update(payload).eq('id', id) : supabaseClient.from('schedule_events').insert({ ...payload, created_by:supabaseMemberId });
  const { error } = await query;
  document.getElementById('schedule-save-btn').disabled = false;
  if (error) return showToast('予定の保存に失敗しました: ' + error.message);
  closeModal('modal-schedule-editor');
  showToast(id ? '予定を更新しました。' : '予定を作成しました。');
  schedulesLoaded = false;
  await loadSchedules(true);
  const eventType = payload.status === 'cancelled' && oldEvent?.status !== 'cancelled' ? 'schedule-cancelled' : id ? 'schedule-updated' : 'schedule-created';
  notifyScheduleEvent(eventType, title, startsAt, payload.location);
}

async function deleteSchedule() {
  const id = document.getElementById('schedule-id').value;
  if (!isAdmin || !id || !confirm('この予定とすべての出欠回答を削除しますか？')) return;
  const { error } = await supabaseClient.from('schedule_events').delete().eq('id', id);
  if (error) return showToast('予定の削除に失敗しました: ' + error.message);
  closeModal('modal-schedule-editor');
  showToast('予定を削除しました。');
  schedulesLoaded = false;
  loadSchedules(true);
}

async function notifyScheduleEvent(eventType, title, startsAt, location) {
  const defaultTitle = eventType === 'schedule-cancelled' ? `中止: ${title}` : title;
  const body = `${formatScheduleFull(startsAt)}${location ? ` / ${location}` : ''}`;
  try { await supabaseClient.functions.invoke('send-request-notification', { body:{ audience:'all', eventType, title:defaultTitle, body } }); }
  catch (error) { console.warn('予定通知の送信に失敗しました:', error); }
}

function renderDashboardSchedule() {
  const card = document.getElementById('dashboard-schedule-card');
  const target = document.getElementById('dashboard-schedule-next');
  if (!card || !target) return;
  if (!schedulesLoaded) { loadSchedules(); return; }
  const next = scheduleEvents.find((event) => event.status === 'scheduled' && new Date(event.starts_at).getTime() >= Date.now());
  card.style.display = next ? '' : 'none';
  if (!next) return;
  const mine = (next.schedule_responses || []).find((row) => row.member_id === supabaseMemberId);
  const answer = mine ? ({attending:'参加',absent:'不参加',maybe:'未定'})[mine.response] : '未回答';
  const responses = next.schedule_responses || [];
  const total = Math.max(appData.members?.length || 0, responses.length, 1);
  const counts = { attending:0, absent:0, maybe:0 };
  responses.forEach((row) => { if (counts[row.response] !== undefined) counts[row.response]++; });
  const unanswered = Math.max(0, total - responses.length);
  const segments = [
    ['attending', '参加', counts.attending],
    ['absent', '不参加', counts.absent],
    ['maybe', '未定', counts.maybe],
    ['unanswered', '未回答', unanswered]
  ];
  target.innerHTML = `<div class="dashboard-schedule-summary"><span class="dashboard-schedule-next-date">${new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short'}).format(new Date(next.starts_at))}</span><span>${next.recurrence_key ? '' : `<b>${escapeHtml(next.title)}</b>`}<em>${formatScheduleTime(next.starts_at)}${next.location ? ` / ${escapeHtml(next.location)}` : ''} ・ あなた: ${answer}</em></span></div><div class="dashboard-attendance-bar" aria-label="出欠状況">${segments.map(([key,label,count]) => `<i class="${key}" style="width:${count / total * 100}%" title="${label} ${count}名"></i>`).join('')}</div><div class="dashboard-attendance-legend">${segments.map(([key,label,count]) => `<span class="${key}"><i></i>${label}<b>${count}</b></span>`).join('')}</div>`;
}
