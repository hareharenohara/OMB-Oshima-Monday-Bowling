let announcements = [];
let announcementsLoaded = false;
let announcementUnreadChannel = null;

function initAnnouncementUnread() {
  refreshAnnouncementUnread();
  if (!supabaseClient || announcementUnreadChannel) return;
  announcementUnreadChannel = supabaseClient.channel('announcement-unread')
    .on('postgres_changes', { event:'*', schema:'public', table:'announcements' }, () => {
      announcementsLoaded = false;
      loadAnnouncements(true);
      refreshAnnouncementUnread();
    })
    .subscribe();
}

function teardownAnnouncementUnread() {
  if (announcementUnreadChannel && supabaseClient) supabaseClient.removeChannel(announcementUnreadChannel);
  announcementUnreadChannel = null;
  announcementsLoaded = false;
  setAnnouncementUnreadBadge(0);
}

async function openAnnouncements() {
  await loadAnnouncements();
  await markAnnouncementsRead();
}

async function refreshAnnouncementUnread() {
  if (!supabaseClient || !supabaseMemberId) return;
  const { data: marker } = await supabaseClient.from('notification_read_states')
    .select('last_read_at').eq('member_id', supabaseMemberId).eq('category', 'announcements').maybeSingle();
  if (!marker) {
    await markAnnouncementsRead();
    return;
  }
  const now = new Date().toISOString();
  let query = supabaseClient.from('announcements')
    .select('id', { count:'exact', head:true })
    .eq('status', 'published')
    .lte('publish_at', now)
    .gt('updated_at', marker.last_read_at)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  if (supabaseMemberId) query = query.neq('created_by', supabaseMemberId);
  const { count } = await query;
  setAnnouncementUnreadBadge(count || 0);
}

async function markAnnouncementsRead() {
  if (!supabaseClient || !supabaseMemberId) return;
  const now = new Date().toISOString();
  setAnnouncementUnreadBadge(0);
  await supabaseClient.from('notification_read_states').upsert({ member_id:supabaseMemberId, category:'announcements', last_read_at:now, updated_at:now });
}

function setAnnouncementUnreadBadge(count) {
  const badge = document.getElementById('announcement-unread-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.dataset.count = String(count || 0);
  badge.style.display = count ? 'inline-flex' : 'none';
  if (typeof updateTotalUnreadBadge === 'function') updateTotalUnreadBadge();
}

function announcementDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function announcementPriorityLabel(priority) {
  return priority === 'urgent' ? '緊急' : priority === 'important' ? '重要' : 'お知らせ';
}

function formatAnnouncementDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ja-JP', { year:'numeric', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
}

async function loadAnnouncements(force = false) {
  if (!supabaseClient || (!force && announcementsLoaded)) {
    renderAnnouncements();
    renderDashboardAnnouncement();
    return;
  }
  const list = document.getElementById('announcement-list');
  if (list) list.innerHTML = '<div class="announcement-empty">読み込み中...</div>';
  const { data, error } = await supabaseClient.from('announcements')
    .select('id,title,body,priority,status,is_pinned,publish_at,expires_at,created_at,updated_at')
    .order('is_pinned', { ascending:false }).order('publish_at', { ascending:false });
  if (error) {
    if (list) list.innerHTML = `<div class="announcement-empty">お知らせを読み込めませんでした。<br><small>${escapeHtml(error.message)}</small></div>`;
    return;
  }
  announcements = data || [];
  announcementsLoaded = true;
  renderAnnouncements();
  renderDashboardAnnouncement();
}

function visibleAnnouncements() {
  const now = Date.now();
  return announcements.filter((item) => item.status === 'published' && new Date(item.publish_at).getTime() <= now && (!item.expires_at || new Date(item.expires_at).getTime() > now));
}

function renderAnnouncements() {
  const list = document.getElementById('announcement-list');
  if (!list) return;
  const rows = isAdmin ? announcements : visibleAnnouncements();
  if (!rows.length) {
    list.innerHTML = `<div class="announcement-empty">${isAdmin ? 'まだお知らせはありません。「新規作成」から登録できます。' : '現在、お知らせはありません。'}</div>`;
    return;
  }
  list.innerHTML = rows.map((item) => {
    const priority = ['normal','important','urgent'].includes(item.priority) ? item.priority : 'normal';
    const isFuture = new Date(item.publish_at).getTime() > Date.now();
    const isExpired = item.expires_at && new Date(item.expires_at).getTime() <= Date.now();
    return `<article class="announcement-item ${priority}">
      <div class="announcement-item-head"><span class="announcement-badge ${priority}">${announcementPriorityLabel(priority)}</span>${item.is_pinned ? '<span class="announcement-pin">📌 固定</span>' : ''}${item.status === 'draft' ? '<span class="announcement-badge draft">下書き</span>' : ''}${isFuture ? '<span class="announcement-badge draft">公開予約</span>' : ''}${isExpired ? '<span class="announcement-badge draft">掲載終了</span>' : ''}<time>${formatAnnouncementDate(item.publish_at)}</time></div>
      <h3>${escapeHtml(item.title)}</h3><div class="announcement-item-body">${escapeHtml(item.body)}</div>
      ${isAdmin ? `<div class="announcement-item-actions"><button class="btn btn-secondary btn-sm" onclick="openAnnouncementEditor('${item.id}')">編集</button></div>` : ''}
    </article>`;
  }).join('');
}

