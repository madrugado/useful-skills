// html2pptx.js — local, offline HTML-to-PPTX slide engine.
// Renders one HTML slide in headless Chromium at 720pt x 405pt (16:9),
// reads the RENDERED layout (getBoundingClientRect), and maps every element
// onto PptxGenJS shapes/textboxes/images/tables. No cloud, no account.
//
// Contract (must be followed by the HTML the caller passes in):
//   - <body> is the slide, exactly 720pt x 405pt (16:9).
//   - ALL text must live in <p>, <h1>-<h6>, <ul>, <ol>, <li>, or <table>.
//     Bare text inside <div> or <span> is silently dropped by PowerPoint.
//   - Backgrounds, borders, border-radius, box-shadow work ONLY on <div>.
//   - Use web-safe fonts only (Arial, Helvetica, Georgia, 'Courier New', ...).
//   - <img>: rasterize any SVG to PNG before pointing <img> at it.
//   - Colors: CSS hex or rgb(); the engine strips '#' for PptxGenJS.
//
// Derived from the workflow in presentation/html2pptx.md (the local variant).

const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');

const PT_W = 720, PT_H = 405;     // slide size in pt (16:9)
const PX_PER_IN = 96;             // CSS px per inch
const IN_W = PT_W / 72;           // 10in
const IN_H = PT_H / 72;           // 5.625in
const px2in = px => px / PX_PER_IN;
const ptFromPx = px => px / PX_PER_IN * 72;

// rgb(r,g,b) / rgba(...) -> 'RRGGBB' (no '#', as PptxGenJS requires)
function hexOf(rgb) {
  if (!rgb) return null;
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(s => Math.round(parseFloat(s)));
  return parts.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Rasterize an SVG image to PNG (returns the .png path) if not already PNG.
// Called lazily for each <img> encountered.
async function ensurePng(absPath) {
  if (absPath.toLowerCase().endsWith('.svg')) {
    const out = absPath.replace(/\.svg$/i, '.png');
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(absPath).mtimeMs) {
      const buf = fs.readFileSync(absPath);
      const meta = await sharp(buf).metadata();
      await sharp(buf, { density: 144 })
        .resize(Math.round(meta.width * 2), Math.round(meta.height * 2))
        .png().toFile(out);
    }
    return out;
  }
  return absPath;
}

