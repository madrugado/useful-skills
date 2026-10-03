---
name: literature-review
description: How to conduct a structured academic literature review and produce a LaTeX PDF report. Use whenever the user asks for a "literature review", "lit review", "survey of the literature on X", wants to "find and summarize papers on a topic", or wants to go from a research question to a grouped, cited, compiled PDF document. Covers searching (Crossref + Searchpin web), forward/backward citation expansion, grouping, narrative + table writing, and `.tex`/`.bib`/`.pdf` assembly.
---

# Skill: literature-review

Produce a structured, citation-linked literature review as a compiled LaTeX PDF.

The pipeline runs in seven stages. Each stage writes intermediate artifacts to a
working directory so progress is recoverable if a step fails. Never hold all the
paper data only in memory — write it to disk at the end of every stage.

## Inputs to confirm up front

Before searching, confirm with the user (use defaults only if they say "you pick"):

- **Topic / research question** — the central query the review must answer.
- **Working directory** — where the `.tex`, `.bib`, and stage JSON files go.
  Default: a `lit-review/` folder under the current project.
- **Scope** — `quick`, `standard` (default), or `thorough`. Maps to caps below.
- **Years** — optional `year_from`/`year_to` window for the seed search.
- **Language** — output prose language (default: English).

## Caps (do not exceed without explicit user ask)

These caps exist because a single well-cited paper can have thousands of
references and citations. Expanding them all is useless busywork and produces a
review nobody can read. They are not negotiable defaults — respect them.

| Scope      | Seed papers | Backward refs (total, across all seeds) | Forward cites (total, across all seeds) | Per-paper expansion |
|------------|-------------|------------------------------------------|------------------------------------------|---------------------|
| quick      | 8           | 15                                       | 15                                       | 3 each way          |
| standard   | 15          | 30                                       | 30                                       | 5 each way          |
| thorough   | 25          | 60                                       | 60                                       | 8 each way          |

Forward/backward limits are **pooled across all seed papers**: pick the most
relevant hits globally, do not blindly expand every seed by the per-paper cap.
Forward-citation expansion should prefer sorting by citation count (`sort: "cited"`)
to find the most influential descendants.

## Working directory layout

Create this at the start. Every artifact below is a file on disk:

```
<workdir>/
├── stages/
│   ├── 01_seeds.json         # initial search results
│   ├── 02_backward.json      # references pulled from seeds
│   ├── 03_forward.json       # papers that cite the seeds
│   ├── 04_corpus.json        # deduped, merged master list
│   └── 05_groups.json        # grouping + per-group feature tables
├── review.bib                # the BibTeX file
├── review.tex                # the LaTeX document
└── review.pdf                # compiled output
```

Each stage JSON is an array of objects with at least: `doi`, `title`, `authors`,
`year`, `venue`, `citation_count`, `abstract`, `source_stage` (seed/backward/forward),
`cite_key`. Writing these lets you resume after a crash and lets later stages read
earlier output without re-searching.

## Stage 1 — Seed search (searchpin + crossref)

Run both engines in parallel; they return complementary results.

1. **Crossref** — `mcp__crossref__search_papers` with the topic as `query`.
   Also run `mcp__crossref__search_by_topic` for an influence-sorted view.
   Use `year_from`/`year_to` if the user gave a window. Request `rows: 25`
   so there is headroom to filter down to the seed cap.
2. **Searchpin** — `mcp__Searchpin__web_search` with the same topic phrased as
   a web query; pick the 1–3 most relevant URLs and `mcp__Searchpin__web_fetch`
   them. Use this to catch survey papers, theses, and recent preprints that
   Crossref ranks low but are useful seeds.

Deduplicate by DOI (normalize to lowercase, strip `https://doi.org/`). Rank the
combined pool by `citation_count` (desc) but **bias toward recency and topical
fit** — a 2023 paper with 40 cites on-topic beats a 2010 paper with 400 cites
off-topic. Select up to the seed cap. Write `01_seeds.json`.

If results are mostly noise, rephrase the query before concluding scarcity —
swap generic terms for proper nouns, model numbers, or compound terms, and try
the topic vertical `news` as an escape hatch. See the Searchpin tool guidance.

