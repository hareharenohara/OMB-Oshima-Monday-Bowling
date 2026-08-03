import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const messages: Record<string, { title: string; body: string }> = {
  "score-submitted": { title: "スコア申請", body: "新しいスコア申請が届きました。" },
  "purchase-submitted": { title: "回数券購入申請", body: "新しい回数券購入申請が届きました。" },
  "return-submitted": { title: "回数券返還申請", body: "新しい回数券返還申請が届きました。" },
  "score-approved": { title: "申請が承認されました", body: "スコアが記録に反映されました。" },
  "score-rejected": { title: "申請結果", body: "スコア申請が却下されました。アプリで理由をご確認ください。" },
  "purchase-approved": { title: "申請が承認されました", body: "回数券購入が残高に反映されました。" },
  "purchase-rejected": { title: "申請結果", body: "回数券購入申請が却下されました。" },
  "return-approved": { title: "申請が承認されました", body: "回数券返還が残高に反映されました。" },
  "return-rejected": { title: "申請結果", body: "回数券返還申請が却下されました。" },
  "announcement-published": { title: "OMBからのお知らせ", body: "新しいお知らせがあります。" },
  "schedule-created": { title: "新しい予定", body: "開催予定が追加されました。出欠を回答してください。" },
  "schedule-updated": { title: "予定が変更されました", body: "開催予定の内容を確認してください。" },
  "schedule-cancelled": { title: "予定中止のお知らせ", body: "開催予定が中止になりました。" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: corsHeaders });

  const authorization = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublic = Deno.env.get("PUSH_VAPID_PUBLIC_KEY") || "";
  const vapidPrivate = Deno.env.get("PUSH_VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("PUSH_VAPID_SUBJECT") || "mailto:admin@example.com";
  if (!authorization || !url || !anonKey || !serviceKey || !vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ error: "notification service is not configured" }), { status: 503, headers: corsHeaders });
  }

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: authError } = await authClient.auth.getUser();
  if (authError || !userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller } = await admin.from("members").select("id,role,name,status").eq("auth_user_id", userData.user.id).single();
  if (!caller) return new Response(JSON.stringify({ error: "member not found" }), { status: 403, headers: corsHeaders });

  const { audience, memberId, eventType, title, body, messageId } = await req.json();
  const isSubmission = audience === "admins" && String(eventType).endsWith("-submitted");
  const isDecision = audience === "member" && caller.role === "admin";
  const isBroadcast = audience === "all" && ["announcement-published", "schedule-created", "schedule-updated", "schedule-cancelled"].includes(eventType) && caller.role === "admin";
  const isChat = audience === "chat" && eventType === "chat-message" && caller.status === "在籍" && typeof messageId === "string";
  const isDirect = audience === "direct" && eventType === "direct-message" && caller.status === "在籍" && typeof messageId === "string";
  if (!isSubmission && !isDecision && !isBroadcast && !isChat && !isDirect) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

  let chatMessage: { body: string; created_at: string } | null = null;
  let directMessage: { recipient_id: string; created_at: string } | null = null;
  if (isChat) {
    const { data } = await admin.from("group_messages")
      .select("body,created_at")
      .eq("id", messageId)
      .eq("member_id", caller.id)
      .single();
    if (!data || Date.now() - new Date(data.created_at).getTime() > 5 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "invalid chat message" }), { status: 403, headers: corsHeaders });
    }
    chatMessage = data;
  }
  if (isDirect) {
    const { data } = await admin.from("direct_messages")
      .select("recipient_id,created_at")
      .eq("id", messageId)
      .eq("sender_id", caller.id)
      .single();
    if (!data || Date.now() - new Date(data.created_at).getTime() > 5 * 60 * 1000) {
      return new Response(JSON.stringify({ error: "invalid direct message" }), { status: 403, headers: corsHeaders });
    }
    directMessage = data;
  }

  let targetIds: string[] = [];
  if (audience === "admins") {
    const { data } = await admin.from("members").select("id").eq("role", "admin");
    targetIds = (data || []).map((row) => row.id);
  } else if (audience === "all") {
    const { data } = await admin.from("members").select("id").eq("status", "在籍");
    targetIds = (data || []).map((row) => row.id);
  } else if (audience === "chat") {
    const { data } = await admin.from("members").select("id").eq("status", "在籍").neq("id", caller.id);
    targetIds = (data || []).map((row) => row.id);
  } else if (audience === "direct" && directMessage) {
    targetIds = [directMessage.recipient_id];
  } else if (typeof memberId === "string") {
    targetIds = [memberId];
  }
  const preferenceKey = eventType === "announcement-published" ? "announcements"
    : eventType === "chat-message" ? "group_chat"
    : eventType === "direct-message" ? "direct_messages"
    : eventType.startsWith("schedule-") ? "schedule_reminders"
    : null;
  const { data: preferenceRows } = targetIds.length
    ? await admin.from("notification_preferences").select("member_id,push_enabled,announcements,group_chat,direct_messages,schedule_reminders").in("member_id", targetIds)
    : { data: [] };
  const preferences = new Map((preferenceRows || []).map((row) => [row.member_id, row]));
  const eligibleTargetIds = targetIds.filter((id) => {
    const preference = preferences.get(id);
    if (!preference) return true;
    if (!preference.push_enabled) return false;
    return !preferenceKey || preference[preferenceKey] !== false;
  });
  const { data: subscriptions } = eligibleTargetIds.length
    ? await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("member_id", eligibleTargetIds)
    : { data: [] };

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const defaultMessage = messages[eventType] || { title: "OMB", body: "申請状況が更新されました。" };
  const message = isChat && chatMessage
    ? { title: `${caller.name || "メンバー"}さんからのメッセージ`, body: "全体チャットに新しいメッセージが届きました。" }
    : isDirect && directMessage
      ? { title: `${caller.name || "メンバー"}さんからの個別メッセージ`, body: "個別メッセージが届きました。" }
    : isBroadcast
      ? { title: String(title || defaultMessage.title).slice(0, 100), body: String(body || defaultMessage.body).slice(0, 180) }
      : defaultMessage;
  let sent = 0;
  for (const subscription of subscriptions || []) {
    try {
      const targetUrl = eventType === "direct-message" ? "./#/messages" : eventType === "chat-message" ? "./#/chat" : eventType === "announcement-published" ? "./#/announcements" : eventType.startsWith("schedule-") ? "./#/schedule" : "./";
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ ...message, url: targetUrl, tag: eventType }));
      sent++;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: corsHeaders });
});
