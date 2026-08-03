/* ---------------------------------------------------------
   全体チャット
   --------------------------------------------------------- */
let groupChatMessages = [];
let groupChatChannel = null;
let groupChatLoading = false;
let groupChatHasMore = true;
let dashboardChatMessages = [];
let dashboardChatLoadedAt = 0;
let dashboardChatLoading = false;

function isGroupChatOpen() {
  const tab = document.getElementById('tab-chat');
  return !!tab && tab.style.display !== 'none';
}

function getChatMember(memberId, joinedMember) {
  return joinedMember || appData.members.find(member => member.id === memberId) || {};
}

function chatMessageMarkup(message) {
  const member = getChatMember(message.member_id, message.members);
  const mine = message.member_id === supabaseMemberId;
  const canDelete = mine || isAdmin;
  const createdAt = new Date(message.created_at);
  const time = createdAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const dateTime = createdAt.toLocaleString('ja-JP');
  const avatarFallback = String(member.name || '?').slice(0, 1);
  return `<article class="chat-message ${mine ? 'mine' : ''}" data-message-id="${message.id}">
    <div class="chat-avatar">${avatarInnerHtml(member.avatar, avatarFallback)}</div>
    <div class="chat-message-main">
      <div class="chat-message-meta"><b>${escapeHtml(member.name || 'メンバー')}</b><time datetime="${escapeHtml(message.created_at)}" title="${escapeHtml(dateTime)}">${time}</time>${canDelete ? `<button class="chat-delete" onclick="deleteGroupMessage('${message.id}')" aria-label="メッセージを削除">削除</button>` : ''}</div>
      <div class="chat-bubble">${escapeHtml(message.body).replace(/\n/g, '<br>')}</div>
    </div>
  </article>`;
}

