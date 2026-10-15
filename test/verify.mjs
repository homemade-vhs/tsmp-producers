// Headless acceptance checks for tvguide-credits.html.
//   cd test && npm install && npm test
// Opens the page over file://, drives it through window.__tvguide, and checks layout,
// timing, header lock/push-out, determinism, seeding, CSV mapping, and a real 5-second
// MP4 export (in-memory fallback path). Frames and the MP4 land in test/out/.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const url = 'file://' + encodeURI(path.join(PROJECT, 'tvguide-credits.html'));
const results = {};
let failures = 0;
const fail = (name, msg) => { failures++; results[name] = 'FAIL: ' + msg; console.log('FAIL', name, msg); };
const pass = (name, msg = '') => { results[name] = 'PASS ' + msg; console.log('PASS', name, msg); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.setViewport({ width: 1600, height: 1000 });
await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch {} });
await page.goto(url);
await page.waitForFunction(() => window.__tvguide && window.__tvguide.state.layout, { timeout: 20000 });

// 1. environment over file://
const env = await page.evaluate(async () => {
  const T = window.__tvguide;
  return {
    protocol: location.protocol, isSecureContext: window.isSecureContext,
    showSaveFilePicker: typeof window.showSaveFilePicker, showDirectoryPicker: typeof window.showDirectoryPicker,
    VideoEncoder: typeof window.VideoEncoder, Mediabunny: typeof window.Mediabunny,
    levels: { p1080_30: T.pickAvcLevel(1920, 1080, 30, 40e6), p1080_60: T.pickAvcLevel(1920, 1080, 60, 40e6), k4_30: T.pickAvcLevel(3840, 2160, 30, 100e6), k4_60: T.pickAvcLevel(3840, 2160, 60, 100e6), podcast: T.pickAvcLevel(3328, 2496, 24000 / 1001, 100e6) },
    autoBitrate: { p1080: T.resolveBitrate({ bitrateMbps: 0 }, 1920, 1080), podcast: T.resolveBitrate({ bitrateMbps: 0 }, 3328, 2496), k4: T.resolveBitrate({ bitrateMbps: 0 }, 3840, 2160) },
    output: { w: document.getElementById('outputCanvas').width, h: document.getElementById('outputCanvas').height, fps: T.state.config.fps, fpsLabel: T.fpsEntry(T.state.config.fps).label, totalFrames: T.state.config.totalFrames, totalSeconds: T.state.config.totalSeconds },
    enc: await T.chooseEncoderConfig(document.getElementById('outputCanvas').width, document.getElementById('outputCanvas').height, T.state.config.fps, 100e6),
  };
});
console.log('ENV', JSON.stringify(env));
results.env = env;
if (env.levels.p1080_30 === 0x29 && env.levels.p1080_60 === 0x2A && env.levels.k4_30 === 0x33 && env.levels.k4_60 === 0x34 && env.levels.podcast === 0x33) pass('avc level picker'); else fail('avc level picker', JSON.stringify(env.levels));
if (env.autoBitrate.p1080 === 40e6 && env.autoBitrate.k4 === 100e6 && env.autoBitrate.podcast === 100e6) pass('auto bitrate'); else fail('auto bitrate', JSON.stringify(env.autoBitrate));
const FPS = env.output.fps, TOTAL = env.output.totalSeconds;
if (env.output.w === 832 && env.output.h === 624 && env.output.fpsLabel === '23.976' && near(FPS, 24000 / 1001) && env.output.totalFrames === 4316 && near(TOTAL, 4316 * 1001 / 24000)) pass('defaults: 832x624 (¼ of the podcast master) @ 23.976, 180 s → 4316 frames'); else fail('defaults', JSON.stringify(env.output));
if (env.enc.supported) pass(`encoder config for the default size: ${env.enc.codec}`); else fail('encoder config for the default size', env.enc.reason);

// 1b. default look: bundled PrevueGrid at 1:1 (25 px, unsqueezed, pixel text, never shrink) with no fonts folder picked
{
  const r = await page.evaluate(() => {
    const T = window.__tvguide, S = T.state.skin, F = T.state.fontRoles;
    return { files: [...new Set(Object.values(F).map((f) => f.file))], missing: Object.values(F).some((f) => f.missing), px: [S.fonts.cell, S.fonts.tile, S.fonts.header, S.fonts.clock, S.fonts.banner, S.fonts.promo], scaleX: S.fonts.scaleX, weight: S.fonts.weight, pixel: S.pixelText, min: T.state.config.minFontScale, source: T.fontLib.fonts.get('pixel fonts/PrevueGrid-Pixelated.ttf')?.source };
  });
  if (r.files.join() === 'pixel fonts/PrevueGrid-Pixelated.ttf' && !r.missing && r.px.every((v) => v === 25) && r.scaleX === 1 && r.weight === 'normal' && r.pixel && r.min === 1 && r.source === 'bundled') pass('default look: bundled PrevueGrid 1:1 at 25 px, width 100%, no bold, pixel text, no shrinking'); else fail('default look', JSON.stringify(r));
}