## Stage 2 — Backward citations (what the seeds cite)

For each seed, call `mcp__crossref__get_references` with the seed's DOI. From
the returned reference list, keep only references that have a resolved DOI. Rank
them globally (across all seeds) by how relevant they are to the topic — a
reference cited by 3 of your seeds is more central than one cited once. Pick the
top N up to the pooled backward cap. Fetch each via `mcp__crossref__get_paper`
to fill in `abstract`, `citation_count`, and `venue`. Write `02_backward.json`
with `source_stage: "backward"`.

## Stage 3 — Forward citations (who cites the seeds)

For each seed, call `mcp__crossref__get_citations` with `sort: "cited"` so the
most influential descendants surface first. Pool across seeds, dedup by DOI, and
keep the top N up to the pooled forward cap. Fetch metadata with
`mcp__crossref__get_paper`. Write `03_forward.json` with
`source_stage: "forward"`.

**Stop expanding forward citations early** if the top results are all very recent
and low-citation and only tangentially related — the field may have moved past
the seed and a forward walk just gathers noise.

## Stage 4 — Build corpus

Merge `01_seeds.json`, `02_backward.json`, `03_forward.json`. Dedup by DOI again
(forward and backward frequently overlap with seeds). Assign stable `cite_key`s:

- Format: `firstauthorlastnameYEARkeyword` (e.g. `vaswani2017attention`).
- Lowercase, ASCII-only, no spaces.
- Guarantee uniqueness by appending `b`, `c`, … on collision.

Write `04_corpus.json`. This is the master list every later stage reads.

## Stage 5 — Group + extract features

Read `references/grouping.md` now — it has the full grouping method and the
feature-extraction rules. Summary:

1. Read all abstracts. Identify 3–6 groups by shared method, problem framing,
   or contribution type — **not** by year or venue.
2. Aim for groups of 2–8 papers. A 1-paper "group" is a footnote, not a group;
   merge it into the nearest neighbor or fold into an "Other / emerging" group.
3. For each paper, extract 2–4 short feature phrases (method, dataset, key result,
   novelty) from its abstract. These populate the table column.
4. Write `05_groups.json`: `{ groups: [ { name, summary_points, papers: [cite_key, ...] } ] }`.

## Stage 6 — Write `.tex` and `.bib`

Read `references/bib-workflow.md` for the exact format rules. Summary:

1. Generate one `@article{...}` / `@inproceedings{...}` / `@misc{...}` entry per
   corpus paper in `review.bib`, using the `cite_key` from stage 4.
2. Generate `review.tex` from the `assets/review.tex.tmpl` template:
   - Title = the research question.
   - One `\section` per group, containing a narrative paragraph then a
     `booktabs` table of the group's papers.
3. Cite with `\cite{cite_key}`. Every entry in `review.bib` must be cited at
   least once; every `\cite` key must resolve in `review.bib`.

## Stage 7 — Build the PDF

Run:

```bash
bash <skill_dir>/scripts/build_pdf.sh <workdir> review
```

The script runs `pdflatex → bibtex → pdflatex → pdflatex` (the repeats resolve
cross-references and the bibliography) and reports the path to the PDF. If it
fails, read `review.log` for the LaTeX error; the most common causes are a
missing `\cite` key, an unescaped `&` or `%` in a table cell, or a `&` inside an
abstract pulled into the `.bib` (escape as `\&`).

If `pdflatex` is missing entirely, tell the user to install TeX Live or MacTeX
and stop — do not try to substitute a non-LaTeX PDF path silently.

## Behavior notes

- **Write artifacts, don't hoard them.** Each stage ends with a file write. If
  the model is tempted to keep everything in context "to be fast", that is the
  bug — recoverability and the stage-4 merge depend on files.
- **Never invent citations.** If abstract metadata is missing for a paper, say
  so in the table (`—`) rather than fabricating a feature.
- **Cite keys are the join key.** Use them consistently from stage 4 onward;
  the `.tex` and `.bib` must agree byte-for-byte on every key.
- **Be transparent about gaps.** If a stage returns fewer papers than the cap,
  that's fine — report the actual count. Do not pad with irrelevant results.