function renderGroupChat(options = {}) {
  const list = document.getElementById('chat-message-list');
  if (!list) return;
  if (!groupChatMessages.length) {
    list.innerHTML = '<div class="chat-empty">まだメッセージはありません。最初のメッセージを送ってみましょう。</div>';
  } else {
    list.innerHTML = groupChatMessages.map(chatMessageMarkup).join('');
  }
  const more = document.getElementById('chat-load-more');
  if (more) more.style.display = groupChatHasMore && groupChatMessages.length ? 'block' : 'none';
  if (options.scrollToBottom) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

async function renderDashboardChat(force = false) {
  const container = document.getElementById('dashboard-chat-latest');
  if (!container || !supabaseClient || !supabaseMemberId || dashboardChatLoading) return;
  if (!force && dashboardChatLoadedAt && Date.now() - dashboardChatLoadedAt < 30000) {
    paintDashboardChat(container);
    return;
  }
  dashboardChatLoading = true;
  const { data, error } = await supabaseClient.from('group_messages')
    .select('id,member_id,body,created_at,members(name,avatar)')
    .order('created_at', { ascending: false })
    .limit(3);
  dashboardChatLoading = false;
  if (error) {
    container.innerHTML = '<span class="dashboard-chat-empty">チャットを読み込めませんでした</span>';
    return;
  }
  dashboardChatMessages = data || [];
  dashboardChatLoadedAt = Date.now();
  paintDashboardChat(container);
}

function paintDashboardChat(container) {
  if (!dashboardChatMessages.length) {
    container.innerHTML = '<span class="dashboard-chat-empty">まだメッセージはありません<br><em>チャットを始める ›</em></span>';
    return;
  }
  container.innerHTML = dashboardChatMessages.map(message => {
    const member = getChatMember(message.member_id, message.members);
    const time = new Date(message.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fallback = String(member.name || '?').slice(0, 1);
    return `<span class="dashboard-chat-row">
      <i class="dashboard-chat-avatar">${avatarInnerHtml(member.avatar, fallback)}</i>
      <span class="dashboard-chat-copy"><span><b>${escapeHtml(member.name || 'メンバー')}</b><time>${escapeHtml(time)}</time></span><em>${escapeHtml(message.body).replace(/\s+/g, ' ')}</em></span>
    </span>`;
  }).join('');
}

async function loadGroupChat(reset = true) {
  if (!supabaseClient || !supabaseMemberId || groupChatLoading) return;
  groupChatLoading = true;
  const list = document.getElementById('chat-message-list');
  const previousHeight = list?.scrollHeight || 0;
  let query = supabaseClient.from('group_messages')
    .select('id,member_id,body,created_at,members(name,avatar)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (!reset && groupChatMessages.length) query = query.lt('created_at', groupChatMessages[0].created_at);
  const { data, error } = await query;
  groupChatLoading = false;
  if (error) {
    showToast(`チャットを読み込めませんでした: ${error.message}`);
    return;
  }
  const page = (data || []).reverse();
  groupChatHasMore = page.length === 50;
  groupChatMessages = reset ? page : [...page, ...groupChatMessages];
  renderGroupChat({ scrollToBottom: reset });
  if (!reset && list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight - previousHeight; });
}

async function openGroupChat() {
  initGroupChatRealtime();
  await loadGroupChat(true);
  await markGroupChatRead();
  setTimeout(() => document.getElementById('chat-message-input')?.focus(), 80);
}

function initGroupChat() {
  initGroupChatRealtime();
  refreshChatUnreadBadge();
}

function initGroupChatRealtime() {
  if (!supabaseClient || !supabaseMemberId || groupChatChannel) return;
  groupChatChannel = supabaseClient.channel('group-chat-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, payload => receiveGroupMessage(payload.new.id))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, payload => {
      groupChatMessages = groupChatMessages.filter(message => message.id !== payload.old.id);
      if (isGroupChatOpen()) renderGroupChat();
      renderDashboardChat(true);
    })
    .subscribe();
}

function teardownGroupChat() {
  if (groupChatChannel && supabaseClient) supabaseClient.removeChannel(groupChatChannel);
  groupChatChannel = null;
  groupChatMessages = [];
  dashboardChatMessages = [];
  dashboardChatLoadedAt = 0;
}

async function receiveGroupMessage(messageId) {
  if (groupChatMessages.some(message => message.id === messageId)) return;
  const list = document.getElementById('chat-message-list');
  const nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 100;
  const { data, error } = await supabaseClient.from('group_messages')
    .select('id,member_id,body,created_at,members(name,avatar)')
    .eq('id', messageId)
    .single();
  if (error || !data) return;
  groupChatMessages.push(data);
  groupChatMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (isGroupChatOpen()) {
    renderGroupChat({ scrollToBottom: nearBottom });
    await markGroupChatRead();
    if (!nearBottom) document.getElementById('chat-new-message').style.display = 'block';
  } else {
    refreshChatUnreadBadge();
  }
  renderDashboardChat(true);
}

async function sendGroupMessage(event) {
  event?.preventDefault();
  const input = document.getElementById('chat-message-input');
  const button = document.getElementById('chat-send-btn');
  const body = input.value.trim();
  if (!body || !supabaseMemberId) return;
  button.disabled = true;
  const { data, error } = await supabaseClient.from('group_messages')
    .insert({ member_id: supabaseMemberId, body })
    .select('id,member_id,body,created_at,members(name,avatar)')
    .single();
  button.disabled = false;
  if (error) {
    showToast(`送信できませんでした: ${error.message}`);
    return;
  }
  input.value = '';
  autoResizeChatInput(input);
  if (!groupChatMessages.some(message => message.id === data.id)) groupChatMessages.push(data);
  renderGroupChat({ scrollToBottom: true });
  renderDashboardChat(true);
  await markGroupChatRead();
  notifyGroupChatMessage(data.id);
}

async function deleteGroupMessage(messageId) {
  const message = groupChatMessages.find(item => item.id === messageId);
  if (!message || (message.member_id !== supabaseMemberId && !isAdmin)) return;
  if (!confirm('このメッセージを削除しますか？')) return;
  const { error } = await supabaseClient.from('group_messages').delete().eq('id', messageId);
  if (error) {
    showToast(`削除できませんでした: ${error.message}`);
    return;
  }
  groupChatMessages = groupChatMessages.filter(item => item.id !== messageId);
  renderGroupChat();
  renderDashboardChat(true);
}

async function refreshChatUnreadBadge() {
  if (!supabaseClient || !supabaseMemberId) return;
  const { data: marker } = await supabaseClient.from('group_chat_reads')
    .select('last_read_at').eq('member_id', supabaseMemberId).maybeSingle();
  if (!marker) {
    await markGroupChatRead();
    return;
  }
  const { count } = await supabaseClient.from('group_messages')
    .select('id', { count: 'exact', head: true })
    .gt('created_at', marker.last_read_at)
    .neq('member_id', supabaseMemberId);
  setChatUnreadBadge(count || 0);
}

function setChatUnreadBadge(count) {
  const badge = document.getElementById('chat-unread-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.dataset.count = String(count || 0);
  badge.style.display = count ? 'inline-flex' : 'none';
  if (typeof updateTotalUnreadBadge === 'function') updateTotalUnreadBadge();
}

async function markGroupChatRead() {
  if (!supabaseClient || !supabaseMemberId) return;
  setChatUnreadBadge(0);
  await supabaseClient.from('group_chat_reads').upsert({
    member_id: supabaseMemberId,
    last_read_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}

function handleChatComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendGroupMessage(event);
  }
}

function autoResizeChatInput(input) {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
}

function scrollGroupChatToBottom() {
  const list = document.getElementById('chat-message-list');
  if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  document.getElementById('chat-new-message').style.display = 'none';
  markGroupChatRead();
}

async function notifyGroupChatMessage(messageId) {
  try {
    await supabaseClient.functions.invoke('send-request-notification', {
      body: { audience: 'chat', eventType: 'chat-message', messageId }
    });
  } catch (_) {
    // メッセージ送信自体は成功しているため、通知失敗は画面操作を止めない。
  }
}
