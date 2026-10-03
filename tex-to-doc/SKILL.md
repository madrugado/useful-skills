---
name: tex-to-doc
description: Convert a LaTeX paper (e.g., an ACM/IEEE conference .tex + .bib) into a Russian «доклад» .doc following a house formatting example (.doc) — Times New Roman 14 pt, A4, УДК, ГОСТ 7.05-2008 references, translated figure, python-docx build via uv, LibreOffice .doc conversion, programmatic + visual verification. Use whenever the user asks to «сделать русскую версию статьи», «преобразовать tex в doc», «оформить доклад по примеру», mentions converting an English conference paper into a Russian journal/forum report, or asks for a .doc following a provided formatting example.
---

# tex-to-doc — LaTeX article → Russian доклад .doc

Turn an English LaTeX conference paper into a Russian `.doc` report that **strictly
follows a formatting example** provided by the user (a house style, e.g. an
Russian conference «доклад»). Proven end-to-end on a peer-reviewed conference
paper; the numeric format below is
the default house style — **user requirements always override the example**, the
example defines **structure only**.

## Inputs to gather first

1. Source `.tex` (+ `.bib`). If the author list in the .tex is incomplete, ask the
   user for the published DOI and pull full author metadata via Crossref
   (`mcp__crossref__get_paper`).
2. The formatting example `.doc` — replicate its structure exactly (see below).
3. Numeric requirements from the user (font size, margins, volume). The example
   file itself may be typeset at older settings (e.g. 10 pt) — do NOT copy its
   numeric parameters.

## Default house format (Russian conference доклад)

| Parameter | Value |
|---|---|
| Volume | 5–10 pages including figures and tables |
| Paper | A4 (21 × 29,7 cm) |
| Margins | left/right 2 cm, top 2 cm, bottom 3,2 cm |
| Font | Times New Roman 14 pt (captions + table text 12 pt) |
| Spacing | single |
| Paragraph indent | 1 cm (567 twips) |
| Hyphenation | automatic, but FORBIDDEN in title, figure and table captions (`w:suppressAutoHyphens`) |
| Page number | centered in header, absent on page 1 (`titlePg`) |

Document structure (from the example, in order):

1. `УДК <code>` (justified, no indent)
2. TITLE in CAPS, bold, left, no hyphenation
3. Authors «И. О. Фамилия» (superscript org index if several orgs)
4. Organization — italic, e.g. «Организация, город, страна»
5. Bold «E-mail:» + address
6. Body sections **without numbering**, headings run-in bold inside the
   paragraph: «{b}Введение. {/b}текст…»
7. Figures centered; caption «Рис. N. …» 12 pt centered below; tables caption
   «Таблица N. …» 12 pt centered ABOVE the table, table has full grid
8. «Список использованных источников» bold; references per **ГОСТ 7.05-2008**

## Tools & environment

- Python: **uv** — `uv run --with python-docx build_doc.py` (never plain pip).
- LibreOffice: `soffice` (macOS/Homebrew: `/opt/homebrew/bin/soffice`). NEVER use
  `textutil` for .doc — it
  corrupts the file (Letter size, wrong fonts).
- Render to PNG: `pdfinfo` (page count), `pdftoppm -r 100 -png file.pdf out`
  (names are zero-padded when pages > 9: `out-01.png`; single digit otherwise).
- Verify docx text via `unzip` + regex over `<w:t>` — do NOT trust low-DPI renders.

## Workflow

### 1. Inspect the example
`soffice --headless --convert-to docx example.doc --outdir /tmp`, then read the
docx XML (section properties, styles, header) to confirm structure details.

### 2. Extract content from the .tex
Title, authors, sections, display equations, table data, figure source. Decide
what to DROP: house examples usually have **no abstract and no keywords** —
skip them. Split the paper into доклад sections with run-in bold headings.

### 3. Typography rules for the Russian text
Decimal comma (0,045), minus U+2212 (−67 %), en dash «–», «ёлочки» quotes,
no «ё». Use `\t` tab stops math per template. Keep title words together with a
non-breaking space so prepositions don't dangle at line end.

### 4. References → ГОСТ 7.05-2008
Format: `Фамилия, И. О. Название / И. О. Фамилия [et al.] // Журнал. – Год.`
Renumber **by order of citation** in the Russian text; cite as `[n]`. Only cited
   entries go in. Example: `1. Vaswani, A. Attention Is All You Need / A. Vaswani,
   N. Shazeer, N. Parmar [et al.] // Advances in Neural Information Processing
   Systems. – 2017.`

### 5. УДК
For AI/ML papers `УДК 004.85` («Обучение» / machine learning under 004.8
«Искусственный интеллект») is appropriate; verify at teacode.com/online/udc
(URL scheme: `/online/udc/00/004.8.html`). Tell the user it was auto-selected.

### 6. Translate the figure
If the paper's figure has English labels, rebuild it as a hand-written **SVG**
with Russian labels (viewBox matching target aspect), wrap in a zero-margin HTML
page, render via **Chrome DevTools MCP**: `emulate` viewport `WxHx3` (DPR 3),
   `take_screenshot` to PNG. Do NOT use `qlmanage` (clips SVG to a square) or
   generative image-editing tools (they mangle exact text). Insert the PNG into
   the docx.

### 7. Build the .docx
Copy `scripts/build_doc_template.py` from this skill, fill CONFIG + header +
content blocks + REFS. Content mini-markup: `{i}…{/i}`, `{b}…{/b}`,
`{sub}…{/sub}`, `{sup}…{/sup}`, `{isub}…{/isub}`, `{isup}…{/isup}`.
Formulas are **text runs** with real sub/superscripts (NOT OMML — OMML breaks
on .doc conversion). Display equations: tab stop CENTER at 8,5 cm + RIGHT at
17 cm (right tab = page width − margins = 21−2−2 = 17; center = half of it),
number `(\d)` at the right tab. Run `uv run --with python-docx build_doc.py`.

### 8. Convert to .doc
```
soffice --headless --convert-to doc work/<name>.docx --outdir .
```
Keep the intermediate `.docx` next to the final `.doc`.

### 9. Verify (iterate until clean)

a. **Render**: `soffice --convert-to pdf` → `pdfinfo` (must be 5–10 pages) →
   `pdftoppm -r 100 -png`.
b. **Roundtrip check** (.doc → docx → python-docx / XML): A4 11906×16838 twips;
   margins 1134/1134/1134/1814; `w:autoHyphenation` in settings.xml;
   `suppressAutoHyphens` present on title + captions + formulas; Normal style =
   Times New Roman sz 28; run sizes 28/24; header has PAGE field + `titlePg`;
   every section, formula number, table, figure, and all `[n]` citations
   present; Times New Roman written in the .doc binary font table (a lone
   Liberation Serif entry is only LibreOffice's substitution alias — harmless).
c. **Visual gate**: dispatch `documents:visual-judge` on all page PNGs (100 DPI),
   one verdict per page: header numbers, title without hyphens, captions 12 pt,
   tables whole on one page, equations with right-margin numbers, no overlaps /
   cut text / half-empty pages.
d. **Fix loop** for typical defects:
   - > 10 pages → condense translation (~⅓ compression usually suffices);
   - table split across pages → `keep_with_next` on every cell paragraph of all
     rows except the last (see template);
   - half-empty page after a figure → move the fig block later in the text;
   - equation mis-centered → tab stops must be on the equation paragraph, not style.
