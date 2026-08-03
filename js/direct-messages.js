/* ---------------------------------------------------------
   個別メッセージ
   --------------------------------------------------------- */
let directMessageChannel = null;
let directMessagePeerId = null;
let directMessages = [];
let directMessageOverview = [];
let directMessageReads = [];
let directMessageHasMore = true;
let directMessageLoading = false;

function directMessageMember(memberId) {
  return appData.members.find(member => member.id === memberId) || {};
}

function directConversationFilter(peerId) {
  return `and(sender_id.eq.${supabaseMemberId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${supabaseMemberId})`;
}

function initDirectMessages() {
  initDirectMessageRealtime();
  refreshDirectMessageOverview();
}

function teardownDirectMessages() {
  if (directMessageChannel && supabaseClient) supabaseClient.removeChannel(directMessageChannel);
  directMessageChannel = null;
  directMessagePeerId = null;
  directMessages = [];
  directMessageOverview = [];
  directMessageReads = [];
}

function initDirectMessageRealtime() {
  if (!supabaseClient || !supabaseMemberId || directMessageChannel) return;
  directMessageChannel = supabaseClient.channel('direct-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, payload => receiveDirectMessage(payload.new))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' }, payload => {
      directMessages = directMessages.filter(message => message.id !== payload.old.id);
      renderDirectConversation();
      refreshDirectMessageOverview();
    })
    .subscribe();
}

async function openDirectMessages() {
  initDirectMessageRealtime();
  await refreshDirectMessageOverview();
  renderDirectMemberList();
  if (directMessagePeerId) await openDirectConversation(directMessagePeerId);
}

async function refreshDirectMessageOverview() {
  if (!supabaseClient || !supabaseMemberId) return;
  const [{ data: messages }, { data: reads }] = await Promise.all([
    supabaseClient.from('direct_messages')
      .select('id,sender_id,recipient_id,body,created_at')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabaseClient.from('direct_message_reads')
      .select('peer_member_id,last_read_at')
      .eq('member_id', supabaseMemberId)
  ]);
  directMessageOverview = messages || [];
  directMessageReads = reads || [];
  renderDirectMemberList();
  updateDirectMessageBadge();
  if (document.getElementById('tab-dashboard')?.style.display !== 'none') {
    renderDashboardDirectMessages(getDashboardMemberId() === supabaseMemberId, getDashboardMemberId());
  }
}

function openDirectConversationFromDashboard(peerId) {
  directMessagePeerId = peerId;
  navigateTo('tab-direct-messages');
}

