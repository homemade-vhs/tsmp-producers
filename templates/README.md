# Design templates (1:1)

Exact-size bases for art that goes into the credits **without any scaling**, at the tool's default
832×624 output (¼ of the 3328×2496 podcast master; Premiere scales the export up 400%).

| File | Size | Use |
|---|---|---|
| `top-background_832x280_*` | 832 × 280 | Look → Top background image. The left 373 × 280 is covered by the podcast footage (video window); the promo text is centred in the 435 × 256 box at x 385, y 12. |
| `banner-x1_827x96_*` | 827 × 96 | A banner preset's image at the default banner height ("Height ×1"). |
| `banner-x0.5_827x45_*`, `banner-x1.5_827x147_*`, `banner-x2_827x198_*` | | The same at Height ×0.5 / ×1.5 / ×2. |
| `full-frame_832x624_render.png` / `_annotated.png` | 832 × 624 | A real frame from the tool, plain and with the zones outlined, for context. |

Each size comes as three files:

- **`_blank`**: the canvas at exactly the right size (filled with the default colour). Start your design on this.
- **`_guides`**: the zones marked and labelled, for reference.
- **`_overlay`**: the same marks on a transparent background. Put it as the top layer over your artwork and hide it before you export.

Export your art as PNG (or JPEG) at exactly the template size. An image at the exact size is drawn pixel for pixel
whatever the fit setting; "actual size (1:1)" also guarantees no scaling. The 2 px bevel frame is drawn around the
banner image area, so don't paint your own border at the very edge.

If you change the output size, banner height, header height or design scale, these sizes change: the tool shows the
current size to design at under each image chooser. Regenerate the templates from the tool's live layout with
`cd test && npm install && node make-templates.mjs`.
