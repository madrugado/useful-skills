#!/usr/bin/env node
// build.js — driver: render every slide HTML in a directory into one .pptx.
// Reuses a single headless-Chromium instance across all slides for speed.
//
// Usage:
//   node build.js <slides_dir> <output.pptx>
//
// <slides_dir> should contain *.html files, sorted by name = slide order.
// Each HTML links the shared slides.css (copy from assets/) and contains
// exactly one <body> sized 720pt x 405pt.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const pptxgen = require('pptxgenjs');
const { html2pptx } = require('./html2pptx');

const slidesDir = process.argv[2] || path.resolve(__dirname, 'slides');
const outArg = process.argv[3] || path.resolve(__dirname, 'output.pptx');
const OUT = path.resolve(outArg);

const slideFiles = fs.readdirSync(slidesDir)
  .filter(f => f.endsWith('.html'))
  .sort()
  .map(f => path.join(slidesDir, f));

if (slideFiles.length === 0) {
  console.error(`No .html files found in ${slidesDir}`);
  process.exit(1);
}

(async () => {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';            // 10in x 5.625in = 720pt x 405pt

  const browser = await chromium.launch();
  try {
    for (const f of slideFiles) {
      process.stdout.write(`  rendering ${path.basename(f)} ... `);
      const { meas } = await html2pptx(f, pptx, { __browser: browser });
      console.log(`shapes=${meas.shapes.length} text=${meas.text.length} img=${meas.images.length} tbl=${meas.tables.length}`);
    }
  } finally {
    await browser.close();
  }

  await pptx.writeFile({ fileName: OUT });
  console.log(`\nWROTE ${OUT}  (${slideFiles.length} slides)`);
})().catch(e => { console.error('BUILD FAILED:', e); process.exit(1); });