// The geometry / export checks below were written for the big 3328×2496 greybox frame: run them on those settings
// (the full-size render path matters just as much as the new 832×624 default).
await page.evaluate(async () => {
  const set = (k, v) => { const i = document.querySelector(`[data-setting="${k}"]`); if (i.type === 'checkbox') i.checked = v; else i.value = v; };
  for (const [k, v] of Object.entries({ outputRes: '3328x2496', rowHeightPx: 88, headerHeightPx: 64, minFontScale: 0.75, textRender: 'smooth', txWrapCell: false, speedRatio: 1, startHoldFrames: 0, loadInFrames: 0, easeInFrames: 0, sectionEaseFrames: 0 })) set(k, v);   // + a plain linear scroll from t = 0
  for (const k of ['Cell', 'Tile', 'Header', 'Clock', 'Banner', 'Promo']) { set('font' + k, ''); set('fontPx' + k, ''); set('fontWidth' + k, 92); set('fontBold' + k, true); }
  await window.__tvguide.rebuild();
});

// 2. layout with test data
const info = await page.evaluate(() => {
  const { state } = window.__tvguide;
  const L = state.layout, S = state.skin;
  const cells = L.rows.filter((r) => r.type === 'row').flatMap((r) => r.cells);
  return {
    sections: L.sections.map((s) => ({ key: s.key, names: s.nameCount, rows: s.rowCount, banners: s.bannerCount })),
    contentHeight: L.contentHeight, timing: state.timing, gridRect: S.gridRect, headerHeight: S.headerHeight, rowHeight: S.rowHeight,
    videoRect: S.videoRect, truncated: cells.filter((c) => c.fit.truncated).length, cellCount: cells.length,
    bannerTextsOk: L.rows.filter((r) => r.type === 'banner').every((r) => r.banner.lines.length > 0 || r.banner.image) && L.rows.filter((r) => r.type === 'banner').slice(0, 2).map((r) => r.presetId).join() === 'default-logo,default-patreon',
    lastRowIsBanner: L.rows[L.rows.length - 1].type === 'banner',
  };
});
console.log('LAYOUT', JSON.stringify(info));
if (info.sections.length === 2 && info.sections[0].names === 320 && info.sections[1].names === 1050 && info.cellCount === 1370) pass('test data counts'); else fail('test data counts', JSON.stringify(info.sections));
if (info.truncated > 0 && info.bannerTextsOk && !info.lastRowIsBanner) pass('text fitting + banners'); else fail('text fitting + banners', JSON.stringify(info));
if (near(info.videoRect.w / info.videoRect.h, 4 / 3, 0.01) && info.videoRect.x === 0 && info.videoRect.y === 0 && info.videoRect.h === info.gridRect.y) pass('video window: flush 4:3 from the top-left corner to the header bar'); else fail('video window flush', JSON.stringify(info.videoRect));
{
  const fills = await page.evaluate(async () => {
    const sample = () => { const c = document.getElementById('outputCanvas'); window.__tvguide.setTime(1); const d = c.getContext('2d').getImageData(8, 8, 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    const set = async (key, value) => { const i = document.querySelector(`[data-setting="${key}"]`); i.value = value; i.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 400)); };
    const black = sample();
    await set('videoFill', '#00ff00'); const green = sample();
    await set('videoFillCustom', '#00b140'); await set('videoFill', 'custom'); const custom = sample();
    await set('videoWindowStyle', 'boxed'); const boxedCorner = sample(); const boxedRect = JSON.parse(JSON.stringify(window.__tvguide.state.skin.videoRect));
    await set('videoWindowStyle', 'flush');
    // blank top: whole strip above the bar is the fill colour, promo gone, grid untouched
    await set('videoFill', '#00ff00'); await set('topArea', 'blank');
    const S = window.__tvguide.state.skin; const c = document.getElementById('outputCanvas'); const ctx = c.getContext('2d');
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const blank = { topRight: px(c.width - 8, 8), aboveBar: px(Math.round(c.width / 2), S.gridRect.y - 3), belowBar: px(Math.round(c.width / 2), S.gridRect.y + 3), rect: JSON.parse(JSON.stringify(S.videoRect)), promo: S.promoRect, stats: document.getElementById('statsList').textContent.includes('Top area') };
    await set('topArea', 'normal'); await set('videoFill', '#000000');
    return { black, green, custom, boxedCorner, boxedRect, blank };
  });
  console.log('FILLS', JSON.stringify(fills));
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (eq(fills.black, [0, 0, 0, 255]) && eq(fills.green, [0, 255, 0, 255]) && eq(fills.custom, [0, 177, 64, 255]) && fills.boxedRect.x > 0 && !eq(fills.boxedCorner, [0, 0, 0, 255])) pass('video fill: black / chroma green / custom, boxed style still inset'); else fail('video fill', JSON.stringify(fills));
  const b = fills.blank;
  if (eq(b.topRight, [0, 255, 0, 255]) && eq(b.aboveBar, [0, 255, 0, 255]) && !eq(b.belowBar, [0, 255, 0, 255]) && b.rect.x === 0 && b.rect.y === 0 && b.rect.w === 3328 && b.promo === null && b.stats) pass('blank top area: whole strip above the bar is the fill, promo gone, grid intact'); else fail('blank top area', JSON.stringify(b));
}

