import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { readSlip, retryDelay, type ScanPayload } from "./reader.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "POSTメソッドのみ利用できます。" }, 405);
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!url || !serviceKey || !apiKey) return json({ error: "サーバーの読み取り機能が未設定です。" }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  async function processJobs(id?: string) {
    const { data: jobs, error } = await admin.rpc("claim_score_scan_jobs", { p_id: id || null });
    if (error) throw error;
    await Promise.all((jobs || []).map(async (job: any) => {
      const result = await readSlip(job.payload as ScanPayload, apiKey, fetch, async (model) => {
        const { data, error } = await admin.from("score_scan_jobs").update({ current_model: model })
          .eq("id", job.id).eq("attempts", job.attempts).eq("status", "processing").select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("Scan cancelled or lease replaced");
      });
      const { error: saveError } = await admin.from("score_scan_jobs").update(result
        ? { status: "completed", result }
        : { status: "pending", next_attempt_at: new Date(Date.now() + retryDelay(job.attempts)).toISOString() })
        .eq("id", job.id).eq("attempts", job.attempts).eq("status", "processing");
      if (saveError) throw saveError; // The lease makes this job retryable after a DB failure.
    }));
  }

  try {
    const workerToken = req.headers.get("x-scan-worker-token");
    if (workerToken) {
      const { data: valid, error } = await admin.rpc("verify_score_scan_worker", { p_token: workerToken });
      if (error || valid !== true) return json({ error: "Unauthorized" }, 401);
      EdgeRuntime.waitUntil(processJobs().catch(error => console.error("Score scan worker failed", error)));
      return json({ accepted: true }, 202);
    }
    const authorization = req.headers.get("Authorization") || "";
    const { data: auth, error: authError } = await admin.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
    if (authError || !auth.user) return json({ error: "ログイン情報を確認できませんでした。" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "リクエストの形式が正しくありません。" }, 400); }
    const id = body.jobId || crypto.randomUUID();
    if (typeof id !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return json({ error: "読み取りIDが不正です。" }, 400);
    if (body.action === "dismiss") {
      const { error } = await admin.from("score_scan_jobs").delete().eq("id", id).eq("user_id", auth.user.id);
      if (error) throw error;
      return json({ deleted: true });
    }
    const { data: existing, error: lookupError } = await admin.from("score_scan_jobs")
      .select("id,status,result,next_attempt_at").eq("id", id).eq("user_id", auth.user.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return json({ jobId: id, status: existing.status, ...existing.result, nextAttemptAt: existing.next_attempt_at }, existing.status === "completed" ? 200 : 202);
    const { imageBase64, originalImageBase64, mimeType } = body;
    if (typeof imageBase64 !== "string" || !imageBase64 || imageBase64.length > 10_000_000 ||
      (originalImageBase64 != null && (typeof originalImageBase64 !== "string" || originalImageBase64.length > 10_000_000)) ||
      !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return json({ error: "画像の形式またはサイズが正しくありません。" }, 400);
    const { error: insertError } = await admin.from("score_scan_jobs").insert({
      id, user_id: auth.user.id, context_key: String(body.contextKey || "").slice(0, 100),
      request_date: typeof body.requestDate === "string" ? body.requestDate.slice(0, 10) : null,
      payload: { imageBase64, originalImageBase64, mimeType },
    });
    if (insertError && insertError.code !== "23505") throw insertError;
    // A duplicate ID is never allowed to expose or process another user's job.
    if (insertError) return json({ error: "読み取りIDが重複しています。" }, 409);
    EdgeRuntime.waitUntil(processJobs(id).catch(error => console.error("Score scan processing failed", error)));
    return json({ jobId: id, status: "pending" }, 202);
  } catch (error) {
    console.error("Score scan service failed", error);
    return json({ error: "画像の保存状況を確認できませんでした。通信が戻ってから再開してください。" }, 503);
  }
});
