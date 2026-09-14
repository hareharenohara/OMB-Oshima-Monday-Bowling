const prompt = `添付画像は同じボウリング個人結果票です。1枚目は台形・コントラスト補正済み、2枚目がある場合は元画像です。必ず両方を照合してください。
まず表の行・列、ゲーム番号、10フレームの境界を特定し、その後に各投球記号と累積スコアを読み取ってください。最終回答だけをJSONで出力してください。
スプリット判定は特に慎重に行ってください。各フレームの1投目の数字の外側に、印刷された独立した円または楕円が確認できる場合だけis_split=trueとします。0・6・8・9など数字自身の輪郭、罫線、汚れ、影は丸印ではありません。補正画像で円が薄い場合は元画像も確認してください。独立した囲みが確認できなければfalseにしてください。
ゲーム番号・最終累積スコア・各フレームの位置関係を照合し、推測できない文字は勝手に補わずnullまたは空文字にしてください。
各ゲームは次の形式のオブジェクトにしてください:
{"frames": 必ず10要素の配列。各要素は {"throws": [...], "score": 数値またはnull, "is_split": true/false} というオブジェクト。
throwsは各投球の結果を表す文字列の配列。ストライクは"X"、スペアは"/"、ピンを1本も倒せなかったミスは"-"、ガター(両端の溝に落ちた)は"G"、ファール(投球時にファールラインを越えた)は"F"、それ以外は倒したピン数を表す数字の文字列。
scoreはそのフレーム時点の累積スコア(シートの数字欄そのまま)。10フレーム目は投球数が2〜3投になることがある。
is_splitは、そのフレームの1投目のピン数の数字が丸(サークル)で囲まれている場合にtrue、それ以外はfalseにしてください。丸がなければ必ずfalseにしてください。}
日付が印字されていれば YYYY-MM-DD 形式(西暦下2桁のみの場合は20を補う)でトップレベルのdateに入れてください。読み取れなければnullにしてください。
出力は次の形式のJSONオブジェクトのみとし、説明文やコードブロック記号は一切含めないでください。インデントや改行、余分な空白を入れず、できるだけ詰めて出力してください:
{"date": "YYYY-MM-DD"またはnull, "games": [ {"frames": [...10要素...]}, ... ]}`;

export const models = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
export type ScanPayload = { imageBase64: string; originalImageBase64?: string; mimeType: string };

export async function readSlip(payload: ScanPayload, apiKey: string, fetcher: typeof fetch = fetch,
  onModel: (model: string) => Promise<void> = async () => {}) {
  for (const model of models) {
    await onModel(model);
    try {
      const response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(25000),
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: prompt },
              { inline_data: { mime_type: payload.mimeType, data: payload.imageBase64 } },
              ...(payload.originalImageBase64 ? [{ inline_data: { mime_type: payload.mimeType, data: payload.originalImageBase64 } }] : []),
            ] }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: "LOW" } },
          }),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const candidate = (await response.json())?.candidates?.[0];
      if (candidate?.finishReason && candidate.finishReason !== "STOP") throw new Error("Incomplete response");
      const text = candidate?.content?.parts?.filter((part: {text?: string; thought?: boolean}) => part.text && !part.thought)
        .map((part: {text: string}) => part.text).join("") || "";
      const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
      if (!Array.isArray(parsed?.games) || !parsed.games.length || !parsed.games.every((game: { frames?: unknown[] }) =>
        Array.isArray(game?.frames) && game.frames.length === 10 && game.frames.every((frame: any) =>
          frame && Array.isArray(frame.throws) && frame.throws.every((v: unknown) => typeof v === "string") &&
          (frame.score === null || (Number.isInteger(frame.score) && frame.score >= 0 && frame.score <= 300))) &&
        (game.frames[9] as {score: unknown}).score !== null)) throw new Error("Invalid score frames");
      const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
      return { date, games: parsed.games, model };
    } catch (error) {
      console.warn("Score scan model failed; continuing", model, error instanceof Error ? error.message : "unknown");
    }
  }
  return null;
}

export function retryDelay(attempts: number) {
  return Math.min(5 * 60_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 8), 6 * 60 * 60_000);
}
