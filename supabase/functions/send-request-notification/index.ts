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
  const { data: caller } = await admin.from("members").select("id,role").eq("auth_user_id", userData.user.id).single();
  if (!caller) return new Response(JSON.stringify({ error: "member not found" }), { status: 403, headers: corsHeaders });

  const { audience, memberId, eventType } = await req.json();
  const isSubmission = audience === "admins" && String(eventType).endsWith("-submitted");
  const isDecision = audience === "member" && caller.role === "admin";
  if (!isSubmission && !isDecision) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

  let targetIds: string[] = [];
  if (audience === "admins") {
    const { data } = await admin.from("members").select("id").eq("role", "admin");
    targetIds = (data || []).map((row) => row.id);
  } else if (typeof memberId === "string") {
    targetIds = [memberId];
  }
  const { data: subscriptions } = targetIds.length
    ? await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").in("member_id", targetIds)
    : { data: [] };

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const message = messages[eventType] || { title: "OMB", body: "申請状況が更新されました。" };
  let sent = 0;
  for (const subscription of subscriptions || []) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ ...message, url: "./", tag: eventType }));
      sent++;
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: corsHeaders });
});
