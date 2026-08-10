import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json; charset=utf-8" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return new Response(JSON.stringify({ error: "cleanup service is not configured" }), { status: 503, headers });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("requests").select("id,image_path").not("image_path", "is", null).neq("status", "pending").lt("decided_at", cutoff).limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  const rows = (data || []).filter((row) => row.image_path);
  if (!rows.length) return new Response(JSON.stringify({ removed: 0 }), { headers });
  const { error: removeError } = await admin.storage.from("score-request-images").remove(rows.map((row) => row.image_path as string));
  if (removeError) return new Response(JSON.stringify({ error: removeError.message }), { status: 500, headers });
  const { error: updateError } = await admin.from("requests").update({ image_path: null }).in("id", rows.map((row) => row.id));
  if (updateError) return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers });
  return new Response(JSON.stringify({ removed: rows.length }), { headers });
});
