# TV Guide Credits Scroller — Project Brief

Read this whole file and look at everything in `refs/` before writing any code.

## What this is

A browser-based tool that renders our podcast's Patreon credits as a late-90s / early-2000s cable "TV Guide Channel" listings grid, then exports the result as a video file we drop into Premiere. It replaces a simpler web page we currently screen-record.

Two groups of names scroll through the grid in sequence: **Executive Producers** (~300 names) and then **Podcast Producers** (~1,000+ names). The whole thing must fit an exact duration we choose (e.g. 180 seconds).

This first pass is a **greybox**: every visual element is drawn procedurally in canvas with an approximate palette so we can judge pacing and motion. Designed PNG assets and a real font come later and must drop in without rewriting the layout or export code.

## Reference look

- `refs/tvguide-*.png` — the target aesthetic. Bottom ~55% of the frame is the listings grid: a header bar with a live digital clock on the left, then rows. Each row has a channel tile at the left (number stacked over a short callsign) followed by beveled rectangular cells containing bold condensed text with a dark drop shadow. Background is deep blue. Occasionally a row is a single full-width "banner" (network logo, promo). Top ~45% is an ad/promo area: video on the left, promo text panel on the right.
- `refs/supermega-win95.png` — our *current* credits design, for tone: a fake interface with the podcast footage still visible and a patreon.com/supermega plug. We're replacing the look; the spirit stays.

Greybox palette (approximate is fine): royal/navy blue background, darker navy cells with a lighter bevel edge, white or pale-yellow text, red channel tiles.

## Deliverable

- `tvguide-credits.html` — one file, vanilla HTML/CSS/JS, no framework, no build step. Opens in Chrome or Edge.
- `lib/` — vendored third-party JS (the MP4 muxer). No CDN dependency at runtime.
- `assets/` — placeholders only for now; later holds PNGs, a font, banner images, and `assets/manifest.json` describing them.
- `README.md` — how to run, how to export, how to swap in assets.

Organize the JS in clearly labeled sections: config → parsing → layout → skin/drawing → `render(t)` → preview → export → UI wiring. Small functions, no giant closures. Later changes will be made as targeted edits, so structure for that.

## Core architecture (non-negotiable)

