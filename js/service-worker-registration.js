// Service Worker登録（PWA対応）
if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => {
          console.warn('Service Worker登録に失敗しました:', err);
        });
      });
}

function base64UrlToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

async function checkPushSubscriptionState() {
  const btn = document.getElementById('push-notification-btn');
  if (!btn || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (btn) btn.style.display = 'none';
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  btn.textContent = subscription ? '🔔 通知：オン（タップで解除）' : '🔕 通知を有効にする';
  btn.title = subscription ? '通知は有効です' : '通知を有効にする';
}

async function openNotificationSettings() {
  if (!supabaseClient || !supabaseMemberId) return;
  showModal('modal-notification-settings');
  const { data, error } = await supabaseClient.from('notification_preferences')
    .select('push_enabled,announcements,group_chat,direct_messages,schedule_reminders')
    .eq('member_id', supabaseMemberId).maybeSingle();
  if (error) return showToast('通知設定を読み込めませんでした。');
  const preferences = data || { push_enabled:true, announcements:true, group_chat:true, direct_messages:true, schedule_reminders:true };
  document.getElementById('notification-pref-enabled').checked = preferences.push_enabled;
  document.getElementById('notification-pref-announcements').checked = preferences.announcements;
  document.getElementById('notification-pref-group-chat').checked = preferences.group_chat;
  document.getElementById('notification-pref-direct').checked = preferences.direct_messages;
  document.getElementById('notification-pref-schedule').checked = preferences.schedule_reminders;
  syncNotificationPreferenceControls();
  await refreshNotificationDeviceStatus();
}

function syncNotificationPreferenceControls() {
  const enabled = document.getElementById('notification-pref-enabled')?.checked;
  ['notification-pref-announcements','notification-pref-group-chat','notification-pref-direct','notification-pref-schedule'].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.disabled = !enabled;
  });
}

async function saveNotificationSettings() {
  const button = document.getElementById('notification-settings-save');
  button.disabled = true;
  const payload = {
    member_id: supabaseMemberId,
    push_enabled: document.getElementById('notification-pref-enabled').checked,
    announcements: document.getElementById('notification-pref-announcements').checked,
    group_chat: document.getElementById('notification-pref-group-chat').checked,
    direct_messages: document.getElementById('notification-pref-direct').checked,
    schedule_reminders: document.getElementById('notification-pref-schedule').checked,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabaseClient.from('notification_preferences').upsert(payload);
  button.disabled = false;
  if (error) return showToast(`通知設定を保存できませんでした: ${error.message}`);
  closeModal('modal-notification-settings');
  showToast('通知設定を保存しました。');
}

async function refreshNotificationDeviceStatus() {
  const status = document.getElementById('notification-device-status');
  const button = document.getElementById('notification-device-toggle');
  if (!status || !button || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  status.textContent = subscription ? 'この端末では通知が有効です' : 'この端末では通知が無効です';
  button.textContent = subscription ? '解除' : '有効にする';
  button.className = subscription ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm';
}

async function togglePushNotificationsFromSettings() {
  await togglePushNotifications();
  await refreshNotificationDeviceStatus();
}

async function togglePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return showToast('このブラウザはプッシュ通知に対応していません。');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return enablePushNotifications();
  try {
    const endpoint = subscription.endpoint;
    const { error } = await supabaseClient.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('member_id', supabaseMemberId);
    if (error) throw error;
    await subscription.unsubscribe();
    showToast('この端末の通知を解除しました。');
    checkPushSubscriptionState();
  } catch (error) {
    showToast('通知を解除できませんでした: ' + error.message);
  }
}

function updateTotalUnreadBadge() {
  const ids = ['announcement-unread-badge', 'chat-unread-badge', 'direct-message-unread-badge', 'approval-center-badge'];
  const total = ids.reduce((sum, id) => sum + Number(document.getElementById(id)?.dataset.count || 0), 0);
  const badge = document.getElementById('total-unread-badge');
  if (badge) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = total ? 'inline-flex' : 'none';
  }
  const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = total ? `(${total}) ${baseTitle}` : baseTitle;
  if ('setAppBadge' in navigator) {
    if (total) navigator.setAppBadge(total).catch(() => {});
    else navigator.clearAppBadge?.().catch(() => {});
  }
}

function resetUnreadBadges() {
  ['announcement-unread-badge', 'chat-unread-badge', 'direct-message-unread-badge', 'approval-center-badge'].forEach(id => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.dataset.count = '0';
    badge.style.display = 'none';
  });
  updateTotalUnreadBadge();
}

async function enablePushNotifications() {
  if (!PUSH_VAPID_PUBLIC_KEY) return showToast('通知用の公開鍵が未設定です。管理者にお知らせください。');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return showToast('このブラウザはプッシュ通知に対応していません。');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return showToast('通知が許可されませんでした。ブラウザの設定から変更できます。');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(PUSH_VAPID_PUBLIC_KEY) });
    const json = subscription.toJSON();
    const { error } = await supabaseClient.from('push_subscriptions').upsert({
      member_id: supabaseMemberId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    showToast('通知を有効にしました。');
    checkPushSubscriptionState();
  } catch (error) {
    console.error(error);
    showToast('通知の設定に失敗しました: ' + error.message);
  }
}

async function notifyRequestEvent(audience, memberId, eventType) {
  try {
    const { error } = await supabaseClient.functions.invoke('send-request-notification', { body: { audience, memberId, eventType } });
    if (error) console.warn('通知送信に失敗しました:', error.message);
  } catch (error) {
    console.warn('通知送信に失敗しました:', error);
  }
}
