# TV Guide Credits Scroller

Renders the podcast's Patreon credits as a late-90s cable "TV Guide Channel" listings grid and exports it as a video for Premiere. Out of the box it renders **832×624 (exactly ¼ of the 3328×2496 podcast master, 4:3) at 23.976 fps** with **PrevueGrid at 1:1** (25 px, pixel text), ready for ntsc-rs and a clean 400% scale-up in Premiere. This is the **greybox v1**: every visual is drawn procedurally in canvas so pacing and motion can be judged; designed PNGs and the real font drop in later through the skin layer without touching layout or export.

- `tvguide-credits.html` — the whole tool. Vanilla HTML/CSS/JS, no build step.
- `lib/` — vendored [Mediabunny](https://mediabunny.dev) (MP4 muxer + WebCodecs plumbing). See `lib/README.md`.
- `assets/` — `fonts/` holds font files (see Fonts below). Later: PNGs, `manifest.json`.
- `test/` — optional headless verification (needs Node; the tool itself needs nothing).

## Online

**https://homemade-vhs.github.io/tsmp-producers/**: the same tool, hosted on GitHub Pages (repo `homemade-vhs/tsmp-producers`, public). Open it in Chrome or Edge from anywhere; nothing to install. Everything runs in your browser: patron names, settings and your banner/font libraries are stored in *your* browser only and are never uploaded. Each browser (and the online copy vs. a copy opened from disk) keeps its own settings, so use **Export theme / Import theme** to share a look between editors.

**Publishing changes:** commit and push to `main`; Pages rebuilds in a minute or two. Not in the repo (see `.gitignore`): `refs/`, the font folders (the Prevue fonts ship inside `assets/fonts/bundled-fonts.js`), exported videos/JSON, and **any `.csv`**: Patreon member exports contain personal data and must never be committed.

## Run

Open `tvguide-credits.html` in **Chrome or Edge**. Double-clicking the file works: over `file://` Chrome treats the page as a secure context, so WebCodecs, `showSaveFilePicker` and `showDirectoryPicker` are all available (verified in Chrome 153 and headless Chrome for Testing). Firefox and Safari lack WebCodecs encoding and the file pickers, so exports won't work there.

If you ever add code that `fetch()`es a local file (for example loading `assets/manifest.json` with `fetch`), Chrome blocks that over `file://`. Then serve the folder instead:

```
npx serve .
```

and open the printed `http://localhost:…` URL. Nothing in v1 needs this.

Drag the divider between the preview and the control panel to make the panel wider (double-click it to reset); the width is remembered. In any font dropdown, ↑ / ↓ steps to the previous / next font and applies it straight away.

Settings and the three name lists persist in the browser's localStorage. "Reset settings to defaults" clears them and reloads the test data. Settings saved before the defaults changed stay as they were: click Reset once to pick up the new ones.

## Themes & defaults

The panel at the top of the controls. **Export theme…** saves every setting except the two patron name lists as a `.json` file (tick "include banners, header styles & blocks" to bundle the library, banner images included). **Import theme…** applies one straight away and merges its library in; fonts it names that aren't on this computer fall back to the default and are listed in the status line. **Save current as my defaults** makes this browser's Reset button come back to the current settings instead of the built-in defaults; **Forget my defaults** undoes that. Send the editors a theme file to give everyone the identical look.

## Workflow

1. **Names.** Paste one name per line into Executive Producers, Podcast Producers, and Channel names, or drop a Patreon members CSV on the import box. The importer finds the name / tier / status columns by header text (you can override), lets you pick which tier is Executive Producers and which is Podcast Producers. It pre-selects SuperMega's tiers: **Funniest Brother → Executive Producers**, **Funnier Brother → Podcast Producers** (generic "Executive Producer" / "Producer" names are recognised too). Free members aren't credited unless you choose "all other tiers", and offers "active patrons only" when a status column exists. "Load test data" fills ~320 exec / ~1,050 producer names with long names, emoji and non-Latin scripts mixed in, plus ~40 callsigns.
2. **Timing.** Set the duration and fps (must match your Premiere sequence). Duration can be entered in seconds or in frames. Frames are what actually gets rendered: at 23.976 fps, 180 s is not a whole number of frames, so "180 s" becomes 4316 frames = 180.013 s, and the hint under the field shows the exact result. If the credits slot in Premiere is a known number of frames, enter that directly. `Speed ratio` makes the exec section scroll faster (>1) or slower (<1) than the producers; the total always lands exactly on the last frame.
3. **Tune by the Pacing table.** It shows, per section: names, rows, banner rows, how long the section runs, rows per second, names per second, seconds per row, and how many seconds a row is on screen (from entering at the bottom to disappearing under the locked header). It updates live.
4. **Preview.** Play/pause, scrub, frame step with the arrow keys (Shift = 1 second), Home/End. The preview snaps to frame boundaries so what you see is exactly a frame that will be exported. The size menu at the end of the transport bar sets the preview size: **Fit** (shows the percentage it works out to) or a fixed 25–800%. **100%** is one output pixel per physical screen pixel (Retina included), and 100% and up are drawn with hard pixels, so you see exactly what's in the file. When zoomed, scroll or drag to pan. Keys: `0` fit, `-` / `=` zoom out / in. The choice is remembered.
5. **Export.** See below.

### Settings reference

| Setting | Default | Notes |
|---|---|---|
| Duration / unit | 180 s | Seconds are rounded to whole frames; enter frames for an exact count. |
| FPS | 23.976 | 23.976, 24, 25, 29.97, 30, 50, 59.94, 60. Fractional rates are exact (24000/1001) in the timestamps and in the MP4 timescale. |
| Speed ratio | 1.0 | exec speed ÷ producer speed. |
| End behavior | scrollOff | `scrollOff`: the last row's bottom edge passes the bottom of the locked header exactly at t = total. `stopAtEnd`: the last row parks at the bottom of the grid. |
| Lead-in | locked | `locked`: at t = 0 the first header is already locked with rows beneath (tuned in mid-scroll). `scrollIn`: everything scrolls in from the bottom. |
| Hold at start | 0 frames | The scroll stays frozen for this many frames (the clock keeps ticking). The total duration doesn't change; the scroll runs slightly faster to make up for it. |
| Cable-box load-in | 0 frames (off) | Over this many frames the grid shows only its solid background, then the boxes pop in top to bottom, then the text and images (and the promo text). Usually set it shorter than the hold so the whole build-up happens before the scroll starts. |
| Seed | 1 | Use the episode number. Only affects the channel-name shuffle. |
| Channel start | 2 | Channel numbers count up from here across both sections; banners and headers don't consume a number. |
| Min font scale | 1 | Text may shrink to this fraction of its size before it truncates with an ellipsis. 1 = never shrink, which keeps pixel fonts 1:1. |
| Names per row | exec 2, prod 3 | 1–4 supported for both. |
| Banner every N rows | 12 / 12 | 0 disables. Each insert takes the next entry of the **every-N-rows queue** (banners or blocks, see below). Nothing is inserted after a section's last row. |
| Header height | 64 | px at 1080p, like every size. Row height (88) and banner height (176) are in Look. |
| Clock | in every header | `pinned`: the clock box stays at the lock line and headers slide underneath it (what the old channel did). Its colours come from the "Pinned clock style" header style. |
| Exec / Producers header style | Blue | Header styles are presets (see Headers). |
| Opening header | off | An extra first header above the Exec header, with its own text and style: a date, the episode number. With the locked lead-in it shows at t = 0 until the Exec header pushes it out; combine it with Hold at start. |
| Clock start | 10:02:07 | `H:MM:SS`; 24-hour input is fine, display is 12-hour. Advances with t, never the wall clock. |
| Clock box shows | the live clock | `custom text`: the clock box shows your text instead (episode number, a date, anything), in every header or in the pinned clock. Shrinks to fit, never below Min font scale, then truncates. |
| Promo interval | 10 s | Promo panels hard-cut on this interval; which one shows depends only on t. |
| Video window aspect | 4:3 | The podcast footage is 3328×2496 (4:3). |
| Export region | full | `full`: the whole frame. `grid`: the output is cropped to the scrolling grid only (3328×1372 at the default size), with no top area at all. Drop it on a layer above the podcast video in Premiere at the crop position from the layout JSON; it's opaque, so no key and no fringe. |
| Top area | normal | `normal`: video window + promo panel. `blank`: everything above the header bar is one flat fill in the video fill colour, no promo panel. Black = empty top, green/blue = chroma key the whole top so any video can go there in Premiere. The layout JSON's `videoWindow` then covers the whole strip and `promoPanel` is null. |
| Video window style | flush | `flush`: the window fills the top-left corner down to the header bar, no frame. `boxed`: inset with a thin frame. |
| Video window fill | black | Black to composite the footage over it in Premiere, or chroma green (#00FF00) / chroma blue (#0000FF) / a custom colour to key out with Ultra Key so the footage can sit on a layer *below* the credits. |
| Output resolution | 832×624 | Menu: 832×624 (¼ of the master; the default), 3328×2496 (podcast master), 1664×1248 (half size, quick tests), **640×480 (native SD: PrevueGrid 1:1 at 25 px, see below)**, 1920×1080, 3840×2160, or custom… (type any `W×H`; even numbers). |
| Internal render | off | Menu (or custom… `W×H`): everything is drawn at that size, then scaled up to the output resolution. Only needed when you want a *big* file with a low-res look; to export at native SD, set the Output resolution itself to 640×480 instead. If the internal aspect differs from the output aspect the skin pre-squeezes horizontal sizes so text and the video window come out right after the stretch. |
| Upscale | smooth | `smooth`: soft SD look. `nearest`: hard, blocky pixels. |
| Whole-pixel scaling | on | Nearest only. 640×480 into 3328×2496 is 5.2×, so with a plain stretch some pixels come out 5 wide and some 6, and 1-pixel bevels vary. With this on, the render size is adjusted to the nearest whole factor (640×480 → 665×499 at exactly 5×; at 1920×1080 → 960×540 at 2×). Every pixel and every bevel is then identical, and the last partial column/row (under one factor wide) repeats the edge. Square pixels, so the anamorphic 720×480 squeeze doesn't apply. 832×624 and 416×312 are already exact at 3328×2496. The Stats panel shows the render size, the factor and the bevel size in output pixels. |
| Text rendering | smooth | `pixel`: no anti-aliasing, so every text pixel is fully on or off. **Text pixel size** N draws the glyphs N× smaller and blows them up N× for extra-chunky text, even at full resolution. |
| Design scale | 1.0 | Every skin size (row height, fonts, tile width) is the 1080p design scaled by frame height, times this. A 4:3 frame has ~25% less width per cell than 16:9 at the same row height, so drop this (or names per row) if long names truncate too much. |
| Bitrate | auto | 40 Mbps at 1080p, 100 Mbps at 4K-class pixel counts (3328×2496 is 8.3 Mpx, the same as 4K), constant bitrate when the encoder supports it. It's an intermediate; Premiere re-encodes. |

## Banners, blocks and headers

Everything inserted between the names comes from a **library** (banners, header styles, blocks) plus two lists that say where things go.

- **Banner preset**: a name, text (`|` starts a new line; leave blank for image-only), a colour for line 1 and one for the other lines, box fill, bevel light and dark colours, optional text alignment / font / font size overrides, an optional image (contain / cover / stretch, drawn inside the bevel with the text on top), and a height multiplier (1 = the normal banner height).
- **Header style**: box fill, bevel light/dark, title text colour, and the clock box's fill and text colour. Used by the section headers, the opening header, block headers and the pinned clock. Two come built in: Blue (time bar) and Grey (promo bar).
- **Block**: an optional header (text + header style) followed by any number of banners: a single banner, a banner with a header on top, or one header with several banners under it. A block's header behaves exactly like a section header: it scrolls up, locks at the top while its banners scroll under it, and is pushed out by the next header. With **"Bring the section header back"** (on by default), when a block with a header lands in the middle of a section, that section's header follows it so the names below have their header again. This is the sequence in `refs/banners and headers/`. The built-in "Patreon promo" block is a grey header plus the Patreon banner.
- **Every-N-rows queue**: banners and/or blocks in the order they're inserted, repeats allowed. Each insert (every N rows, per section in Grid) takes the next entry, continuing across the section boundary.
- **Fixed placements**: a banner or block at a specific spot, played once: at the start, under the Exec header, between the sections, under the Producers header, or at the end. Several in one spot play in list order (▲ ▼ reorder within a spot).
- **Editing** is live: each editor has a preview drawn through the real renderer, and the main render updates as you type. Duplicate makes a copy to tweak.
- **Persistence**: banners, header styles and blocks are saved in the browser's IndexedDB for this page (Diagnostics shows which storage is in use). They are per browser profile and per machine; clearing site data removes them. **Export library** writes `tvguide-library.json` (all three, banner images included, plus the queue and fixed placements) as a backup; **Import library** merges it back. Older `tvguide-banners.json` files still import. The queue and placements themselves are part of the ordinary settings.
- Images are embedded as data URLs and decoded before layout runs, so a render is still a pure function of time. Keep them under about 8 MB each; a PNG or JPEG at the banner's pixel size is plenty (the banner box at 3328×2496 is about 3300×400).
- The layout JSON records every header (kind, title, content y, colours), the blocks and fixed placements used, each banner preset's colours and image fingerprint, and where every banner row landed.

## Look

The "Look" panel controls the bevel size, the gap between boxes, row and banner heights, and separate fill / light edge / dark edge / text colours for **Exec** and **Producer** name cells and channel tiles, plus the grid background, the top-area gradient and the promo text colours. Header colours come from header styles, banner colours from banner presets. The bevel and gap are the same size on every box, banners included: one whole number of render pixels on all four sides whatever the box size. Box contents (text, strokes, shadows, images) are clipped to inside the bevel so they can never paint over it. Sizes are at the 1080p design scale and scale with the frame like everything else. "Reset look to defaults" restores the greybox palette and sizes. Settings saved before per-tier colours existed give the execs the same colours the producers had.

## Text style

One collapsible group per text role (Names, Channel tiles, Header title, Header clock, Banners, Promo panel):

- **Align across** (left / center / right) and **align up/down** (top / middle / bottom) inside the box.
- **Padding** left/right and top/bottom: the gap between the text and the inside of the bevel.
- **Line spacing** for multi-line text (tiles, banners, promo, wrapped names).
- **2 lines for long text** (Names and Header title): a name that doesn't fit wraps onto a second line instead of shrinking. The box never changes size, so if two lines don't fit the row height they get a bit smaller (raise Row height for room). If one slightly-shrunk line would be bigger than two lines, the single line wins.
- **Drop shadow**: solid (no blur), colour, opacity and X/Y offset. **Stroke**: solid outline, colour, width and opacity.

Every string is drawn once into its own small image (shadow, stroke, fill) and cached. The cache is only memoisation, so a hit and a miss give identical pixels and `render(t)` stays pure.

## Pixel-perfect PrevueGrid for ntsc-rs

The defaults already do this at 832×624 (25 px font, 60 px two-line rows, 28 px headers; scale 400% in Premiere). The same recipe at the original 640×480:

PrevueGrid is drawn on a 40-unit grid in a 1000-unit em, so at **25 px** one font pixel is exactly one screen pixel (an "E" is 9×18 px, the caps are 18 px tall: the same proportion as the reference captures on a 480-line screen). The native setup:

1. Output → **Output resolution** `640×480 — native SD`, **Internal render** off.
2. Fonts → pick `PrevueGrid-Pixelated.ttf` for each role, type **25** in **Exact px**, click **Set up for a pixel font** (width 100%, bold off, pixel text, Min font scale 1 = never shrink; long names wrap or truncate instead).
3. Look → **Row height** ~132 if you want two-line names like the reference (59 px rows: room for two 25 px lines). Header height 64 gives 28 px bars.
4. Export the MP4 (or a PNG sequence for lossless) at 640×480, run it through ntsc-rs, then scale it up in Premiere (640×480 → 3328×2496 is 520%). The layout JSON's rects are then in 640×480 pixels; multiply by 5.2 for the 3328×2496 sequence.

Pixel text draws each glyph 8× larger and reads the exact centre of every pixel, so the result is the font's true bitmap; macOS's slight thickening of small text never leaks in. Keying after ntsc-rs won't be clean (it smears colour and luma), so composite the podcast footage under the black video window *before* ntsc-rs, or overlay with Export region `grid`.

## The crisp low-res look (big file)

1. Output → **Internal render** `640x480` (or `832x624`), **Upscale** `nearest`, **Whole-pixel scaling** on (the default) so every pixel and bevel is the same size.
2. Text style → **Text rendering** `pixel`. Optionally raise **Text pixel size** for even chunkier glyphs.
3. Untick **Bold** for pixel fonts in the Fonts panel.

Everything is laid out and drawn at the small size, then every export frame is blown up to the output resolution with hard pixels. The preview shows the same thing.

## Fonts

**Built-in fonts.** The Prevue fonts (PrevueGrid-Pixelated, PrevueGrid, PrevueList) are bundled into `assets/fonts/bundled-fonts.js`, so the defaults work on any computer, opened from disk or hosted, without choosing a folder. To change what's bundled, run `node tools/bundle-fonts.mjs "pixel fonts/Foo.ttf" …` (paths relative to `assets/fonts`). Only bundle fonts you may redistribute: on a hosted copy anyone can download them.

Font files live in `assets/fonts/` (`.ttf`, `.otf`, `.woff`, `.woff2`). A web page can't look inside a folder on its own, so:

1. In the **Fonts** panel click **Choose fonts folder…** and pick `assets/fonts` (picking `assets/` works too; it looks in its `fonts` subfolder). Every font in it **and in its subfolders** is loaded and listed with a sample. Fonts in subfolders are named by their path (`pixel/PrevueGrid.ttf`), so files with the same name in different subfolders don't clash; fonts at the top level keep their plain file name. Hidden folders and `__MACOSX` are skipped.
2. Choose a font for each text role: Names, Channel tiles, Header title, Header clock, Banners, Promo panel. "Default (Arial Narrow)" is the greybox font. **Size %** scales that text, **Width %** squeezes it (92 = the greybox's condensed look; 100 = the font as designed), **Bold** fakes a bold weight (untick it for pixel fonts like PrevueGrid). **Exact px** sets the size in render pixels and overrides Size % (the faint number shows the automatic size); pixel fonts need their design size here, 25 for PrevueGrid. **Set up for a pixel font** sets width 100%, bold off, pixel text and no shrinking in one click. "Use Names font everywhere" copies the Names row to every role.
3. **Adding fonts later:** drop the file into `assets/fonts` and click **Rescan folder**. New files are added, changed files reloaded, and deleted files removed. If the browser offered "Allow on every visit" when you first picked the folder, new fonts are picked up automatically on page load.

The fonts themselves are saved in the browser's IndexedDB (like banner presets), so they stay loaded across visits even before a rescan. **Add font files…** adds individual files from anywhere; ✕ forgets a font. macOS `._Name.ttf` files are ignored. A role whose font isn't loaded (e.g. on another computer) falls back to the default, and Diagnostics flags it in red. Characters a font doesn't have (emoji, non-Latin scripts) fall back to the default font per character.

Fonts are registered before layout runs, so text measuring and `render(t)` stay deterministic. The layout JSON records, per role, the font file, its size in bytes and modified date, weight, size % and width %.

## Export

**MP4 (primary).** "Export MP4 (full)" or "Export 5-second test MP4". Two save dialogs appear up front, one for the `.mp4` and one for the companion `<name>.layout.json` (the second dialog opens in the same folder with a matching name). Then the render runs unattended: every frame is drawn at `t = n / fps`, encoded with WebCodecs H.264 (High profile, level chosen for the resolution and fps: 4.1 for 1080p30, 4.2 for 1080p60, 5.1 for 3328×2496 at 23.976 and for 4K30, 5.2 for 4K60, hardware encoder preferred), keyframe every 2 seconds, and streamed to disk through Mediabunny so a full render never sits in memory. Nothing is real-time, so nothing can drop a frame. The progress bar shows frames done, elapsed, and estimated remaining; Cancel discards the partial file.

Keep the tab visible if you can. Rendering still works in a background tab, but Chrome throttles background tabs and the encoder may run slower.

If the save picker isn't available (a browser without the File System Access API), the MP4 and JSON are built in memory and offered as downloads instead.

**PNG sequence (secondary).** Pick a folder; frames are written as `frame_00000.png`, `frame_00001.png`, … plus the layout JSON. This is the lossless / alpha path. Tick "Transparent background + video window" to leave the background and the video window unpainted so only the grid chrome and text have pixels. PNG export needs Chrome/Edge (directory picker).

**In Premiere.** Import the MP4 into a sequence with the same fps and frame size (3328×2496, 23.976). ffprobe reports the file as `24000/1001` fps with a 24000 timescale, so it conforms without interpretation. Open the `.layout.json` next to it: `videoWindow` is the exact `x, y, w, h` of the window in output pixels (with the flush default at 3328×2496 that is x 0, y 0, w 1497, h 1123); place the podcast footage there. The same rect is printed live in the Stats panel. If you rendered the window green or blue instead, put the credits on top, the footage underneath, and key the colour out with Ultra Key. H.264 stores colour at half resolution (4:2:0), so the key edge can show a pixel of fringe; for a perfectly clean edge use the PNG sequence with the transparent toggle instead, which leaves the window genuinely transparent. With Top area set to `blank`, the same applies to the whole strip above the bar: black leaves it empty, green/blue keys it out, and the transparent PNG toggle leaves it transparent.

The cleanest overlay is **Export region: grid**. The MP4 is then just the scrolling grid, cropped to its own size, and the layout JSON's `output.crop` says where it sits in the full frame (at the defaults: x 0, y 1124, w 3328, h 1372). Put it on a track above the podcast footage at that position; nothing needs keying. The preview shows the crop so what you see is what you get, and every rect in the JSON stays in full-frame pixels so it lines up with a full-frame render of the same settings. The MP4 is tagged full-range (`yuvj420p`); if Premiere shows the blacks lifted, set its colour range interpretation to full.

### The companion layout JSON

```
exportName, exportKind, frames, durationSeconds
encoder            codec string, profile/level, hardware flag, bitrate, WebCodecs config used
output             width, height, aspect, region ('full' | 'grid'), fullFrame {width, height}, crop (grid region only),
                   fps label + exact value + rational (24000/1001), totalFrames, internal resolution
topArea            'normal' | 'blank'
videoWindow        x, y, w, h, style, fill — the window in output pixels (the whole top strip when topArea is blank)
videoWindowFrame   the thin frame around it (boxed style only, else null)
promoPanel         promo text area rect (null when the top area is blank)
gridViewport       the scrolling grid rect
seed, settings     everything from the control panel incl. look colours, text styles, bannerQueue and fixedBlocks (name lists live under `names`)
headers[]          every header in content order: kind (opening | section | block | resume), title, content y, height, colours
blocks             fixed placements and the block presets used
banners            queue, the banner presets used (colours, image name/size/hash), and every banner row's content y and block
sections[]         per section: names, rows, bannerRows, start/end/duration seconds, rows per second,
                   seconds per row, seconds on screen per row, scroll speed in output px/s
timing             total, hold seconds/frames, load-in frames, exec seconds, producer seconds, scroll start/end/boundary, content height
names              exec[], prod[], channels[] as used for this render
```

Same settings + same seed + same name lists reproduce the render exactly.

## How it works (for making targeted edits)

The JS in `tvguide-credits.html` is in labelled sections:

1. **CONFIG** — `DEFAULTS`; every input binds through `data-setting="key"`.
2. **UTILITIES** — `mulberry32` seeded PRNG, clock formatting, grapheme splitting.
3. **PARSING** — name lists, CSV, test data.
3b. **BANNER LIBRARY** — banner presets, IndexedDB persistence, image decoding; plus the generic library used for **header styles** and **blocks** (`headerLib`, `blockLib`, `resolveBlockRef`, `resolveHeaderStyle`), and the combined library export/import.
3c. **FONT LIBRARY** — font files from a chosen folder (handle + bytes in IndexedDB), FontFace registration, rescan, `resolveFontRoles(cfg)`.
4. **LAYOUT** — `buildLayout(config, skin, ctx, blocks)`. Runs once per settings change, only after `skin.loadFonts()` resolves. Content order: opening header, start blocks, Exec header, execTop blocks, exec rows (every-N inserts, resume headers), between blocks, Producers header, and so on. Produces a flat `rows[]` (each with absolute content `y` and `height`), `headers[]` (every kind) with natural positions, and pre-fitted text for every cell, tile, banner and title (`fitText`: shrink to `minFontScale` or wrap to 2 lines, then ellipsis on grapheme boundaries). Text widths come from the skin's `textBox()`, the same geometry the drawing uses. Nothing random or measured happens later.
5. **TIMING** — `computeTiming()` gives `s(t)`: frozen for the hold, then the exec section at `speedRatio × v` and producers at `v`, with `v = (D_e / speedRatio + D_p) / (totalSeconds − hold)`.
6. **SKIN** — `createGreyboxSkin(W, H, options)`. All drawing and all layout constants. Sizes come from one unit, `frameHeight / 1080 × designScale`, so 4:3 and 16:9 frames share the same row height and font size; `stretch` (output aspect ÷ render aspect) pre-squeezes horizontal sizes when an anamorphic internal resolution is on. Text goes through `drawTextImage` / `getTextImage` (solid shadow, stroke, pixel mode, cache).
7. **RENDER** — `render(ctx, t)`: background, video window, promo panel (index from t), then the grid: rows that intersect the viewport, then headers on top with `y_i = max(L, L + P_i − s)` clamped by `y_i ≤ y_{i+1} − H_i` (lock, then push-out), then the pinned clock. `loadInAt(t)` decides, during the load-in, which on-screen items show their box and which their content.
8. **PREVIEW** — `requestAnimationFrame` at real time, snapped to frames.
9. **EXPORT** — MP4 and PNG loops; both call the same `renderFrame(n / fps)` as the preview.
10. **UI WIRING** — settings ↔ inputs, rebuild pipeline, pacing/stats/diagnostics, CSV, keys.

`window.__tvguide` exposes the internals for the test harness.

## Swapping in designed assets

Everything visual goes through the skin object; layout, `render`, preview and export never draw anything themselves. An `AssetSkin` needs to provide the same interface as `createGreyboxSkin`:

```
width, height, gridRect, headerHeight, rowHeight, bannerHeight, channelTileWidth, cellPadX, clockMode,
videoRect, videoFrameRect, promoRect, textStyles,
fonts { family, weight, scaleX, cell, tile, tileNumber, header, clock, banner, promo, roles, spec(role, px) }
boxRect(rect), headerTileBox(rect), headerTitleBox(rect), textBox(role, box), bannerFont(preset)
                                     → geometry the layout uses to fit text, so it must match the drawing
loadFonts()                          → await every role's font (the Fonts panel already registered the FontFaces)
drawBackground(ctx, opts)            opts.transparent → paint nothing
drawVideoWindow(ctx, opts)           opts.transparent → frame only
drawPromoPanel(ctx, panel, opts)     panel = { lines: [...] } (later: an image)
  every grid draw takes info = { tier: 'exec' | 'prod', parts: { box, content } }  (parts = load-in stage)
drawHeader(ctx, rect, header, clockText, info)     header = { title: fit, style: header style preset }
drawClockBox(ctx, rect, clockText, style, info)    the pinned clock
drawChannelTile(ctx, rect, channel, info)  channel = { number, name, numberFit, nameFit }
drawCell(ctx, rect, cell, colIndex, namesPerRow, info)   cell = { name, fit: { text, lines, px } } or null (empty slot)
drawBanner(ctx, rect, banner, info)  banner = { preset, image, lines: [{ text, px }], height }
```

Suggested `assets/manifest.json` shape:

```json
{
  "font": { "family": "TVGuideCondensed", "file": "tvguide.ttf", "scaleX": 1.0 },
  "images": {
    "background": "bg-1920.png",
    "header": "header.png",
    "channelTile": "tile.png",
    "cell": { "2": "cell-w850.png", "3": "cell-w566.png", "4": "cell-w425.png" },
    "banner": ["banner-logo.png", "banner-patreon.png"],
    "promo": ["promo-1.png", "promo-2.png"]
  },
  "layout": { "gridTop": 486, "headerHeight": 64, "rowHeight": 88, "bannerHeight": 176, "channelTileWidth": 220 }
}
```

Steps: load the manifest with a `<script>` (`assets/manifest.js` setting `window.ASSET_MANIFEST = {...}`) or serve the folder and `fetch` it; load images with `new Image()` and the font with `new FontFace(...)` inside `loadFonts()`; draw cells as fixed-size images keyed by `namesPerRow` (or 9-slice) in `drawCell`; then in `rebuild()` swap `createGreyboxSkin(...)` for `createAssetSkin(...)`. That is the only line outside the skin that changes.

## Testing

```
cd test && npm install && npm test
```

Launches headless Chrome (Puppeteer downloads its own copy), opens the page over `file://`, and checks: the 3328×2496 / 23.976 / 4316-frame defaults, encoder level selection and auto bitrate, layout counts and text fitting, exact timing (`tExec + tProd = total`, `s(total) = sEnd`), header lock and push-out at t = 0 and the section boundary, `render(t)` determinism, speed-ratio invariance, seed behaviour, the internal-resolution path, CSV mapping, blocks (lock, push-out, resume header, opening header), the start hold, load-in stages, pixel-text determinism, and a real 5-second MP4 export through the in-memory path (then `ffprobe` checks for 3328×2496 at 24000/1001 with 120 frames, and `ffmpeg` checks that MP4 frame 61 matches canvas frame 61 and not 60 or 62). Reference frames and the MP4 land in `test/out/`.

## Out of scope for v1

VHS / CRT effects (applied in Premiere), audio, loading the podcast video into the page, control-panel styling beyond usable, the final designed assets.
