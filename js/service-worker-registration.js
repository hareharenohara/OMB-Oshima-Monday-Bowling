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
  btn.textContent = subscription ? '🔔' : '🔕';
  btn.title = subscription ? '通知は有効です' : '通知を有効にする';
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