// 3. timing
{
  const t = info.timing;
  const r = await page.evaluate(() => { const { state, scrollAt } = window.__tvguide; return { sAtTotal: scrollAt(state.timing, state.config.totalSeconds), sAtBoundary: scrollAt(state.timing, state.timing.tExec) }; });
  if (near(t.tExec + t.tProd, TOTAL) && near(t.total, TOTAL)) pass('tExec + tProd = total (= frames / fps)'); else fail('tExec + tProd = total', `${t.tExec} + ${t.tProd} vs ${TOTAL}`);
  if (near(r.sAtTotal, t.sEnd, 1e-4) && near(r.sAtBoundary, t.boundaryS, 1e-4)) pass('s(t) hits boundary and end exactly'); else fail('s(t)', JSON.stringify(r));
  const L = info.gridRect.y;
  if (near(L + info.contentHeight - t.sEnd, L + info.headerHeight)) pass('scrollOff: last row bottom at header bottom at t = total'); else fail('scrollOff end', '');
}

// 4. header lock / push-out
{
  const hp = await page.evaluate(() => {
    const { state, scrollAt, headerPositions } = window.__tvguide;
    const T = state.timing, S = state.skin;
    const at = (t) => headerPositions(state.layout, S, scrollAt(T, t));
    return { L: S.gridRect.y, H: S.headerHeight, t0: at(0), before: at(T.tExec - 0.5), atB: at(T.tExec), after: at(T.tExec + 0.5), end: at(T.total) };
  });
  console.log('HEADERS', JSON.stringify(hp));
  const { L, H } = hp;
  if (hp.t0[0] === L && hp.t0[1] > L) pass('t=0: first header locked, rows beneath'); else fail('t=0 header', JSON.stringify(hp.t0));
  if (hp.before[0] === L && hp.before[1] > L && hp.before[1] < L + H * 3) pass('before boundary: exec locked, prod header approaching'); else fail('before boundary', JSON.stringify(hp.before));
  if (near(hp.atB[1], L) && near(hp.atB[0], L - H)) pass('at boundary: prod header locks, exec pushed fully out'); else fail('at boundary', JSON.stringify(hp.atB));
  if (hp.after[1] === L && hp.after[0] <= L - H && hp.end[1] === L) pass('after boundary: prod stays locked, exec stays out'); else fail('after boundary', JSON.stringify(hp.after));
}

// 5. determinism
{
  const same = await page.evaluate(() => {
    const { renderFrame } = window.__tvguide; const c = document.getElementById('outputCanvas');
    renderFrame(42.5); const a = c.toDataURL(); renderFrame(3); renderFrame(42.5); return a === c.toDataURL();
  });
  same ? pass('render(t) determinism') : fail('render(t) determinism', 'pixels differ');
}

// 6. speedRatio keeps the total
{
  const r = await page.evaluate(() => {
    const { state, computeTiming } = window.__tvguide;
    return [0.5, 1, 2, 3.7].map((ratio) => { const t = computeTiming(state.layout, { ...state.config, speedRatio: ratio }, state.skin); return { ratio, tExec: t.tExec, sum: t.tExec + t.tProd }; });
  });
  if (r.every((x) => near(x.sum, TOTAL)) && r[0].tExec > r[1].tExec && r[1].tExec > r[2].tExec) pass('speedRatio changes split, total stays 180'); else fail('speedRatio', JSON.stringify(r));
}

// 7. seed: channel names reshuffle reproducibly, nothing else changes
{
  const r = await page.evaluate(() => {
    const { state, buildLayout } = window.__tvguide;
    const ctx = state.renderCtx;
    const a = buildLayout({ ...state.config, seed: 1 }, state.skin, ctx), a2 = buildLayout({ ...state.config, seed: 1 }, state.skin, ctx), b = buildLayout({ ...state.config, seed: 2 }, state.skin, ctx);
    const names = (l) => JSON.stringify(l.rows.filter((r) => r.type === 'row').map((r) => r.channel.name));
    const rest = (l) => JSON.stringify(l.rows.map((r) => [r.type, r.y, r.height, r.channel && r.channel.number, r.cells && r.cells.map((c) => c.fit.text)]));
    const first = JSON.parse(names(a)).slice(0, 42);
    return { reproducible: names(a) === names(a2), differs: names(a) !== names(b), restSame: rest(a) === rest(b), noRepeat: new Set(first).size === 42 };
  });
  if (r.reproducible && r.differs && r.restSame && r.noRepeat) pass('seed behaviour'); else fail('seed behaviour', JSON.stringify(r));
}

// 8. reference frames
const shot = async (t, name) => {
  await page.evaluate((t) => window.__tvguide.setTime(t), t);
  const data = await page.evaluate(() => document.getElementById('outputCanvas').toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data.split(',')[1], 'base64'));
};
await shot(0, 'frame_t0.png');
await shot(12, 'frame_t12.png');
await shot(info.timing.tExec - 0.4, 'frame_boundary_before.png');
await shot(info.timing.tExec + 0.2, 'frame_boundary_after.png');
await shot(TOTAL - 0.1, 'frame_end.png');
await page.screenshot({ path: path.join(OUT, 'ui.png') });
pass('reference frames written to test/out');

