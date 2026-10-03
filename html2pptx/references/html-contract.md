# HTML authoring contract

The engine renders each slide's HTML in a real browser and reads the laid-out
positions, so **any valid CSS works** — flexbox, grid, absolute positioning,
etc. But PowerPoint has hard constraints that the HTML must respect, or content
is silently lost or corrupted. These rules are non-negotiable.

## Body = slide

`<body>` must be exactly the slide size. The bundled `slides.css` sets this:

```css
body { width: 720pt; height: 405pt; margin: 0; padding: 0; ... }
```

That's 16:9 (10in × 5.625in = 720pt × 405pt). For 4:3 use `720pt × 540pt` and
`pptx.layout = 'LAYOUT_4x3'` in `build.js`. The viewport the engine opens
matches the body size at 96dpi, so 1 CSS px = 1/96 in exactly.

## Text MUST be in text tags

**All visible text must be inside `<p>`, `<h1>`–`<h6>`, `<ul>`/`<ol>`/`<li>`,
or `<table>`/`<th>`/`<td>`.** Text placed directly inside a `<div>` or `<span>`
(without a wrapping text tag) is silently dropped.

- ✅ `<div><p>Text</p></div>`
- ✅ `<div class="qbox"><p style="margin:0;"><b>Note:</b> text</p></div>`
- ❌ `<div>Text</div>` — **text will not appear**
- ❌ `<span>Text</span>` standalone — **text will not appear**

This is the single most common authoring mistake. When wrapping callout text,
always put a `<p>` (or `<ul>`, etc.) inside the styled `<div>`.

## Inline formatting

Inside a text tag, use normal HTML inline formatting — the engine walks text
nodes and captures per-run styling:

- `<b>`/`<strong>` → bold
- `<i>`/`<em>` → italic
- `<u>` → underline
- `<span style="color:#RRGGBB; font-weight:bold;">` → color/bold/italic/underline
- `<code>` or `<span class="mono">` → monospace (style it in CSS)
- `<br>` → line break within a paragraph

Inline `<span>` is fine **as a child of a text tag** (`<p>...<span>...</span>...</p>`);
it's only bare standalone spans that get dropped.

## Styling: what works where

| CSS feature | Works on | Notes |
|---|---|---|
| `color`, `font-size`, `font-weight`, `font-style` | any element | inherited normally |
| `text-align` | text tags | hint for PptxGenJS text alignment |
| `background` / `background-color` | **`<div>` only** | becomes a shape fill |
| `border` (any side) | **`<div>` only** | left border → colored accent bar (great for callouts); uniform border → shape outline |
| `border-radius` | **`<div>` only** | rounded shape corners |
| `box-shadow` (outer) | **`<div>` only** | inset shadows ignored |
| `display:flex` / `grid` | any element | positions computed from rendered layout |
| `margin`, `gap`, `padding` | any element | affects layout as normal |

Backgrounds/borders/radius on text tags (`<p>`, `<h*>`) are **ignored** —
PowerPoint can't style text that way. If you need a colored text block, wrap the
text tag in a styled `<div>`.

## Fonts

Web-safe fonts only: `Arial`, `Helvetica`, `Times New Roman`, `Georgia`,
`Courier New`, `Verdana`, `Tahoma`, `Trebuchet MS`. Custom fonts (`'Segoe UI'`,
`'SF Pro'`, `'Roboto'`) may not render and can cause layout drift.

## Images

```html
<img src="path/to/image.png" style="max-height:200pt; max-width:100%;">
```

- **SVG must be rasterized to PNG first.** The engine auto-rasterizes any `.svg`
  it encounters via `sharp` (2× for crispness), but doing it up front avoids
  surprises. Use `npx sharp-cli` or the `ensurePng()` helper.
- Use `max-height`/`max-width` (not fixed `height`/`width`) so images scale
  within their column without overflow.
- Paths are relative to the HTML file. Keep images next to the slides.

## Tables

Standard HTML tables work and map to PptxGenJS tables:

```html
<table>
  <tr><th>Col A</th><th>Col B</th></tr>
  <tr><td>cell</td><td>cell</td></tr>
</table>
```

- `<th>` → bold header cell; style `th { background: ... }` in CSS for a header fill.
- Cell backgrounds, bold, and color are read from computed styles.
- The engine sizes rows evenly; for uneven content, set explicit row heights in CSS.

## Common pitfalls

1. **Bare text in a div** → silent drop (see above). Always wrap in `<p>`.
2. **Forgetting `slides.css`** → body isn't 720×405pt → everything mis-sizes.
   Always `<link rel="stylesheet" href="slides.css">` in `<head>`.
3. **Content overflowing the 405pt body height** → clipped at the slide edge.
   The engine does not auto-paginate. Check the rendered PNG; if text is cut,
   reduce font sizes or split across two slides.
4. **`<img>` pointing at an SVG that hasn't been rasterized** → works (engine
   rasterizes lazily) but the first build is slower and any rasterization
   failure is silent. Prefer pre-rasterized PNGs.
5. **Color values with `#` in PptxGenJS calls** → file corruption. The engine
   strips `#`/converts `rgb()` automatically; never hand-edit generated XML.