function renderDashboardDirectMessages(isOwnDashboard, memberId) {
  const historyCard = document.getElementById('dashboard-direct-history-card');
  const history = document.getElementById('dashboard-direct-history');
  if (!historyCard || !history) return;

  historyCard.style.display = isOwnDashboard ? 'block' : 'none';
  if (!isOwnDashboard) return;

  if (!directMessageOverview.length) {
    history.innerHTML = '<button class="dashboard-direct-empty" onclick="navigateTo(\'tab-direct-messages\')">まだ個別メッセージはありません<br><em>メンバーを選んで送る ›</em></button>';
    return;
  }
  history.innerHTML = directMessageOverview.slice(0, 4).map(message => {
    const peerId = message.sender_id === supabaseMemberId ? message.recipient_id : message.sender_id;
    const peer = directMessageMember(peerId);
    const mine = message.sender_id === supabaseMemberId;
    const time = new Date(message.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<button class="dashboard-direct-row" onclick="openDirectConversationFromDashboard('${peerId}')">
      <span class="dashboard-direct-avatar">${avatarInnerHtml(peer.avatar, String(peer.name || '?').slice(0, 1))}</span>
      <span><span><b>${escapeHtml(peer.name || 'メンバー')}</b><time>${escapeHtml(time)}</time></span><em>${mine ? '自分: ' : ''}${escapeHtml(message.body).replace(/\s+/g, ' ')}</em></span><strong>›</strong>
    </button>`;
  }).join('');
}

function directUnreadCount(peerId) {
  const marker = directMessageReads.find(item => item.peer_member_id === peerId)?.last_read_at;
  return directMessageOverview.filter(message =>
    message.sender_id === peerId &&
    message.recipient_id === supabaseMemberId &&
    (!marker || new Date(message.created_at) > new Date(marker))
  ).length;
}

function updateDirectMessageBadge() {
  const count = appData.members
    .filter(member => member.id !== supabaseMemberId)
    .reduce((sum, member) => sum + directUnreadCount(member.id), 0);
  const badge = document.getElementById('direct-message-unread-badge');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.dataset.count = String(count || 0);
  badge.style.display = count ? 'inline-flex' : 'none';
  if (typeof updateTotalUnreadBadge === 'function') updateTotalUnreadBadge();
}

function renderDirectMemberList() {
  const list = document.getElementById('direct-member-list');
  if (!list || !appData.members) return;
  const members = appData.members
    .filter(member => member.id !== supabaseMemberId)
    .map(member => {
      const latest = directMessageOverview.find(message => message.sender_id === member.id || message.recipient_id === member.id);
      return { member, latest, unread: directUnreadCount(member.id) };
    })
    .sort((a, b) => {
      if (a.latest && b.latest) return new Date(b.latest.created_at) - new Date(a.latest.created_at);
      if (a.latest) return -1;
      if (b.latest) return 1;
      return a.member.name.localeCompare(b.member.name, 'ja');
    });
  list.innerHTML = members.length ? members.map(({ member, latest, unread }) => {
    const time = latest ? new Date(latest.created_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const preview = latest ? latest.body.replace(/\s+/g, ' ') : 'メッセージを送る';
    return `<button class="direct-member ${member.id === directMessagePeerId ? 'active' : ''}" onclick="openDirectConversation('${member.id}')">
      <span class="direct-member-avatar">${avatarInnerHtml(member.avatar, String(member.name || '?').slice(0, 1))}</span>
      <span class="direct-member-copy"><span><b>${escapeHtml(member.name)}</b><time>${escapeHtml(time)}</time></span><em>${escapeHtml(preview)}</em></span>
      ${unread ? `<strong>${unread > 99 ? '99+' : unread}</strong>` : ''}
    </button>`;
  }).join('') : '<div class="chat-empty">送信できるメンバーがいません。</div>';
}

async function openDirectConversation(peerId) {
  if (!peerId || peerId === supabaseMemberId) return;
  directMessagePeerId = peerId;
  directMessages = [];
  directMessageHasMore = true;
  renderDirectMemberList();
  renderDirectConversationHeader();
  document.getElementById('direct-message-layout')?.classList.add('conversation-open');
  await loadDirectConversation(true);
  await markDirectConversationRead(peerId);
  setTimeout(() => document.getElementById('direct-message-input')?.focus(), 50);
}

function closeDirectConversation() {
  directMessagePeerId = null;
  directMessages = [];
  document.getElementById('direct-message-layout')?.classList.remove('conversation-open');
  renderDirectMemberList();
}

function renderDirectConversationHeader() {
  const header = document.getElementById('direct-conversation-person');
  const peer = directMessageMember(directMessagePeerId);
  if (!header) return;
  header.innerHTML = directMessagePeerId
    ? `<span class="direct-header-avatar">${avatarInnerHtml(peer.avatar, String(peer.name || '?').slice(0, 1))}</span><b>${escapeHtml(peer.name || 'メンバー')}</b>`
    : '<span>相手を選択してください</span>';
}

async function loadDirectConversation(reset = true) {
  if (!directMessagePeerId || directMessageLoading) return;
  directMessageLoading = true;
  const list = document.getElementById('direct-message-list');
  const previousHeight = list?.scrollHeight || 0;
  let query = supabaseClient.from('direct_messages')
    .select('id,sender_id,recipient_id,body,created_at')
    .or(directConversationFilter(directMessagePeerId))
    .order('created_at', { ascending: false })
    .limit(50);
  if (!reset && directMessages.length) query = query.lt('created_at', directMessages[0].created_at);
  const { data, error } = await query;
  directMessageLoading = false;
  if (error) {
    showToast(`メッセージを読み込めませんでした: ${error.message}`);
    return;
  }
  const page = (data || []).reverse();
  directMessageHasMore = page.length === 50;
  directMessages = reset ? page : [...page, ...directMessages];
  renderDirectConversation({ scrollToBottom: reset });
  if (!reset && list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight - previousHeight; });
}

function renderDirectConversation(options = {}) {
  const list = document.getElementById('direct-message-list');
  if (!list) return;
  if (!directMessagePeerId) {
    list.innerHTML = '<div class="direct-conversation-placeholder">メンバーを選ぶと<br>個別メッセージを開始できます。</div>';
  } else if (!directMessages.length) {
    list.innerHTML = '<div class="chat-empty">まだメッセージはありません。</div>';
  } else {
    list.innerHTML = directMessages.map(message => {
      const mine = message.sender_id === supabaseMemberId;
      const time = new Date(message.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      return `<article class="direct-message ${mine ? 'mine' : ''}"><div><span class="direct-bubble">${escapeHtml(message.body).replace(/\n/g, '<br>')}</span><small>${time}${mine ? ` <button onclick="deleteDirectMessage('${message.id}')">削除</button>` : ''}</small></div></article>`;
    }).join('');
  }
  const more = document.getElementById('direct-load-more');
  if (more) more.style.display = directMessagePeerId && directMessageHasMore && directMessages.length ? 'block' : 'none';
  const composer = document.getElementById('direct-composer');
  if (composer) composer.style.display = directMessagePeerId ? 'flex' : 'none';
  if (options.scrollToBottom) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

async function sendDirectMessage(event) {
  event?.preventDefault();
  if (!directMessagePeerId) return;
  const input = document.getElementById('direct-message-input');
  const button = document.getElementById('direct-send-btn');
  const body = input.value.trim();
  if (!body) return;
  button.disabled = true;
  const { data, error } = await supabaseClient.from('direct_messages')
    .insert({ sender_id: supabaseMemberId, recipient_id: directMessagePeerId, body })
    .select('id,sender_id,recipient_id,body,created_at').single();
  button.disabled = false;
  if (error) {
    showToast(`送信できませんでした: ${error.message}`);
    return;
  }
  input.value = '';
  autoResizeChatInput(input);
  if (!directMessages.some(message => message.id === data.id)) directMessages.push(data);
  renderDirectConversation({ scrollToBottom: true });
  refreshDirectMessageOverview();
  notifyDirectMessage(data.id);
}

async function receiveDirectMessage(message) {
  const peerId = message.sender_id === supabaseMemberId ? message.recipient_id : message.sender_id;
  if (peerId === directMessagePeerId && !directMessages.some(item => item.id === message.id)) {
    directMessages.push(message);
    directMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    renderDirectConversation({ scrollToBottom: true });
    if (message.recipient_id === supabaseMemberId) await markDirectConversationRead(peerId);
  }
  refreshDirectMessageOverview();
}

async function deleteDirectMessage(messageId) {
  const message = directMessages.find(item => item.id === messageId);
  if (!message || message.sender_id !== supabaseMemberId || !confirm('このメッセージを削除しますか？')) return;
  const { error } = await supabaseClient.from('direct_messages').delete().eq('id', messageId);
  if (error) return showToast(`削除できませんでした: ${error.message}`);
  directMessages = directMessages.filter(item => item.id !== messageId);
  renderDirectConversation();
  refreshDirectMessageOverview();
}

async function markDirectConversationRead(peerId) {
  const now = new Date().toISOString();
  await supabaseClient.from('direct_message_reads').upsert({ member_id: supabaseMemberId, peer_member_id: peerId, last_read_at: now, updated_at: now });
  const existing = directMessageReads.find(item => item.peer_member_id === peerId);
  if (existing) existing.last_read_at = now;
  else directMessageReads.push({ peer_member_id: peerId, last_read_at: now });
  renderDirectMemberList();
  updateDirectMessageBadge();
}

function handleDirectMessageKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendDirectMessage(event);
  }
}

async function notifyDirectMessage(messageId) {
  try {
    await supabaseClient.functions.invoke('send-request-notification', { body: { audience: 'direct', eventType: 'direct-message', messageId } });
  } catch (_) {}
}