// 9. 5-second MP4 export via the in-memory fallback
{
  const res = await page.evaluate(async () => {
    window.showSaveFilePicker = undefined;
    const captured = [];
    window.downloadBlob = (blob, name) => captured.push({ blob, name });
    await window.__tvguide.exportMP4(5);
    const out = { status: document.getElementById('exportStatus').textContent, files: [] };
    for (const c of captured) {
      const buf = new Uint8Array(await c.blob.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      out.files.push({ name: c.name, b64: btoa(bin) });
    }
    return out;
  });
  console.log('EXPORT', res.status);
  const mp4 = res.files.find((f) => f.name.endsWith('.mp4')), json = res.files.find((f) => f.name.endsWith('.layout.json'));
  if (mp4 && json) {
    const mp4Path = path.join(OUT, 'test5s.mp4');
    fs.writeFileSync(mp4Path, Buffer.from(mp4.b64, 'base64'));
    fs.writeFileSync(path.join(OUT, 'test5s.layout.json'), Buffer.from(json.b64, 'base64'));
    const lj = JSON.parse(Buffer.from(json.b64, 'base64').toString('utf8'));
    const expectFrames = Math.round(5 * FPS);
    if (lj.videoWindow && lj.videoWindow.style === 'flush' && lj.videoWindow.fill === '#000000' && lj.sections.length === 2 && lj.seed === 1 && lj.frames === expectFrames && lj.output.fpsRational.num === 24000 && lj.output.fpsRational.den === 1001) pass('layout json contents'); else fail('layout json contents', JSON.stringify({ frames: lj.frames, out: lj.output }));
    try {
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,level,width,height,r_frame_rate,nb_frames,duration', '-of', 'json', mp4Path]).toString()).streams[0];
      console.log('FFPROBE', JSON.stringify(probe));
      if (probe.codec_name === 'h264' && probe.width === 3328 && probe.height === 2496 && probe.r_frame_rate === '24000/1001' && +probe.nb_frames === expectFrames && near(+probe.duration, expectFrames / FPS, 1e-3)) pass(`mp4: h264 3328x2496 24000/1001 fps ${expectFrames} frames ${(expectFrames / FPS).toFixed(3)}s`); else fail('mp4 probe', JSON.stringify(probe));
      // frame alignment: mp4 frame 61 should match canvas frame 61 far better than 60 or 62
      await shot(61 / FPS, 'canvas_61.png'); await shot(60 / FPS, 'canvas_60.png'); await shot(62 / FPS, 'canvas_62.png');
      const psnr = (n, png) => { const o = execFileSync('ffmpeg', ['-v', 'error', '-i', mp4Path, '-i', path.join(OUT, png), '-filter_complex', `[0:v]select=eq(n\\,${n}),format=rgb24[a];[1:v]format=rgb24[b];[a][b]psnr=stats_file=-`, '-f', 'null', '-']).toString(); return parseFloat((o.match(/psnr_avg:([\d.]+|inf)/) || [])[1]); };
      const p61 = psnr(61, 'canvas_61.png'), p60 = psnr(61, 'canvas_60.png'), p62 = psnr(61, 'canvas_62.png');
      console.log('PSNR mp4#61 vs canvas 60/61/62:', p60, p61, p62);
      if (p61 > 30 && p61 > p60 + 3 && p61 > p62 + 3) pass('mp4 frames align with render(t) (no off-by-one)'); else fail('frame alignment', `${p60} ${p61} ${p62}`);
    } catch (e) { console.log('ffprobe/ffmpeg not available or failed, skipping probe:', e.message.split('\n')[0]); }
  } else fail('mp4 export', res.status);
}

// 10. internal resolution (anamorphic 720x480 → 1920x1080)
{
  const r = await page.evaluate(async () => {
    const sel = document.querySelector('[data-setting="internalRes"]'); sel.value = '720x480'; sel.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 500));
    const { state } = window.__tvguide;
    const c = document.getElementById('outputCanvas');
    const out = { skin: [state.skin.width, state.skin.height], canvas: [c.width, c.height], stretch: state.skin.stretch, videoRect: JSON.parse(JSON.stringify(state.skin.videoRect)) };
    return out;
  });
  await shot(12, 'frame_t12_internal720x480.png');
  await page.evaluate(async () => { const sel = document.querySelector('[data-setting="internalRes"]'); sel.value = 'off'; sel.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 500)); });
  // 720x480 (3:2) rendered for a 4:3 output: horizontal sizes are pre-squeezed by stretch = (4/3)/(3/2) = 0.889 so the video window is 4:3 after upscale
  const outAspect = (r.videoRect.w / r.videoRect.h) * (r.canvas[0] / r.canvas[1]) / (r.skin[0] / r.skin[1]);
  if (r.skin[0] === 720 && r.skin[1] === 480 && r.canvas[0] === 3328 && near(r.stretch, (4 / 3) / (720 / 480), 1e-6) && near(outAspect, 4 / 3, 0.02)) pass('internal resolution: anamorphic 720x480 → 4:3 output keeps a 4:3 video window'); else fail('internal resolution', JSON.stringify({ ...r, outAspect }));
  // 16:9 output still works, uniformly scaled
  const r2 = await page.evaluate(async () => {
    const inp = document.querySelector('[data-setting="outputRes"]'); inp.value = '1920x1080'; inp.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 500));
    const { state } = window.__tvguide; const c = document.getElementById('outputCanvas');
    const out = { canvas: [c.width, c.height], stretch: state.skin.stretch, rowHeight: state.skin.rowHeight, tile: state.skin.channelTileWidth, frames: state.config.totalFrames };
    inp.value = '3328x2496'; inp.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 500));
    return out;
  });
  await shot(12, 'frame_t12_1080p.png');
  if (r2.canvas[0] === 1920 && r2.canvas[1] === 1080 && near(r2.stretch, 1) && r2.rowHeight === 88 && r2.tile === 220) pass('1920x1080 output: 1080p design sizes unchanged'); else fail('1080p output', JSON.stringify(r2));
}