// Render one HTML file onto one slide of the given pptx instance.
// opts: { __browser, slide }  (pass __browser to reuse across slides)
// Returns { slide, meas } where meas is the measured layout (for debugging).
async function html2pptx(htmlFile, pptx, opts = {}) {
  const absHtml = path.resolve(htmlFile);
  const baseDir = path.dirname(absHtml);
  const browser = opts.__browser || await chromium.launch();
  const ownsBrowser = !opts.__browser;

  try {
    const ctx = await browser.newContext({
      viewport: { width: Math.round(PT_W * PX_PER_IN / 72), height: Math.round(PT_H * PX_PER_IN / 72) },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto('file://' + absHtml, { waitUntil: 'networkidle' });

    // ---- MEASURE: read rendered layout of every element we care about ----
    const meas = await page.evaluate(() => {
      const body = document.body.getBoundingClientRect();
      const out = { body: { w: body.width, h: body.height }, text: [], shapes: [], images: [], tables: [] };

      // Walk a text-bearing element into inline runs, capturing <b>/<i>/<u>/<span>
      // styling. CRITICAL: seed the walk context with the element's OWN computed
      // color and size, so inherited styling is preserved (a previous version
      // seeded null here, which made every run render black at default size).
      function runsFrom(el) {
        const runs = [];
        const cs = getComputedStyle(el);
        const baseColor = cs.color;
        const baseSize = parseFloat(cs.fontSize);
        const baseBold = parseInt(cs.fontWeight) >= 600;
        const baseItalic = cs.fontStyle === 'italic';
        function walk(node, ctx) {
          for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              const t = child.textContent;
              if (t && t.length) runs.push({ text: t, ...ctx });
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              const ecs = getComputedStyle(child);
              const c = {
                color: ecs.color !== baseColor ? ecs.color : ctx.color,
                size: parseFloat(ecs.fontSize) !== baseSize ? parseFloat(ecs.fontSize) : ctx.size,
                bold: parseInt(ecs.fontWeight) >= 600 ? true : (ctx.bold || false),
                italic: ecs.fontStyle === 'italic' ? true : (ctx.italic || false),
                underline: (ecs.textDecoration && ecs.textDecoration.includes('underline')) ? true : (ctx.underline || false),
              };
              if (child.tagName === 'BR') { runs.push({ text: '\n', ...ctx }); continue; }
              walk(child, c);
            }
          }
        }
        walk(el, { color: baseColor, size: baseSize, bold: baseBold, italic: baseItalic, underline: false });
        return runs;
      }

      // shapes: divs with a background or any border (callouts, cards, tag pills)
      document.querySelectorAll('div').forEach(el => {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        const hasBg = bg && bg !== 'rgba(0, 0, 0, 0)';
        const blw = parseFloat(cs.borderLeftWidth) || 0;
        const brw = parseFloat(cs.borderRightWidth) || 0;
        const btw = parseFloat(cs.borderTopWidth) || 0;
        const bbw = parseFloat(cs.borderBottomWidth) || 0;
        const anyBorder = (blw + brw + btw + bbw) > 0;
        if (!hasBg && !anyBorder) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        out.shapes.push({
          x: r.left, y: r.top, w: r.width, h: r.height,
          bg: hasBg ? bg : null,
          blw, brw, btw, bbw,
          blColor: cs.borderLeftColor, brColor: cs.borderRightColor,
          btColor: cs.borderTopColor, bbColor: cs.borderBottomColor,
          radius: parseFloat(cs.borderRadius) || 0,
        });
      });

      // text: leaf text elements (skip those inside <table> — tables handled separately)
      document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li').forEach(el => {
        if (el.closest('table')) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const cs = getComputedStyle(el);
        out.text.push({
          x: r.left, y: r.top, w: r.width, h: r.height,
          runs: runsFrom(el),
          align: cs.textAlign,
          size: parseFloat(cs.fontSize),
          lineHeight: parseFloat(cs.lineHeight) || null,
          tag: el.tagName,
        });
      });

      // images
      document.querySelectorAll('img').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        out.images.push({ src: el.getAttribute('src'), x: r.left, y: r.top, w: r.width, h: r.height });
      });

      // tables
      document.querySelectorAll('table').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        const rows = [];
        el.querySelectorAll('tr').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('th,td').forEach(td => {
            const cs = getComputedStyle(td);
            cells.push({
              text: td.textContent.trim(),
              bg: cs.backgroundColor,
              isHead: td.tagName === 'TH',
              bold: parseInt(cs.fontWeight) >= 600,
              color: cs.color,
            });
          });
          if (cells.length) rows.push(cells);
        });
        out.tables.push({ x: r.left, y: r.top, w: r.width, h: r.height, rows });
      });

      return out;
    });

    await ctx.close();

    // ---- BUILD the slide ----
    const slide = opts.slide || pptx.addSlide();

    // Order: shapes (backgrounds) -> images -> text (on top) -> tables.
    for (const s of meas.shapes) {
      const opt = { x: px2in(s.x), y: px2in(s.y), w: px2in(s.w), h: px2in(s.h) };
      if (s.bg) opt.fill = { color: hexOf(s.bg) };
      if (s.blw > 0 && s.brw === 0 && s.btw === 0 && s.bbw === 0) {
        // left-accent callout (e.g. .qbox/.warnbox): keep the fill, draw a thin
        // bar for the colored left border on top of it.
        if (s.bg) {
          slide.addShape(pptx.shapes.RECTANGLE, {
            x: px2in(s.x), y: px2in(s.y), w: px2in(s.blw), h: px2in(s.h),
            fill: { color: hexOf(s.blColor) || '000000' }, line: { type: 'none' },
          });
        }
      } else if ((s.blw + s.brw + s.btw + s.bbw) > 0) {
        const w = Math.max(s.blw, s.brw, s.btw, s.bbw);
        opt.line = { color: hexOf(s.blColor) || 'CCCCCC', width: ptFromPx(w) };
      }
      slide.addShape(pptx.shapes.RECTANGLE, opt);
    }

    for (const im of meas.images) {
      const abs = path.resolve(baseDir, im.src);
      const png = await ensurePng(abs);
      slide.addImage({ path: png, x: px2in(im.x), y: px2in(im.y), w: px2in(im.w), h: px2in(im.h) });
    }

    for (const t of meas.text) {
      const runs = t.runs
        .map(r => ({ ...r, text: r.text.replace(/[ \t]+/g, ' ').replace(/\n /g, '\n') }))
        .filter(r => r.text.length > 0);
      const opt = {
        x: px2in(t.x), y: px2in(t.y), w: px2in(t.w), h: px2in(t.h),
        valign: 'top', margin: 0,
        // textbox-level defaults — a safety net so inherited color/size always
        // apply even if a run somehow omits them; run options override these.
        color: '2C3E50',
        fontSize: ptFromPx(t.size),
        align: (t.align === 'center' ? 'center' : t.align === 'right' ? 'right' : 'left'),
      };
      if (t.lineHeight) opt.lineSpacingMultiple = t.lineHeight / t.size;
      const textArr = runs.map(r => {
        const o = {};
        if (r.bold) o.bold = true;
        if (r.italic) o.italic = true;
        if (r.underline) o.underline = true;
        if (r.color) o.color = hexOf(r.color) || undefined;
        if (r.size) o.fontSize = ptFromPx(r.size);
        return { text: r.text, options: o };
      });
      slide.addText(textArr, opt);
    }

    for (const tb of meas.tables) {
      const rows = tb.rows.map(cells => cells.map(c => {
        const o = { fontSize: 9 };
        if (c.isHead || c.bold) o.bold = true;
        if (c.bg && c.bg !== 'rgba(0, 0, 0, 0)') o.fill = { color: hexOf(c.bg) };
        if (c.color) o.color = hexOf(c.color) || undefined;
        return { text: c.text, options: o };
      }));
      slide.addTable(rows, {
        x: px2in(tb.x), y: px2in(tb.y), w: px2in(tb.w),
        border: { pt: 0.5, color: 'BBBBBB' },
        valign: 'middle',
        rowH: px2in(tb.h / tb.rows.length),
      });
    }

    return { slide, meas };
  } finally {
    if (ownsBrowser) await browser.close();
  }
}

module.exports = { html2pptx, ensurePng, hexOf, px2in, ptFromPx, IN_W, IN_H };
