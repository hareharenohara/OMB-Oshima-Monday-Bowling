import { models, readSlip, retryDelay } from './reader.ts';
const assert = (value: unknown, message = 'assertion failed') => { if (!value) throw new Error(message); };
const payload = { imageBase64: 'saved-image', originalImageBase64: 'saved-original', mimeType: 'image/jpeg' };
const valid = { date: '2026-09-14', games: [{ frames: Array.from({ length: 10 }, (_, i) => ({ throws: ['9', '-'], score: (i + 1) * 9, is_split: false })) }] };
function answer(value: unknown) { return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] })); }
Deno.test('HTTP failure then invalid JSON then success uses exact model order and saved images', async () => {
  const calls: string[] = [];
  const mock = ((url: string, init: RequestInit) => {
    calls.push(url);
    const body = JSON.parse(String(init.body));
    assert(body.contents[0].parts[1].inline_data.data === payload.imageBase64);
    assert(body.contents[0].parts[2].inline_data.data === payload.originalImageBase64);
    return Promise.resolve(calls.length === 1 ? new Response('', {status: 503}) : calls.length === 2 ? new Response('invalid') : answer(valid));
  }) as typeof fetch;
  const result = await readSlip(payload, 'test-key', mock);
  assert(result?.model === models[2]);
  assert(calls.every((url, i) => url.includes(models[i])));
});
Deno.test('network errors, quota and invalid frames exhaust models without throwing', async () => {
  let count = 0;
  const mock = (() => {
    count++;
    if (count === 1) throw new TypeError('network failed');
    return Promise.resolve(count === 2 ? new Response('', {status: 429}) : answer({games: [{frames: [null]}]}));
  }) as typeof fetch;
  assert(await readSlip(payload, 'key', mock) === null);
  assert(count === 3);
});
Deno.test('successful first model stops fallback', async () => {
  let count = 0;
  const result = await readSlip(payload, 'key', (() => { count++; return Promise.resolve(answer(valid)); }) as typeof fetch);
  assert(count === 1 && result?.model === models[0]);
});
Deno.test('truncated response and empty games fall through', async () => {
  let count = 0;
  const result = await readSlip(payload, 'key', (() => {
    count++;
    return Promise.resolve(count === 1 ? new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS'}]})) : count === 2 ? answer({games:[]}) : answer(valid));
  }) as typeof fetch);
  assert(result?.model === models[2]);
});
Deno.test('delayed retries start at five minutes and cap at six hours', () => {
  assert(retryDelay(1) === 300000);
  assert(retryDelay(2) === 600000);
  assert(retryDelay(100) === 21600000);
});
Deno.test('progress callback reports each real model before sending it', async () => {
  const progress: string[] = [];
  let count = 0;
  await readSlip(payload, 'key', (() => {
    assert(progress.length === ++count);
    return Promise.resolve(count < 3 ? new Response('', {status:503}) : answer(valid));
  }) as typeof fetch, async model => { progress.push(model); });
  assert(JSON.stringify(progress) === JSON.stringify(models));
});