// 10b. grid-only export region: output is the grid crop, rects stay full-frame, a real export has the cropped size
{
  const r = await page.evaluate(async () => {
    const set = async (k, v) => { const i = document.querySelector(`[data-setting="${k}"]`); i.value = v; i.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 500)); };
    await set('topArea', 'blank'); await set('videoFill', '#00ff00'); await set('exportRegion', 'grid');
    const { state, setTime } = window.__tvguide; const c = document.getElementById('outputCanvas'); const ctx = c.getContext('2d');
    setTime(1);
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    const out = { canvas: [c.width, c.height], crop: state.crop, full: state.fullOutput, topLeft: px(4, 1), mid: px(Math.round(c.width / 2), 40), anyGreen: false };
    const row = ctx.getImageData(0, 0, c.width, 1).data; for (let i = 0; i < row.length; i += 4) if (row[i] === 0 && row[i + 1] === 255 && row[i + 2] === 0) { out.anyGreen = true; break; }
    window.showSaveFilePicker = undefined; const captured = []; window.downloadBlob = (blob, name) => captured.push({ blob, name });
    await window.__tvguide.exportMP4(1);
    const mp4 = captured.find((f) => f.name.endsWith('.mp4')), json = captured.find((f) => f.name.endsWith('.layout.json'));
    const buf = new Uint8Array(await mp4.blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    out.mp4 = { name: mp4.name, b64: btoa(bin) }; out.json = JSON.parse(await json.blob.text());
    await set('exportRegion', 'full'); await set('topArea', 'normal'); await set('videoFill', '#000000');
    return out;
  });
  const j = r.json;
  console.log('GRIDCROP', JSON.stringify({ canvas: r.canvas, crop: r.crop, name: r.mp4.name, jsonOut: j.output, gridViewport: j.gridViewport }));
  const okGeom = r.canvas[0] === 3328 && r.canvas[1] === 1372 && r.crop && r.crop.y === 1124 && r.crop.h === 1372 && r.canvas[1] % 2 === 0 && !r.anyGreen && r.mp4.name.includes('_grid_3328x1372');
  const okJson = j.output.region === 'grid' && j.output.width === 3328 && j.output.height === 1372 && j.output.fullFrame.height === 2496 && j.output.crop.y === 1124 && j.gridViewport.y === 1124 && j.gridViewport.h === 1372;
  if (okGeom && okJson) pass('grid-only region: 3328x1372 crop at y 1124, no top-area pixels, JSON rects in full-frame px'); else fail('grid-only region', JSON.stringify({ canvas: r.canvas, crop: r.crop, anyGreen: r.anyGreen, name: r.mp4.name, out: j.output, gv: j.gridViewport }));
  const gridPath = path.join(OUT, 'test_grid.mp4'); fs.writeFileSync(gridPath, Buffer.from(r.mp4.b64, 'base64'));
  try {
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames,r_frame_rate', '-of', 'json', gridPath]).toString()).streams[0];
    if (probe.width === 3328 && probe.height === 1372 && +probe.nb_frames === Math.round(FPS) && probe.r_frame_rate === '24000/1001') pass('grid-only mp4: 3328x1372 @ 24000/1001'); else fail('grid-only mp4 probe', JSON.stringify(probe));
  } catch (e) { console.log('ffprobe skipped:', e.message.split('\n')[0]); }
  await shot(12, 'frame_t12_after_grid_test.png');
}

