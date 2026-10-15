# lib/

Vendored third-party code. No CDN is used at runtime.

| File | What | Version | License |
|------|------|---------|---------|
| `mediabunny.min.js` | [Mediabunny](https://mediabunny.dev) MP4 muxer + WebCodecs plumbing (`CanvasSource`, `StreamTarget`, `BufferTarget`). This is the upstream `dist/bundles/mediabunny.min.cjs` renamed; loaded with a plain `<script>` tag it defines a global `Mediabunny`. | 1.56.2 | MPL-2.0 (`MEDIABUNNY-LICENSE`) |

To upgrade: `npm pack mediabunny`, extract, copy `dist/bundles/mediabunny.min.cjs` over `mediabunny.min.js`, and update the version here.
