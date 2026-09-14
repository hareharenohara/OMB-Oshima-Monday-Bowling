const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(job) {
  const nodes = new Map();
  const timers = [];
  const applied = [];
  const context = vm.createContext({
    console, Blob, fetch, Date,
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, {style:{},value:'',setAttribute(){}}); return nodes.get(id); } },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {},
    reqKey: id => id + '-req', supabaseMemberId: 'member', pendingScanImages: {},
    showToast() {},
    supabaseClient: { from() { return { select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({data:job}), single: async () => ({data:job}) }; } },
  });
  vm.runInContext(fs.readFileSync('js/scores.js', 'utf8'), context);
  context.applyScannedGames = (...args) => applied.push(args);
  vm.runInContext("activeScanJobs['member-req'] = 'job';", context);
  return {context,nodes,timers,applied};
}
test('pending jobs retain a polling path without applying incomplete scores', async () => {
  const s = setup({status:'pending', attempts:1, next_attempt_at:'2026-09-14T12:00:00Z'});
  await s.context.pollScoreScan('member-req','job');
  assert.equal(s.applied.length,0);
  assert.equal(s.timers.length,1);
  assert.match(s.nodes.get('scan-status-member-req').textContent,/一時保留/);
});
test('completed jobs restore results without calling Gemini again', async () => {
  const s = setup({status:'completed',result:{games:[{frames:[]}],date:'2026-09-14'}});
  await s.context.pollScoreScan('member-req','job');
  assert.equal(s.applied.length,1);
  assert.equal(s.timers.length,0);
});
test('stale job results cannot overwrite a newly selected image', async () => {
  const s = setup({status:'completed',result:{games:[],date:null}});
  vm.runInContext("activeScanJobs['member-req'] = 'new-job';", s.context);
  await s.context.pollScoreScan('member-req','job');
  assert.equal(s.applied.length,0);
});
test('saved job restores image and date after a fresh page session', async () => {
  const s = setup({id:'job',status:'completed',request_date:'2026-09-10',payload:{mimeType:'image/jpeg',imageBase64:'aGVsbG8='},result:{games:[{}],date:null}});
  await s.context.resumeSavedScoreScan('job');
  assert.equal(s.nodes.get('score-request-date').value,'2026-09-10');
  assert.match(s.nodes.get('scan-thumb-member-req').src,/^data:image\/jpeg/);
  assert.equal(s.applied.length,1);
  assert.equal(await vm.runInContext("pendingScanImages['member-req'].text()",s.context),'hello');
});
test('processing progress shows actual fallback model and retry round', () => {
  const s = setup(null);
  const text = s.context.scoreScanProgress({status:'processing',current_model:'gemini-3.7-flash',attempts:2,next_attempt_at:'2099-01-01'});
  assert.match(text,/Gemini 3.7/);
  assert.match(text,/2\/3モデル・試行2回目/);
  assert.match(text,/切り替えました/);
});
test('retry delay passed shows queue state instead of a misleading countdown', () => {
  const s = setup(null);
  const text = s.context.scoreScanProgress({status:'pending',attempts:1,next_attempt_at:'2020-01-01'});
  assert.match(text,/順番待ち/);
  assert.doesNotMatch(text,/分後/);
});
test('completed progress explicitly requires submission', () => {
  const s = setup(null);
  assert.match(s.context.scoreScanProgress({status:'completed'}),/まだ申請されていません/);
});
test('expired processing lease shows recovery state', () => {
  const s = setup(null);
  assert.match(s.context.scoreScanProgress({status:'processing',attempts:1,current_model:'gemini-3.6-flash',next_attempt_at:'2020-01-01'}),/再開待ち/);
});
