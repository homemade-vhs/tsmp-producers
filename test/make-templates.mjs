// Generates the 1:1 design templates in templates/ from the tool's live layout (a fresh browser profile = the defaults).
//   cd test && npm install && node make-templates.mjs
import puppeteer from 'puppeteer'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(P, 'templates');
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: true, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tvguide-templates-')) });
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + encodeURI(path.join(P, 'tvguide-credits.html')));
await page.waitForFunction(() => window.__tvguide && window.__tvguide.state.layout);
const files = await page.evaluate(async () => {
  const T = window.__tvguide, Sk = T.state.skin, g = Sk.gridRect, b = Sk.bevel, gap = Sk.gap;
  const W = Sk.width, topH = g.y, V = Sk.videoRect, PR = Sk.promoRect;
  const font = (px, w = 700) => `${w} ${px}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const out = {};
  const label = (x, text, cx, cy, px = 11, align = 'center') => {
    x.font = font(px); x.textAlign = align; x.textBaseline = 'middle';
    const tw = x.measureText(text).width, pad = 4;
    const bx = align === 'center' ? cx - tw / 2 - pad : align === 'left' ? cx - pad : cx - tw - pad;
    x.fillStyle = 'rgba(0,0,0,0.72)'; x.fillRect(Math.round(bx), Math.round(cy - px / 2 - 3), Math.ceil(tw + pad * 2), px + 6);
    x.fillStyle = '#fff'; x.fillText(text, cx, cy + 0.5);
  };
  const dashed = (x, r, color, dash = [4, 3]) => { x.save(); x.strokeStyle = color; x.lineWidth = 1; x.setLineDash(dash); x.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); x.restore(); };
  const border = (x, w, h, color = '#ff3df2') => { x.strokeStyle = color; x.lineWidth = 1; x.setLineDash([]); x.strokeRect(0.5, 0.5, w - 1, h - 1); };
  const centre = (x, w, h) => { x.save(); x.strokeStyle = 'rgba(255,61,242,0.45)'; x.setLineDash([2, 4]); x.beginPath(); x.moveTo(Math.floor(w / 2) + 0.5, 0); x.lineTo(Math.floor(w / 2) + 0.5, h); x.moveTo(0, Math.floor(h / 2) + 0.5); x.lineTo(w, Math.floor(h / 2) + 0.5); x.stroke(); x.restore(); };
  const save = (name, c) => { out[name] = c.toDataURL('image/png'); };

  // ---- top background ----
  const topMarks = (x) => {
    x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(V.x, V.y, V.w, V.h);
    x.save(); x.beginPath(); x.rect(V.x, V.y, V.w, V.h); x.clip(); x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 1; for (let i = -V.h; i < V.w; i += 10) { x.beginPath(); x.moveTo(V.x + i, V.y + V.h); x.lineTo(V.x + i + V.h, V.y); x.stroke(); } x.restore();
    dashed(x, V, '#ffd24a');
    label(x, `VIDEO WINDOW ${V.w}×${V.h}`, V.x + V.w / 2, V.y + V.h / 2 - 9);
    label(x, 'covered by the podcast footage', V.x + V.w / 2, V.y + V.h / 2 + 9, 10);
    dashed(x, PR, '#3fd0d4');
    label(x, `PROMO TEXT AREA ${PR.w}×${PR.h} (x ${PR.x}, y ${PR.y})`, PR.x + PR.w / 2, PR.y + 12, 10);
    label(x, 'promo lines are drawn centred in here', PR.x + PR.w / 2, PR.y + PR.h - 12, 10);
    border(x, W, topH); label(x, `TOP BACKGROUND ${W}×${topH} · 1:1`, W - 6, topH - 10, 10, 'right');
  };
  { const c = mk(W, topH); const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, Sk.height); gr.addColorStop(0, Sk.colors.bgTop); gr.addColorStop(1, Sk.colors.bgBottom); x.fillStyle = gr; x.fillRect(0, 0, W, topH); save(`top-background_${W}x${topH}_blank.png`, c); topMarks(x); save(`top-background_${W}x${topH}_guides.png`, c); }
  { const c = mk(W, topH); topMarks(c.getContext('2d')); save(`top-background_${W}x${topH}_overlay.png`, c); }

  // ---- banners, at each height ----
  const ts = Sk.textStyles.banner;
  for (const scale of [0.5, 1, 1.5, 2]) {
    const rowH = Math.max(Math.round(Sk.rowHeight * 0.5), Math.round(Sk.bannerHeight * scale));
    const box = Sk.boxRect({ x: 0, y: 0, w: g.w, h: rowH });
    const iw = box.w - 2 * b, ih = box.h - 2 * b;
    const tb = Sk.textBox('banner', box);   // where banner TEXT goes (if you also type text in the preset)
    const text = { x: tb.x - box.x - b, y: tb.y - box.y - b, w: tb.w, h: tb.h };
    const tag = `banner-x${scale}_${iw}x${ih}`;
    const marks = (x) => {
      border(x, iw, ih); centre(x, iw, ih);
      if (text.w > 20 && text.h > 8) dashed(x, text, '#3fd0d4', [3, 3]);
      label(x, `BANNER IMAGE ${iw}×${ih} · 1:1 (height ×${scale})`, iw / 2, Math.min(ih / 2, 14), 10);
      if (ih >= 60) label(x, 'dashed = where banner text goes, if the preset has text', iw / 2, ih - 12, 10);
    };
    { const c = mk(iw, ih); const x = c.getContext('2d'); x.fillStyle = '#182080'; x.fillRect(0, 0, iw, ih); save(`${tag}_blank.png`, c); marks(x); save(`${tag}_guides.png`, c); }
    { const c = mk(iw, ih); marks(c.getContext('2d')); save(`${tag}_overlay.png`, c); }
  }

  // ---- full-frame reference: a real render with the zones outlined ----
  T.state.bannerQueue = ['default-logo', 'default-patreon']; await T.rebuild();
  const st = T.state, row = st.layout.rows.find((r) => r.type === 'banner');
  let lo = 0, hi = st.timing.total; const target = row.y - st.skin.headerHeight - 30;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (T.scrollAt(st.timing, m) < target) lo = m; else hi = m; }
  T.renderFrame(hi);
  const src = document.getElementById('outputCanvas');
  { const c = mk(src.width, src.height); const x = c.getContext('2d'); x.drawImage(src, 0, 0); save(`full-frame_${src.width}x${src.height}_render.png`, c);
    const s = T.scrollAt(st.timing, hi), by = Math.round(g.y + row.y - s);
    dashed(x, { x: 0, y: 0, w: W, h: topH }, '#ff3df2', []); label(x, `top background ${W}×${topH}`, W - 6, topH - 12, 11, 'right');
    dashed(x, V, '#ffd24a'); label(x, `video window ${V.w}×${V.h}`, V.x + V.w / 2, V.y + V.h / 2);
    dashed(x, PR, '#3fd0d4'); label(x, `promo text ${PR.w}×${PR.h}`, PR.x + PR.w / 2, PR.y + 14);
    const ib = { x: g.x + b, y: by + gap + b, w: g.w - gap - 2 * b, h: row.height - 2 * gap - 2 * b };
    dashed(x, ib, '#ff3df2', []); label(x, `banner image ${ib.w}×${ib.h}`, ib.x + ib.w / 2, ib.y + 12);
    dashed(x, g, '#4fd68a'); label(x, `scrolling grid ${g.w}×${g.h}`, 8, g.y + g.h - 12, 11, 'left');
    save(`full-frame_${src.width}x${src.height}_annotated.png`, c); }
  return out;
});
for (const [name, url] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(files).join('\n')); console.log(errs.join('\n') || 'no errors');
await browser.close();