// 11a. banner library: colours, image, queue order, height, export/import roundtrip
{
  const r = await page.evaluate(async () => {
    const T = window.__tvguide;
    const c = document.createElement('canvas'); c.width = 4; c.height = 4; const cx = c.getContext('2d'); cx.fillStyle = '#ff0000'; cx.fillRect(0, 0, 4, 4);
    const red = c.toDataURL('image/png');
    await T.persistBannerPreset(T.newBannerPreset({ id: 'test-solid', name: 'Solid test', text: 'HELLO|WORLD', fill: '#123456', light: '#123456', dark: '#123456', textColor: '#ffffff', heightScale: 1.5 }));
    await T.persistBannerPreset(T.newBannerPreset({ id: 'test-image', name: 'Image test', text: '', imageDataUrl: red, imageName: 'red.png', imageFit: 'stretch' }));
    T.setBannerQueue(['test-image', 'test-solid', 'test-image']);
    await new Promise((res) => setTimeout(res, 800));
    const { state } = T; const S = state.skin; const L = state.layout;
    const banners = L.rows.filter((x) => x.type === 'banner');
    const order = banners.slice(0, 4).map((x) => x.presetId);
    const solidRow = banners.find((x) => x.presetId === 'test-solid'), imageRow = banners[0];
    const canvas = document.getElementById('outputCanvas'); const ctx = canvas.getContext('2d');
    // scroll so a given banner row's top sits 10px under the locked header, then sample inside it (defaults: no crop, no upscale)
    const show = (row) => { T.renderFrame((row.y - S.headerHeight - 10) / state.timing.vExec); return S.gridRect.y + S.headerHeight + 10; };
    let top = show(imageRow); const imgPx = Array.from(ctx.getImageData(Math.round(canvas.width / 2), Math.round(top + imageRow.height / 2), 1, 1).data);
    top = show(solidRow); const solidPx = Array.from(ctx.getImageData(80, Math.round(top + S.gap + S.bevel * 2 + 12), 1, 1).data);
    const json = JSON.parse(JSON.stringify(T.bannerLibraryJSON(state.bannerQueue)));
    await T.deleteBannerPreset('test-solid');
    const gone = !T.bannerLib.presets.has('test-solid');
    const q = await T.importBannerLibrary(json);
    const back = T.bannerLib.presets.get('test-solid');
    return { order, heights: { solid: solidRow.height, image: imageRow.height, base: S.bannerHeight }, imgPx, solidPx, storage: T.bannerLib.storage, gone, roundtrip: !!back && back.fill === '#123456' && back.text === 'HELLO|WORLD', importedQueue: q, lines: solidRow.banner.lines.map((l) => l.text), presetCount: T.bannerLib.presets.size };
  });
  console.log('BANNERS', JSON.stringify(r));
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const ok = r.order.join() === 'test-image,test-solid,test-image,test-image' && r.heights.solid === Math.round(r.heights.base * 1.5) && r.heights.image === r.heights.base
    && eq(r.imgPx, [255, 0, 0, 255]) && eq(r.solidPx, [0x12, 0x34, 0x56, 255]) && r.gone && r.roundtrip && r.importedQueue.queue.join() === 'test-image,test-solid,test-image' && r.lines.join('|') === 'HELLO|WORLD';
  if (ok) pass(`banner library: queue order, height ×1.5, solid colour, image, export/import roundtrip (${r.storage})`); else fail('banner library', JSON.stringify(r));
  await shot(await page.evaluate(() => { const { state } = window.__tvguide; const b = state.layout.rows.find((x) => x.type === 'banner'); return (b.y - state.skin.headerHeight - 40) / state.timing.vExec; }), 'frame_banner_image.png');
}

// 11b. banner presets persist across a reload (settings are cleared by the test harness, presets must not be)
{
  await page.reload();
  await page.waitForFunction(() => window.__tvguide && window.__tvguide.state.layout, { timeout: 20000 });
  const r = await page.evaluate(() => { const T = window.__tvguide; return { has: T.bannerLib.presets.has('test-solid') && T.bannerLib.presets.has('test-image'), storage: T.bannerLib.storage, queue: T.state.bannerQueue }; });
  if (r.has && r.storage === 'indexeddb' && r.queue.join() === 'default-logo,default-patreon') pass('banner presets persist across reload in IndexedDB; queue comes from settings'); else fail('banner persistence', JSON.stringify(r));
  await page.evaluate(async () => { const T = window.__tvguide; await T.deleteBannerPreset('test-solid'); await T.deleteBannerPreset('test-image'); });
}

// 11c. look: bevel size and box colours are settings
{
  const r = await page.evaluate(async () => {
    const T = window.__tvguide;
    const set = async (k, v) => { const i = document.querySelector(`[data-setting="${k}"]`); i.value = v; i.dispatchEvent(new Event('input')); await new Promise((res) => setTimeout(res, 500)); };
    const before = T.state.skin.bevel;
    await set('bevelPx', '9'); await set('colExecCellFill', '#ff00ff'); await set('colExecTileFill', '#00ffff');   // the start shows exec rows (per-tier colours)
    T.setTime(1);   // after the default 12-frame load-in, still inside the 24-frame hold (same layout as t = 0)
    const S = T.state.skin; const ctx = document.getElementById('outputCanvas').getContext('2d');
    const rowTop = S.gridRect.y + S.headerHeight;
    const cellPx = Array.from(ctx.getImageData(S.channelTileWidth + 40, rowTop + S.rowHeight - S.gap - S.bevel - 6, 1, 1).data);   // bottom-left of the first cell, below any text
    const tilePx = Array.from(ctx.getImageData(S.bevel + 6, rowTop + Math.round(S.rowHeight / 2), 1, 1).data);                 // left edge of the tile, mid-height
    const out = { before, after: S.bevel, unit: S.unit, cellPx, tilePx, keys: T.LOOK_KEYS.length };
    T.resetLook(); await new Promise((res) => setTimeout(res, 500));
    out.reset = T.state.skin.bevel === before && document.querySelector('[data-setting="colExecCellFill"]').value === '#0c1359';
    return out;
  });
  console.log('LOOK', JSON.stringify(r));
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (r.after === Math.round(9 * r.unit) && r.after > r.before && eq(r.cellPx, [255, 0, 255, 255]) && eq(r.tilePx, [0, 255, 255, 255]) && r.reset && r.keys === 26) pass('look: bevel size + cell/tile colours apply, reset restores defaults'); else fail('look', JSON.stringify(r));
}

