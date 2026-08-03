import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const headers = { "Content-Type": "application/json; charset=utf-8" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublic = Deno.env.get("PUSH_VAPID_PUBLIC_KEY") || "";
  const vapidPrivate = Deno.env.get("PUSH_VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("PUSH_VAPID_SUBJECT") || "mailto:admin@example.com";
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ error: "reminder service is not configured" }), { status: 503, headers });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const now = new Date();
  const within24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const { data: events, error: eventError } = await admin.from("schedule_events")
    .select("id,title,starts_at,response_deadline,status")
    .eq("status", "scheduled")
    .not("response_deadline", "is", null)
    .gt("starts_at", now.toISOString())
    .lte("response_deadline", within24Hours.toISOString());
  if (eventError) return new Response(JSON.stringify({ error: eventError.message }), { status: 500, headers });
  if (!events?.length) return new Response(JSON.stringify({ sent: 0, candidates: 0 }), { headers });

  const eventIds = events.map((event) => event.id);
  const [{ data: members }, { data: responses }, { data: deliveries }] = await Promise.all([
    admin.from("members").select("id").eq("status", "在籍"),
    admin.from("schedule_responses").select("event_id,member_id").in("event_id", eventIds),
    admin.from("schedule_reminder_deliveries").select("schedule_event_id,member_id,reminder_type").in("schedule_event_id", eventIds)
  ]);
  const memberIds = (members || []).map((member) => member.id);
  const [{ data: preferenceRows }, { data: subscriptions }] = await Promise.all([
    memberIds.length ? admin.from("notification_preferences").select("member_id,push_enabled,schedule_reminders").in("member_id", memberIds) : Promise.resolve({ data: [] }),
    memberIds.length ? admin.from("push_subscriptions").select("id,member_id,endpoint,p256dh,auth").in("member_id", memberIds) : Promise.resolve({ data: [] })
  ]);

  const answered = new Set((responses || []).map((row) => `${row.event_id}:${row.member_id}`));
  const delivered = new Set((deliveries || []).map((row) => `${row.schedule_event_id}:${row.member_id}:${row.reminder_type}`));
  const preferences = new Map((preferenceRows || []).map((row) => [row.member_id, row]));
  const subscriptionsByMember = new Map<string, Array<{ id: string; member_id: string; endpoint: string; p256dh: string; auth: string }>>();
  for (const subscription of subscriptions || []) {
    const rows = subscriptionsByMember.get(subscription.member_id) || [];
    rows.push(subscription);
    subscriptionsByMember.set(subscription.member_id, rows);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  let sent = 0;
  let candidates = 0;
  for (const event of events) {
    const reminderType = new Date(event.response_deadline).getTime() < now.getTime() ? "overdue" : "due_soon";
    for (const memberId of memberIds) {
      const preference = preferences.get(memberId);
      if (preference && (!preference.push_enabled || !preference.schedule_reminders)) continue;
      if (answered.has(`${event.id}:${memberId}`) || delivered.has(`${event.id}:${memberId}:${reminderType}`)) continue;
      const memberSubscriptions = subscriptionsByMember.get(memberId) || [];
      if (!memberSubscriptions.length) continue;
      candidates++;

      const { error: reserveError } = await admin.from("schedule_reminder_deliveries").insert({
        schedule_event_id: event.id,
        member_id: memberId,
        reminder_type: reminderType
      });
      if (reserveError) continue;

      const message = reminderType === "due_soon"
        ? { title: "出欠の回答期限が迫っています", body: `${event.title}の回答期限は24時間以内です。` }
        : { title: "出欠の回答期限を過ぎています", body: `${event.title}が未回答のまま期限を過ぎています。予定をご確認ください。` };
      let deliveredToDevice = false;
      for (const subscription of memberSubscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            JSON.stringify({ ...message, url: "./#/schedule", tag: `schedule-reminder-${event.id}-${reminderType}` })
          );
          deliveredToDevice = true;
          sent++;
        } catch (error) {
          const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
          if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }
      if (!deliveredToDevice) {
        await admin.from("schedule_reminder_deliveries").delete()
          .eq("schedule_event_id", event.id).eq("member_id", memberId).eq("reminder_type", reminderType);
      }
    }
  }
  return new Response(JSON.stringify({ sent, candidates }), { headers });
});
