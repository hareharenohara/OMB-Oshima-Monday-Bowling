import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBase64Length = 10_000_000;

const prompt = `添付の画像は、ボウリング場で1人のプレイヤーに渡される個人結果票です。
この人が投げた各ゲームの結果を、投球順に配列で読み取ってください。
各ゲームは次の形式のオブジェクトにしてください:
{"frames": 必ず10要素の配列。各要素は {"throws": [...], "score": 数値またはnull, "is_split": true/false} というオブジェクト。
throwsは各投球の結果を表す文字列の配列。ストライクは"X"、スペアは"/"、ピンを1本も倒せなかったミスは"-"、ガター(両端の溝に落ちた)は"G"、ファール(投球時にファールラインを越えた)は"F"、それ以外は倒したピン数を表す数字の文字列。
scoreはそのフレーム時点の累積スコア(シートの数字欄そのまま)。10フレーム目は投球数が2〜3投になることがある。
is_splitは、そのフレームの1投目のピン数の数字が丸(サークル)で囲まれている場合にtrue、それ以外はfalseにしてください。丸がなければ必ずfalseにしてください。}
日付が印字されていれば YYYY-MM-DD 形式(西暦下2桁のみの場合は20を補う)でトップレベルのdateに入れてください。読み取れなければnullにしてください。
出力は次の形式のJSONオブジェクトのみとし、説明文やコードブロック記号は一切含めないでください。インデントや改行、余分な空白を入れず、できるだけ詰めて出力してください:
{"date": "YYYY-MM-DD"またはnull, "games": [ {"frames": [...10要素...]}, ... ]}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "POSTメソッドのみ利用できます。" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return jsonResponse({ error: "ログインが必要です。" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";

  if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) {
    return jsonResponse({ error: "サーバーの読み取り機能が未設定です。" }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { error: authError } = await supabase.auth.getUser();
  if (authError) {
    return jsonResponse({ error: "ログイン情報を確認できませんでした。" }, 401);
  }

  let body: { imageBase64?: unknown; mimeType?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "リクエストの形式が正しくありません。" }, 400);
  }

  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  if (!imageBase64 || imageBase64.length > maxBase64Length || !allowedMimeTypes.has(mimeType)) {
    return jsonResponse({ error: "画像の形式またはサイズが正しくありません。" }, 400);
  }

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0,
            maxOutputTokens: 8192,
          },
        }),
      },
    );

    if (!geminiResponse.ok) {
      console.error("Gemini API error", geminiResponse.status);
      return jsonResponse({ error: `画像読み取りに失敗しました (${geminiResponse.status})。` }, 502);
    }

    const geminiData = await geminiResponse.json();
    const candidate = geminiData?.candidates?.[0];
    const responseText = candidate?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
    if (!responseText) {
      return jsonResponse({ error: "読み取り結果を取得できませんでした。" }, 502);
    }

    const cleaned = responseText
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/```\s*$/, "");

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const message = candidate?.finishReason === "MAX_TOKENS"
        ? "読み取り結果が長すぎました。写真を分割して再度お試しください。"
        : "読み取り結果の形式が正しくありませんでした。";
      return jsonResponse({ error: message }, 502);
    }

    if (!Array.isArray(parsed?.games) || parsed.games.length === 0) {
      return jsonResponse({ error: "ゲームを読み取れませんでした。手入力してください。" }, 422);
    }

    return jsonResponse({ date: parsed.date ?? null, games: parsed.games });
  } catch (error) {
    console.error("scan-bowling-slip failed", error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: "画像読み取り中にエラーが発生しました。" }, 500);
  }
});