function renderDashboardAnnouncement() {
  const card = document.getElementById('dashboard-announcement-card');
  const target = document.getElementById('dashboard-announcement-latest');
  if (!card || !target) return;
  if (!announcementsLoaded) {
    loadAnnouncements();
    return;
  }
  const latest = visibleAnnouncements()[0];
  card.style.display = latest ? '' : 'none';
  if (!latest) return;
  target.innerHTML = `<span><i class="announcement-badge ${escapeHtml(latest.priority)}">${announcementPriorityLabel(latest.priority)}</i>${formatAnnouncementDate(latest.publish_at)}</span><b>${escapeHtml(latest.title)}</b><em>${escapeHtml(latest.body).replace(/\n/g, ' ')}</em>`;
}

function openAnnouncementEditor(id = '') {
  if (!isAdmin) return showToast('管理者のみ操作できます。');
  const item = announcements.find((row) => row.id === id);
  document.getElementById('announcement-editor-title').textContent = item ? '📢 お知らせ編集' : '📢 お知らせ作成';
  document.getElementById('announcement-id').value = item?.id || '';
  document.getElementById('announcement-title').value = item?.title || '';
  document.getElementById('announcement-body').value = item?.body || '';
  document.getElementById('announcement-priority').value = item?.priority || 'normal';
  document.getElementById('announcement-status').value = item?.status || 'published';
  document.getElementById('announcement-publish-at').value = announcementDateTimeLocal(item?.publish_at);
  document.getElementById('announcement-expires-at').value = item?.expires_at ? announcementDateTimeLocal(item.expires_at) : '';
  document.getElementById('announcement-pinned').checked = !!item?.is_pinned;
  document.getElementById('announcement-delete-btn').style.display = item ? '' : 'none';
  showModal('modal-announcement-editor');
}

async function saveAnnouncement() {
  if (!isAdmin) return showToast('管理者のみ操作できます。');
  const id = document.getElementById('announcement-id').value;
  const title = document.getElementById('announcement-title').value.trim();
  const body = document.getElementById('announcement-body').value.trim();
  const publishLocal = document.getElementById('announcement-publish-at').value;
  const expiresLocal = document.getElementById('announcement-expires-at').value;
  if (!title || !body) return showToast('タイトルと本文を入力してください。');
  if (!publishLocal) return showToast('公開日時を入力してください。');
  const publishAt = new Date(publishLocal);
  const expiresAt = expiresLocal ? new Date(expiresLocal) : null;
  if (expiresAt && expiresAt <= publishAt) return showToast('掲載期限は公開日時より後にしてください。');
  const payload = { title, body, priority:document.getElementById('announcement-priority').value, status:document.getElementById('announcement-status').value, is_pinned:document.getElementById('announcement-pinned').checked, publish_at:publishAt.toISOString(), expires_at:expiresAt ? expiresAt.toISOString() : null, updated_at:new Date().toISOString() };
  const wasPublished = id ? announcements.find((row) => row.id === id)?.status === 'published' : false;
  document.getElementById('announcement-save-btn').disabled = true;
  const query = id ? supabaseClient.from('announcements').update(payload).eq('id', id) : supabaseClient.from('announcements').insert({ ...payload, created_by:supabaseMemberId });
  const { error } = await query;
  document.getElementById('announcement-save-btn').disabled = false;
  if (error) return showToast('保存に失敗しました: ' + error.message);
  closeModal('modal-announcement-editor');
  showToast(id ? 'お知らせを更新しました。' : 'お知らせを作成しました。');
  announcementsLoaded = false;
  await loadAnnouncements(true);
  if (payload.status === 'published' && !wasPublished && publishAt <= new Date()) notifyAnnouncementPublished(title, body);
}

async function deleteAnnouncement() {
  const id = document.getElementById('announcement-id').value;
  if (!isAdmin || !id || !confirm('このお知らせを削除しますか？')) return;
  const { error } = await supabaseClient.from('announcements').delete().eq('id', id);
  if (error) return showToast('削除に失敗しました: ' + error.message);
  closeModal('modal-announcement-editor');
  showToast('お知らせを削除しました。');
  announcementsLoaded = false;
  loadAnnouncements(true);
}

async function notifyAnnouncementPublished(title, body) {
  try {
    await supabaseClient.functions.invoke('send-request-notification', { body:{ audience:'all', eventType:'announcement-published', title, body } });
  } catch (error) {
    console.warn('お知らせ通知の送信に失敗しました:', error);
  }
}
