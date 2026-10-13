#!/usr/bin/env node
// GA4 property setup via the Admin API, idempotent: custom dimensions and metrics, key events, data retention
// (v1beta, stable) plus best-effort v1alpha settings: calculated metric, Google signals off, enhanced measurement.
// Data filters (Developer traffic) and explorations have no API here: do them in the UI.
// Run through tools/ga.sh (gets a short-lived service account token):  tools/ga.sh setup [--dry-run]
const P = process.env.GA_PROPERTY, TOKEN = process.env.GA_TOKEN, QP = process.env.GA_QUOTA_PROJECT;
const DRY = process.argv.includes('--dry-run');
if (!P || !TOKEN) { console.log('Run via tools/ga.sh setup (needs GA_PROPERTY and GA_TOKEN).'); process.exit(1); }
const BASE = 'https://analyticsadmin.googleapis.com/', prop = 'properties/' + P;

// [parameter name in code, display name]; must match the params sent by app/analytics.js and the games
const DIMENSIONS = [
  ['game', 'Game'], ['env', 'Environment'], ['game_version', 'Game version'], ['result', 'Result'], ['mode', 'Mode'],
  ['difficulty', 'Difficulty'], ['reason', 'End reason'], ['winner_type', 'Winner type'], ['content_type', 'Content type'],
  ['content_id', 'Content id'], ['ship', 'Ship'], ['pilot', 'AI pilot'], ['budget', 'Fleet budget'], ['track', 'Track'],
  ['place', 'Place'], ['champion', 'Champion'], ['arena', 'Arena'], ['kills', 'Kills'], ['round', 'Round'], ['loaded', 'Loaded save'],
];
const METRICS = [['duration_sec', 'Duration', 'SECONDS'], ['turn', 'Turn', 'STANDARD']];
const KEY_EVENTS = ['level_end', 'select_content'];

async function api(method, path, body){
  const headers = {Authorization:'Bearer ' + TOKEN, 'Content-Type':'application/json'};
  if (QP) headers['x-goog-user-project'] = QP;
  const r = await fetch(BASE + path, {method, headers, body:body ? JSON.stringify(body) : undefined});
  const text = await r.text(), j = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${r.status} ${j.error ? j.error.message : text}`);
  return j;
}
async function listAll(path, key){
  let out = [], page = '';
  do {
    const j = await api('GET', path + '?pageSize=200' + (page ? '&pageToken=' + page : ''));
    out = out.concat(j[key] || []); page = j.nextPageToken;
  } while (page);
  return out;
}
async function step(title, fn){
  console.log(title);
  try { await fn(); } catch (e) { console.log('  ✗ ' + e.message); process.exitCode = 1; }
}
const act = async (label, fn) => { if (!DRY) await fn(); console.log('  + ' + label + (DRY ? ' (dry run)' : '')); };

await step('Custom dimensions (v1beta)', async () => {
  const have = new Set((await listAll(`v1beta/${prop}/customDimensions`, 'customDimensions')).map(d => d.parameterName));
  for (const [p, name] of DIMENSIONS) {
    if (have.has(p)) { console.log('  = ' + p); continue; }
    await act(p, () => api('POST', `v1beta/${prop}/customDimensions`, {parameterName:p, displayName:name, scope:'EVENT'}));
  }
});
await step('Custom metrics (v1beta)', async () => {
  const have = new Set((await listAll(`v1beta/${prop}/customMetrics`, 'customMetrics')).map(m => m.parameterName));
  for (const [p, name, unit] of METRICS) {
    if (have.has(p)) { console.log('  = ' + p); continue; }
    await act(p, () => api('POST', `v1beta/${prop}/customMetrics`, {parameterName:p, displayName:name, measurementUnit:unit, scope:'EVENT'}));
  }
});
await step('Key events (v1beta)', async () => {
  const have = new Set((await listAll(`v1beta/${prop}/keyEvents`, 'keyEvents')).map(k => k.eventName));
  for (const ev of KEY_EVENTS) {
    if (have.has(ev)) { console.log('  = ' + ev); continue; }
    await act(ev, () => api('POST', `v1beta/${prop}/keyEvents`, {eventName:ev, countingMethod:'ONCE_PER_EVENT'}));
  }
});
await step('Data retention: 14 months (v1beta)', async () => {
  const cur = await api('GET', `v1beta/${prop}/dataRetentionSettings`);
  if (cur.eventDataRetention === 'FOURTEEN_MONTHS') { console.log('  = already 14 months'); return; }
  await act(`${cur.eventDataRetention} → FOURTEEN_MONTHS`, () => api('PATCH', `v1beta/${prop}/dataRetentionSettings?updateMask=eventDataRetention`,
    {eventDataRetention:'FOURTEEN_MONTHS'}));
});
await step('Calculated metric: average game length (v1alpha, best effort)', async () => {
  const have = await listAll(`v1alpha/${prop}/calculatedMetrics`, 'calculatedMetrics');
  if (have.some(m => m.name.endsWith('/avg_game_length'))) { console.log('  = avg_game_length'); return; }
  // the API formula syntax is barely documented: try candidate spellings, keep the first one the API accepts
  const formulas = ['customEvent:duration_sec / eventCount', 'duration_sec / eventCount'];
  let lastErr = null;
  for (const formula of formulas) {
    try {
      await act('avg_game_length = ' + formula, () => api('POST', `v1alpha/${prop}/calculatedMetrics?calculatedMetricId=avg_game_length`,
        {displayName:'Avg game length', formula, metricUnit:'SECONDS', description:'Use with Event name = level_end'}));
      return;
    } catch (e) { lastErr = e; console.log('  · rejected: ' + formula); }
  }
  throw lastErr;
});
await step('Google signals: off (v1alpha, best effort)', async () => {
  await act('GOOGLE_SIGNALS_DISABLED', () => api('PATCH', `v1alpha/${prop}/googleSignalsSettings?updateMask=state`, {state:'GOOGLE_SIGNALS_DISABLED'}));
});
await step('Enhanced measurement: page views, scrolls, outbound clicks only (v1alpha, best effort)', async () => {
  const streams = (await listAll(`v1beta/${prop}/dataStreams`, 'dataStreams')).filter(s => s.type === 'WEB_DATA_STREAM');
  if (!streams.length) throw new Error('no web data stream on this property');
  const body = {streamEnabled:true, scrollsEnabled:true, outboundClicksEnabled:true, pageChangesEnabled:true,
    siteSearchEnabled:false, videoEngagementEnabled:false, formInteractionsEnabled:false, fileDownloadsEnabled:false};
  for (const s of streams) await act(s.displayName || s.name, () => api('PATCH',
    `v1alpha/${s.name}/enhancedMeasurementSettings?updateMask=${Object.keys(body).join(',')}`, body));
});
console.log('\nManual in the UI: Admin → Data filters → Developer traffic → Active; explorations (Explore).');