// 11. CSV import mapping
{
  const r = await page.evaluate(() => {
    const T = window.__tvguide;
    T.loadCSVText('Name,Email,Patron Status,Tier\n"Smith, Jane",a@x.com,Active patron,Executive Producer\nBob,b@x.com,Former patron,Executive Producer\n"Quote ""Q"" Man",c@x.com,Active patron,Producer\nDee,d@x.com,Active patron,Producer\nEve,e@x.com,Active patron,Free member\n');
    const active = T.csvSelection();
    document.getElementById('csvActiveOnly').checked = false;
    const all = T.csvSelection();
    return { active, all, execTier: decodeURIComponent(document.getElementById('csvExecTier').value) };
  });
  // the producer tier is picked explicitly, so the "Free member" (Eve) is not credited
  if (r.execTier === 'Executive Producer' && r.active.exec.join() === 'Smith, Jane' && r.active.prod.length === 2 && !r.active.prod.includes('Eve') && r.all.exec.length === 2 && r.active.prod.includes('Quote "Q" Man')) pass('csv detection, tier mapping, active filter'); else fail('csv', JSON.stringify(r));
  const sm = await page.evaluate(() => {
    const T = window.__tvguide;
    T.loadCSVText('Name,Patron Status,Tier\nA,Active patron,Funnier Brother\nB,Active patron,Funnier Brother\nC,Active patron,Funnier Brother\nD,Active patron,Funniest Brother\nE,Active patron,Free\n');
    return { exec: decodeURIComponent(document.getElementById('csvExecTier').value), prod: decodeURIComponent(document.getElementById('csvProdTier').value), sel: T.csvSelection() };
  });
  if (sm.exec === 'Funniest Brother' && sm.prod === 'Funnier Brother' && sm.sel.exec.join() === 'D' && sm.sel.prod.join() === 'A,B,C') pass('csv: Funniest Brother → exec, Funnier Brother → producers (even when producers are the bigger tier)'); else fail('csv supermega tiers', JSON.stringify(sm));
}