1. **Layout is computed once.** Parsing names, choosing channel labels, inserting banners, measuring text — all of it happens in `buildLayout(config)`, which produces a flat array of rows, each with an absolute `y` (content pixels) and `height`, plus the section headers with their natural positions. Nothing random or measured happens after this step.
2. **`render(ctx, t)` is a pure function of time.** Given the layout and a time `t` in seconds, it computes the scroll position `s(t)`, draws exactly one frame, and returns. No animation state, no wall clock, no `Math.random()`. Calling `render(t)` twice for the same `t` must produce identical pixels.
3. **Preview and export share `render(t)`.** Preview drives it with `requestAnimationFrame` at real time; export drives it with a fixed step `t = n / fps`. This guarantees the exported video matches the preview and that nothing can drop a frame.
4. **All randomness is seeded.** Use a small seeded PRNG (mulberry32 or similar) initialized from a `seed` setting (we'll use the episode number). Same inputs + same seed = identical layout, forever.

## The grid

**Sections.** Two, in order: Executive Producers, then Podcast Producers. Each has a `namesPerRow` (exec default 2, must also support 1; producers default 3, must also support 4), a header bar, and its list of names.

**Rows.** An ordinary row is: channel tile + `namesPerRow` cells. Cells are fixed-width columns dividing the available row width evenly (like the reference, where columns are half-hour slots). One name per cell.

**Banner rows.** Every `bannerEveryNRows` rows (default 12, configurable per section, 0 disables), insert a banner row: full width, taller than a normal row (~2× default), no channel tile. Banners cycle through a configurable list. Greybox banner = a big centered text string; defaults: a "TV GUIDE"-style placeholder logo and "sign up at patreon.com/supermega". Later a banner can be an image from `assets/`.

**Channel tiles.** Channel numbers count upward from `channelStart` (default 2) like a real lineup. Channel *names* are drawn randomly (seeded) from a user-supplied list, no repeats until the list is exhausted, then reshuffle. Banner rows and header bars don't consume a channel number.

**Text fitting.** Names can be long ("AAA Roadside Assistance") or contain emoji / non-Latin characters; render them as-is. If a name doesn't fit its cell: shrink the font down to a minimum (default 75% of normal), then truncate with an ellipsis. Measure with `ctx.measureText` only after the font has loaded (`document.fonts.load` / `FontFace`). Layout must never run before the font is ready or widths will be wrong.

**Visible area.** The grid viewport is a rectangle defined by the skin (for 1920×1080, roughly the bottom 55% of the frame). Only draw rows that intersect it. Rows clip to the viewport so they slide in from the bottom and disappear under the header bar.

## Header bar — the "lock" behavior

Each section's header bar is part of the scrolling content: it sits just above its section's first row and scrolls upward with everything else. When it reaches the lock line (top of the grid viewport) it stops and stays while its rows keep scrolling underneath. When the *next* section's header scrolls up and reaches the lock line, it pushes the previous header up and out and takes its place.

Sticky header with push-out. With content coordinates (0 = top of content), lock line `L`, header height `H`, scroll `s`, and header `i` at natural position `P_i`:

```
y_i = max(L, L + P_i - s)          // scroll up with the content, then lock
y_i = min(y_i, y_{i+1} - H)        // ...but get pushed out by the next header
```

Draw rows first, then headers on top.

At `t = 0` the first header is already locked with the first rows directly beneath it — it should look like we tuned into the channel mid-scroll, not like an empty screen filling up. Make this a setting anyway: `leadIn: "locked" | "scrollIn"`.

Header contents: a live digital clock at the left (`H:MM:SS`, 12-hour — matches the reference) and the section title ("EXECUTIVE PRODUCERS" / "PODCAST PRODUCERS") where the reference shows time slots. The clock starts at `clockStart` (default 10:02:07; we'll set it to the episode's post time) and advances with `t`, never with the wall clock.

## Timing

Settings: `totalSeconds` (default 180), `fps` (24 / 30 / 60 — must match our Premiere sequence; default 30), `speedRatio` (default 1.0), `endBehavior` (`scrollOff` default: the last row's bottom edge passes the bottom of the locked header exactly at `t = totalSeconds`; or `stopAtEnd`: the last row parks at the bottom of the viewport).

`s(t)` is piecewise linear. Let `D_e` be the scroll distance covered while the Executive section is current (from `s = 0` until the Producers header locks) and `D_p` the remainder. Execs scroll at `speedRatio × v`, producers at `v`:

```
totalSeconds = D_e / (speedRatio · v) + D_p / v
→ v = (D_e / speedRatio + D_p) / totalSeconds
```

The total always lands exactly on `totalSeconds` regardless of ratio. `speedRatio = 1` is one constant speed. An instantaneous speed change at the boundary is fine for v1.

**Pacing readout.** The UI must show, updating live as settings change: rows per section, rows per second per section, seconds each row spends on screen, and how long each section runs. We will tune by this readout — it matters as much as the render.

## The top half: video window and promo panel

- **Video window** (top-left): solid black with a thin frame. Print its exact output-pixel rect (`x, y, w, h`) in the stats panel. We composite the actual podcast footage over this box in Premiere. Never try to load video into the page.
- **Promo panel** (top-right): a list of text panels (later PNGs) that hard-cut between each other every `promoIntervalSeconds` (default 10). Greybox defaults: "TO BECOME A PRODUCER / patreon.com/supermega" and the placeholder logo. Deterministic — which panel shows depends only on `t`.

## Input

Three textareas — Executive Producers, Podcast Producers, Channel Names — one entry per line. Trim whitespace, drop blanks, keep duplicates (two patrons can share a name). A `sort` toggle (default off) sorts case-insensitively; our lists usually arrive pre-sorted.

Also accept a Patreon members CSV (drag-drop or file picker). Detect the name and tier columns by header text containing "name" / "tier" (fall back to letting us pick columns), let us map tier → section with two dropdowns, and if a status column exists offer an "active only" filter. Populate the textareas from that.

Ship a "load test data" button that generates ~320 exec names and ~1,050 producer names (numbered names plus a sprinkling of very long names, emoji, and non-Latin scripts) and ~40 fake channel callsigns.

## Rendering & resolution

Canvas 2D. Output resolution: 1920×1080 default, 3840×2160 option. Also an `internalResolution` option (e.g. 720×480 or 640×480): render to a small offscreen canvas at that size, then upscale onto the output canvas with smoothing on, for a cheap authentic soft-SD look. Default off.

Text gets a dark drop shadow (offset ~2px, little or no blur) like the reference.

## Skin layer — how designed assets swap in later

All drawing goes through a `skin` object: `drawBackground`, `drawVideoWindow`, `drawPromoPanel`, `drawHeader`, `drawChannelTile`, `drawCell`, `drawBanner`, plus layout constants (`gridRect`, `headerHeight`, `rowHeight`, `bannerHeight`, `channelTileWidth`, fonts). `GreyboxSkin` draws everything procedurally. Structure it so an `AssetSkin` can later load PNGs and a font from `assets/manifest.json` and draw cells as fixed-size images (one per column width) or 9-slice, without touching layout, `render(t)`, preview, or export.

## Preview

Play / pause, a scrubber to seek to any `t`, frame-step with arrow keys, and a `t` / frame-number readout. Preview renders to a scaled-down on-screen canvas at real time via `requestAnimationFrame`; dropped preview frames are fine and never affect export.

## Export

**MP4 (primary).** Frame-by-frame, never real-time:

```
for n in 0 .. totalSeconds·fps − 1:
    render(ctx, n / fps)
    submit frame with timestamp = round(n · 1e6 / fps) µs, duration = round(1e6 / fps) µs
    keyframe every 2 seconds
    await encoder backpressure; yield to the UI every few frames so progress updates
```

- Encoding: WebCodecs `VideoEncoder`, H.264 (`avc1.*`). Check `VideoEncoder.isConfigSupported` and choose a profile/level valid for the resolution + fps (1080p60 needs Level 4.2; 4K30 needs 5.1, 4K60 needs 5.2). Prefer hardware acceleration. High bitrate — default 40 Mbps at 1080p, 100 Mbps at 4K. This is an intermediate Premiere will re-encode, so err toward too high.
- Muxing: use **Mediabunny** (`npm: mediabunny`, mediabunny.dev — it supersedes the deprecated `mp4-muxer`). It also has a canvas video source that handles the `VideoEncoder` plumbing; use that if it fits, otherwise wire `VideoEncoder` manually and feed the muxer. Vendor it into `lib/`.
- Stream output to disk via the File System Access API (`showSaveFilePicker`) so a long render never sits in memory; fall back to an in-memory blob + download link if the picker is unavailable.
- Progress bar: frames done / total, elapsed, estimated remaining, cancel.
- "Export 5-second test" button — renders only the first 5 seconds so we can check Premiere import without waiting on a full render.
- Do **not** use `MediaRecorder` / `canvas.captureStream()`. They're real-time and can drop frames.

**PNG sequence (secondary).** Same loop, but `canvas.toBlob('image/png')` per frame written as `frame_00000.png`… into a folder chosen with `showDirectoryPicker`. This is the lossless / alpha path. Include a toggle that makes the video window and background transparent for this mode.

**Verify** whether the file pickers and WebCodecs work when the HTML is opened directly via `file://`. If anything only works over `http://`, add a one-line "serve locally" instruction to the README (e.g. `npx serve .`) rather than silently degrading.

Write a companion `<name>.layout.json` next to each export containing the settings used, the seed, the video-window rect, and per-section timing, so we can reproduce a render or position the footage in Premiere without guessing.

## Acceptance checklist for v1

- [ ] Load test data, set 180 s, preview plays smoothly with the pacing readout updating live.
- [ ] Header lock and push-out behave exactly as described, including at `t = 0` and at the section boundary.
- [ ] `speedRatio` changes the feel but total duration stays exactly `totalSeconds`.
- [ ] Changing `seed` reshuffles channel names reproducibly; nothing else changes.
- [ ] Long names shrink then truncate cleanly; emoji and non-Latin names render.
- [ ] 5-second test MP4 imports into Premiere at the right fps and resolution and matches the preview frame-for-frame.
- [ ] Full 180 s export completes with progress shown; the final frame lands exactly at `t = totalSeconds`.
- [ ] Companion layout JSON is written.
- [ ] README covers run / export / asset swap.

## Out of scope for v1

VHS / CRT / scanline effects (we apply those in Premiere on the composite), audio, loading the podcast video, styling the control panel beyond clean and usable, and the final designed assets.

## Working style

- When a decision isn't covered here, ask — or make it a setting with a sensible default and say so.
- Make targeted edits to the file rather than regenerating it wholesale.
- Explain technical choices plainly when asked; don't assume familiarity with browser media APIs.
