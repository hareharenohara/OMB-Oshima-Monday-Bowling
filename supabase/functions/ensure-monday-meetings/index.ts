import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function tokyoToday(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: corsHeaders });

  const authorization = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!authorization || !url || !anonKey || !serviceKey) return new Response(JSON.stringify({ error: "service is not configured" }), { status: 503, headers: corsHeaders });

  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: authError } = await authClient.auth.getUser();
  if (authError || !userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller } = await admin.from("members").select("id").eq("auth_user_id", userData.user.id).eq("status", "在籍").single();
  if (!caller) return new Response(JSON.stringify({ error: "active member not found" }), { status: 403, headers: corsHeaders });

  const today = tokyoToday();
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const horizon = new Date(Date.UTC(today.year, today.month - 1, today.day));
  horizon.setUTCMonth(horizon.getUTCMonth() + 2);
  cursor.setUTCDate(cursor.getUTCDate() + ((8 - cursor.getUTCDay()) % 7));

  const rows = [];
  while (cursor <= horizon) {
    const key = dateKey(cursor);
    const startsAt = new Date(`${key}T19:00:00+09:00`);
    if (startsAt > new Date()) {
      const deadlineDate = new Date(cursor);
      deadlineDate.setUTCDate(deadlineDate.getUTCDate() - 7);
      const deadline = new Date(`${dateKey(deadlineDate)}T23:59:00+09:00`);
      rows.push({
        recurrence_key: `monday-${key}`,
        title: "月曜会",
        event_type: "bowling",
        starts_at: startsAt.toISOString(),
        ends_at: null,
        location: "",
        details: "",
        response_deadline: deadline.toISOString(),
        status: "scheduled",
        created_by: caller.id,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  if (rows.length) {
    const { error } = await admin.from("schedule_events").upsert(rows, { onConflict: "recurrence_key", ignoreDuplicates: true });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ ensured: rows.length }), { headers: corsHeaders });
});