// 13. blocks, opening header, hold, load-in and pixel text
{
  const r = await page.evaluate(async () => {
    const T = window.__tvguide;
    const set = (k, v) => { const i = document.querySelector(`[data-setting="${k}"]`); if (i.type === 'checkbox') i.checked = v; else i.value = v; };
    set('openingHeader', true); set('openingHeaderText', 'EPISODE 1'); set('startHoldFrames', 48); set('loadInFrames', 24); set('execBannerEvery', 6);
    T.state.bannerQueue = ['default-block-promo'];
    T.setFixedBlocks([{ id: 'default-logo', at: 'between' }]);
    await T.rebuild();
    const { state, scrollAt, headerPositions } = T;
    const L = state.layout, tm = state.timing, S = state.skin;
    const kinds = L.headers.map((h) => h.kind);
    const prodIdx = L.sections.find((s) => s.key === 'prod').headerIndex;
    const betweenRow = L.rows.find((r) => r.type === 'banner' && r.section === 'exec' && r.y > L.headers[prodIdx].naturalY - 1000 && r.y < L.headers[prodIdx].naturalY);
    // the first block header locks, then is pushed out by the resumed section header
    const blk = L.headers.findIndex((h) => h.kind === 'block');
    const sAt = (s) => [headerPositions(L, S, s)[blk], headerPositions(L, S, s)[blk + 1]];
    const locked = sAt(L.headers[blk].naturalY + 10), pushed = sAt(L.headers[blk + 1].naturalY);
    const reveal = [T.loadInAt(0), T.loadInAt(12 / state.config.fps), T.loadInAt(24 / state.config.fps)];
    const c = document.getElementById('outputCanvas'); const ctx = c.getContext('2d');
    set('textRender', 'pixel'); set('textPixelScale', 2); await T.rebuild();
    const hash = () => { const d = ctx.getImageData(0, 0, c.width, c.height).data; let h = 0x811c9dc5; for (let i = 0; i < d.length; i += 11) { h ^= d[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
    T.renderFrame(30); const h1 = hash(); T.renderFrame(31); T.clearTextCache(); T.renderFrame(30); const h2 = hash();
    const out = {
      first: kinds[0], hasResume: kinds.includes('resume'), betweenBanner: !!betweenRow,
      holdS0: scrollAt(tm, tm.tHold * 0.5) === tm.sStart, hold: tm.tHold, endExact: Math.abs(scrollAt(tm, tm.total) - tm.sEnd) < 1e-6, totalOk: Math.abs(tm.tExec + tm.tProd - tm.total) < 1e-9,
      lockedAtL: locked[0] === S.gridRect.y, pushedOut: pushed[0] === S.gridRect.y - S.headerHeight && pushed[1] === S.gridRect.y,
      reveal, pixelDeterministic: h1 === h2,
    };
    for (const [k, v] of Object.entries({ openingHeader: false, startHoldFrames: 0, loadInFrames: 0, execBannerEvery: 12, textRender: 'smooth', textPixelScale: 1 })) set(k, v);
    T.state.bannerQueue = ['default-logo', 'default-patreon']; T.setFixedBlocks([]); await T.rebuild();
    return out;
  });
  const ok = r.first === 'opening' && r.hasResume && r.betweenBanner && r.holdS0 && Math.abs(r.hold - 48 / (24000 / 1001)) < 1e-9 && r.endExact && r.totalOk && r.lockedAtL && r.pushedOut
    && r.reveal[0].boxes === 0 && r.reveal[0].content === 0 && r.reveal[1].boxes > 0 && r.reveal[2] === null && r.pixelDeterministic;
  if (ok) pass('blocks lock + push-out, opening header, hold keeps total, load-in stages, pixel text deterministic'); else fail('blocks / hold / load-in / pixel', JSON.stringify(r));
}

// 14. easing: smooth ramp after the hold and through the section change, totals still exact; sub-pixel motion is deterministic
{
  const r = await page.evaluate(async () => {
    const T = window.__tvguide;
    const set = (k, v) => { const i = document.querySelector(`[data-setting="${k}"]`); i.value = v; };
    for (const [k, v] of Object.entries({ speedRatio: 0.7, startHoldFrames: 24, easeInFrames: 36, sectionEaseFrames: 48, easeInCurve: 'sine', sectionEaseCurve: 'smoother', scrollMotion: 'subpixel' })) set(k, v);
    await T.rebuild();
    const tm = T.state.timing, fps = T.state.config.fps;
    const steps = Array.from({ length: 90 }, (_, n) => T.scrollAt(tm, (n + 1) / fps) - T.scrollAt(tm, n / fps));
    const ramp = steps.slice(24, 60);
    const c = document.getElementById('outputCanvas'), ctx = c.getContext('2d');
    const hash = () => { const d = ctx.getImageData(0, 0, c.width, c.height).data; let h = 0x811c9dc5; for (let i = 0; i < d.length; i += 13) { h ^= d[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
    T.renderFrame(40 / fps); hash(); T.renderFrame(40 / fps); const h1 = hash(); T.renderFrame(77 / fps); T.renderFrame(40 / fps); const h2 = hash();
    return {
      held: steps.slice(0, 23).every((d) => d === 0), rampRises: ramp.every((d, i) => i === 0 || d >= ramp[i - 1] - 1e-9), reachesCruise: Math.abs(steps[70] - tm.vExec / fps) < 1e-6,
      endExact: Math.abs(T.scrollAt(tm, tm.total) - tm.sEnd) < 1e-6, boundaryExact: Math.abs(T.scrollAt(tm, tm.tExec) - tm.boundaryS) < 1e-6,
      changeSmooth: Math.abs(T.speedAt(tm, tm.ease.t2 + 1e-7) - tm.vExec) < 1e-3 && Math.abs(T.speedAt(tm, tm.ease.t3 - 1e-7) - tm.v) < 1e-3, ratio: tm.vExec / tm.v,
      subpixelDeterministic: h1 === h2,
    };
  });
  if (r.held && r.rampRises && r.reachesCruise && r.endExact && r.boundaryExact && r.changeSmooth && Math.abs(r.ratio - 0.7) < 1e-9 && r.subpixelDeterministic) pass('easing: hold, smooth ramp to cruise, smooth section speed change, exact totals; sub-pixel motion deterministic'); else fail('easing', JSON.stringify(r));
}

// 15. "by part" copies stay in sync with the real controls; shadow/stroke switches; sticky banners lock like headers
{
  const r = await page.evaluate(async () => {
    const T = window.__tvguide;
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const copy = document.querySelector('#partsView [data-setting="colExecCellFill"]');
    copy.value = '#123456'; copy.dispatchEvent(new Event('input', { bubbles: true }));
    await T.rebuild();
    const primaryFollows = document.querySelector('[data-setting="colExecCellFill"]:not([data-mirror])').value === '#123456' && T.state.config.colExecCellFill === '#123456';
    const sw = document.querySelector('#textFxMatrix [data-setting="txStrokeOnTile"]'); sw.click(); await T.rebuild();
    const strokeOn = T.state.config.txStrokeOnTile === true && !!T.state.skin.textStyles.tile.stroke && T.state.skin.textStyles.tile.stroke.alpha === 1;
    sw.click(); await T.rebuild();
    const strokeOff = !T.state.skin.textStyles.tile.stroke;
    const p = T.bannerLib.presets.get('default-logo'); p.sticky = true; await T.persistBannerPreset(p);
    T.setBannerQueue(['default-logo']); await T.rebuild();
    const { layout, skin } = T.state, L = skin.gridRect.y;
    const i = layout.headers.findIndex((h) => h.kind === 'banner'), h = layout.headers[i], next = layout.headers[i + 1];
    const locked = T.headerPositions(layout, skin, (h.naturalY + next.naturalY) / 2)[i] === L;
    const pushed = T.headerPositions(layout, skin, next.naturalY)[i] === L - h.height;
    p.sticky = false; await T.persistBannerPreset(p); T.setBannerQueue(['default-logo', 'default-patreon']); await T.rebuild();
    return { dupIds: ids.length - new Set(ids).size, primaryFollows, strokeOn, strokeOff, sticky: i >= 0, locked, pushed };
  });
  if (r.dupIds === 0 && r.primaryFollows && r.strokeOn && r.strokeOff && r.sticky && r.locked && r.pushed) pass('"by part" copies sync both ways, shadow/stroke switches, sticky banner locks then gets pushed out'); else fail('parts / switches / sticky', JSON.stringify(r));
}

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
