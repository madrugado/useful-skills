# useful-skills

A small collection of agent skills (ZCode / Claude Code style `SKILL.md` packages).
Each subdirectory is a self-contained skill: `SKILL.md` plus optional
`references/`, `scripts/`, and `assets/`.

## Skills

### literature-review

Conduct a structured academic literature review and compile it into a citation
linked LaTeX PDF. Searches Crossref + the web, expands backward/forward
citations within scope-based caps, groups papers by method with feature tables,
and assembles `.tex`/`.bib`/`.pdf` end to end.

Requires: Crossref and Searchpin MCP tools, `pdflatex` (TeX Live / MacTeX).

### tex-to-doc

Convert an English LaTeX conference paper (`.tex` + `.bib`) into a Russian
«доклад» `.doc` that strictly follows a user-provided house formatting example:
Times New Roman 14 pt, A4, УДК header, ГОСТ 7.05-2008 references, translated
figures, page numbers in the header. Builds via python-docx (uv) and LibreOffice,
then verifies the result both programmatically (roundtrip .doc → docx checks)
and visually (page renders).

Requires: uv, LibreOffice (`soffice`), poppler (`pdfinfo`, `pdftoppm`); Chrome
DevTools MCP for re-rendering figures with translated labels.

### html2pptx

Convert HTML slides (Marp, reveal.js, hand-written, or slide-like web pages)
into an **editable** PowerPoint `.pptx` — locally and offline. Renders each
slide in headless Chromium, measures the laid-out position of every element,
and maps them onto real PPTX shapes/textboxes/images/tables (not screenshots).
Columns, callout boxes, colors, images, and tables are preserved.

Requires: Node.js with `pptxgenjs`, `playwright`, `sharp`, and the Playwright
Chromium binary.

## Install

Copy the skill folders you want into your agent's skills directory:

```bash
git clone git@github.com:madrugado/useful-skills.git
cp -R useful-skills/<skill-name> ~/.agents/skills/
```

ZCode also discovers skills at `~/.zcode/skills/` and at project scope
(`<project>/.agents/skills/`).

## License

[MIT](LICENSE)
