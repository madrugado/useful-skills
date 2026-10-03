---
name: html2pptx
description: Convert HTML slides into an editable PowerPoint (.pptx) file locally and offline, by rendering each slide's HTML in a headless browser and mapping the laid-out elements onto real PPTX shapes/textboxes/images/tables. Use whenever the user wants to turn HTML, a slide deck, markdown slides (Marp/reveal.js), a web page, or slide-like content into a .pptx/PowerPoint/Keynote-importable file — or says "html to pptx", "convert slides to powerpoint", "make a pptx from html", or asks for a higher-fidelity alternative to pandoc's flat PPTX output. Produces editable native shapes (not screenshots), preserves columns/callout boxes/colors/images/tables, and runs fully offline (no cloud API, no account, no data leaving the machine).
---

# html2pptx — local HTML → editable PPTX

Render per-slide HTML into an editable `.pptx` by measuring the **laid-out**
positions of every element in a headless browser (Playwright/Chromium) and
emitting real PPTX shapes (PptxGenJS). Output is editable native shapes —
columns, callout boxes, tags, images, tables all preserved — not a screenshot.

This is the **local** variant described in many `html2pptx.md` guides. It does
**not** call any cloud API, requires no account, and sends nothing off the
machine. (The npm package `html2pptx-local-mcp`, despite the name, is a paid
cloud client — do not confuse the two.)

## When to use vs. alternatives

- **pandoc `-o file.pptx`**: drops raw-HTML layouts (Marp `<div>` columns,
  callouts, inline styles) → flat, lossy. Use html2pptx when the source uses
  HTML/CSS layout you want to preserve.
- **python-pptx by hand**: full control but ~300+ lines per deck. Use html2pptx
  when you'd rather author CSS than place shapes programmatically.
- **A cloud service**: only if the user explicitly accepts uploading content.

## Prerequisites (one-time per machine)

```bash
# node project dir with the three deps + the chromium binary
npm install pptxgenjs playwright sharp
npx playwright install chromium
```

The engine (`scripts/html2pptx.js`) and driver (`scripts/build.js`) are bundled
with this skill. Copy them into the user's project, or run them in place.

## Workflow

### 1. Read the contract first

Before authoring any slide HTML, read **`references/html-contract.md`** — it
lists the hard rules (text must be in `<p>`/`<h*>`/`<table>`, backgrounds only
on `<div>`, web-safe fonts, SVGs rasterized to PNG, body must be 720×405pt).
Violating these silently loses content. The most common mistake is bare text
inside a `<div>` — it will not appear in the PPTX.

### 2. Set up the build directory

```bash
mkdir -p pptx_build/{slides,img}
cp ~/.agents/skills/html2pptx/scripts/{html2pptx.js,build.js} pptx_build/
cp ~/.agents/skills/html2pptx/assets/slides.css pptx_build/
cp ~/.agents/skills/html2pptx/assets/example-slide.html pptx_build/slides/
cd pptx_build && npm init -y && npm install pptxgenjs playwright sharp
npx playwright install chromium
```

`slides.css` sets `body { width:720pt; height:405pt; ... }` — the slide canvas.
Edit it freely to match the target deck's palette; the engine reads rendered
layout, so any valid CSS works.

### 3. Author one `.html` per slide

Translate the source deck (Marp `.md`, etc.) into one HTML file per slide under
`slides/`, sorted by filename (`s01-...`, `s02-...`). Each links `slides.css`
and contains exactly one `<body>` sized 720×405pt. Start from
`assets/example-slide.html`. Key rules (full list in the reference):

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"><link rel="stylesheet" href="../slides.css"></head>
<body>
  <div class="frame">
    <h2>Title</h2>
    <div class="columns">
      <div class="col"><p>Text — ALWAYS inside a &lt;p&gt;.</p></div>
      <div class="col">
        <div class="qbox"><p style="margin:0;"><b>Note:</b> callout text.</p></div>
      </div>
    </div>
  </div>
</body></html>
```

**Rasterize SVGs to PNG before `<img>`** (PowerPoint can't embed SVG cleanly):
```bash
node -e 'const s=require("sharp"),f=require("fs");
  (async()=>{const b=f.readFileSync("in.svg"),m=await s(b).metadata();
  await s(b,{density:144}).resize(m.width*2,m.height*2).png().toFile("out.png");})();'
```

### 4. Build

```bash
node build.js slides output.pptx
```

The driver reuses one Chromium instance across slides. It prints a per-slide
shape/text/image/table count — sanity-check these (e.g. `text=0` means text was
bare in a div and got dropped).

### 5. Verify by rendering to PNG

PowerPoint and PptxGenJS occasionally disagree on text wrapping/overflow, so
**always render the PPTX back to PNG and look at it** before declaring done:

```bash
soffice --headless --convert-to pdf --outdir preview output.pptx
pdftoppm -png -r 110 preview/output.pdf preview/slide    # macOS/Linux
```

If something looks off, also screenshot the **source HTML** to compare intended
vs. actual — the gap localizes the bug:

```js
// screenshot a slide's HTML at the exact slide viewport
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 960, height: 540 } }); // 720pt×405pt @96dpi
  const p = await c.newPage();
  await p.goto('file://' + require('path').resolve('slides/s01.html'), { waitUntil: 'networkidle' });
  await p.screenshot({ path: 'preview/html-s01.png' });
  await b.close();
})();
```

## Debugging guide

| Symptom | Cause / fix |
|---|---|
| Text renders **black** / wrong size | Run-extractor lost inherited styles. Seed each text element's computed `color`+`fontSize` as the base walk context (see comment in `scripts/html2pptx.js`, `runsFrom()`). Also set textbox-level `color`/`fontSize` defaults as a safety net. |
| **Text missing entirely** | Bare text inside a `<div>`/`<span>`. Wrap it in `<p>`. |
| Element **clipped at slide edge** | Content overflows 405pt height — reduce font sizes or split the slide. Engine does not auto-paginate. |
| **Callout box** has no left accent bar | Must be a `<div>` with `background` AND `border-left` (both). Border on text tags is ignored. |
| **Image missing** | Path wrong, or an SVG that failed to rasterize. Pre-rasterize to PNG. |
| **Table** rows uneven / clipped | Engine sizes rows evenly; set explicit row heights in CSS. |
| Shape positions **slightly off** | Body isn't exactly 720×405pt — confirm `slides.css` is linked and not overridden. |

## How the engine works (brief)

`scripts/html2pptx.js` does, per slide:
1. Launch Chromium at a 960×540px viewport (= 720pt×405pt @ 96dpi).
2. `page.evaluate` walks the DOM, calling `getBoundingClientRect()` on every
   `<div>` (→ shapes if it has bg/border), text tag (→ textbox with inline
   runs), `<img>` (→ image), and `<table>` (→ PptxGenJS table).
3. Emits PptxGenJS shapes in z-order: backgrounds → images → text → tables.
4. Converts CSS `rgb()`/hex to PptxGenJS's `RRGGBB` (no `#`), px→in (/96),
   px→pt (/96×72).

Reusing one browser across slides (`__browser` opt in the driver) keeps a
10-slide build to a few seconds.
