# BibTeX and LaTeX assembly

Read at Stage 6, before writing `review.bib` and `review.tex`.

## `review.bib`

One entry per corpus paper. Choose the entry type from the Crossref `type` field:

| Crossref type                    | BibTeX type       |
|----------------------------------|-------------------|
| `journal-article`                | `@article`        |
| `proceedings-article`            | `@inproceedings`  |
| `book-chapter` / `book-section`  | `@incollection`   |
| `book`                           | `@book`           |
| `posted-content` / preprint      | `@misc`           |
| anything else                    | `@misc`           |

Required fields per type (omit a field rather than emit an empty `{}`):

- `@article` — `author`, `title`, `journal`, `year`, `volume`, `pages`.
- `@inproceedings` — `author`, `title`, `booktitle`, `year`, `pages`.
- `@misc` — `author`, `title`, `year`, `note` or `howpublished` (e.g. arXiv).

Always include `doi` and `url` when Crossref provides them.

## Citation key rules

- Lowercase, ASCII, no spaces: `firstauthorlastnameYEARword`.
  - `vaswani2017attention`, `devlin2019bert`, `brown2020language`.
- The "word" is a short, distinctive token from the title (not the first word,
  which is often "A"/"The"/"On").
- On collision, append `b`, `c`, … — never append numbers.

The keys are defined in Stage 4 (`04_corpus.json`); do not re-derive them here.

## Author formatting

BibTeX `author` is a string of `Last, First and Last, First and ...`. Crossref
returns authors as a list of `{given, family}` objects — convert each to
`Family, Given` and join with ` and `. Example:

```
author = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki}
```

For a long author list (>15), use `and others` after the first 3–5 to keep the
`.bib` readable; BibTeX renders this as "et al."

## Escaping (the #1 source of build failures)

BibTeX and LaTeX choke on unescaped special characters inside fields:

| Char | Write as |
|------|----------|
| `&`  | `\&`     |
| `%`  | `\%`     |
| `$`  | `\$`     |
| `#`  | `\#`     |
| `_`  | `\_`     |
| `{` `}` | `\{` `\}` |

Abstracts pulled from Crossref frequently contain `&` and `%`. Escape them when
writing the `.bib`. When in doubt, wrap the whole field value in extra braces:
`title = {{Self-Supervised Learning: A Survey}}`.

## `review.tex`

Use `assets/review.tex.tmpl` as the skeleton. Key requirements:

- `\documentclass{article}`.
- `\usepackage{booktabs}` for the tables (use `\toprule`, `\midrule`,
  `\bottomrule` — never `\hline`).
- `\bibliographystyle{plain}` and `\bibliography{review}`.
- `\cite{key}` for every citation; never type a citation as plain text.

### Group section template

```latex
\section{Group name}
\noindent Narrative paragraph here, citing \cite{key1, key2} inline.

\begin{table}[h]
\centering
\caption{Papers in this group.}
\small
\begin{tabular}{@{}lll@{}}
\toprule
Citation & Method & Key result \\
\midrule
\cite{key1} & graph attention & +3.2\% accuracy \\
\cite{key2} & LoRA adapters   & 4$\times$ faster \\
\bottomrule
\end{tabular}
\end{table}
```

Choose 2–4 columns that fit the group's features (e.g. Method, Dataset,
Key result, Notes). Column headers may differ per group — that is fine.

### Consistency check before building

- Every `\cite{key}` in the `.tex` exists as a `@entry{key, ...}` in the `.bib`.
- Every entry in the `.bib` is cited at least once (no orphan entries; BibTeX
  warns about these but they clutter the build).
- Count of `\cite` keys cited == count of entries in `.bib` is NOT required
  (a paper may be cited in multiple groups), but the first two checks are.

Run a quick grep to verify before invoking the build script:

```bash
grep -oE '\\cite\{[^}]+\}' review.tex | tr ',' '\n' | sed 's/[{}]//g' | sort -u > /tmp/cited.txt
grep -oE '^@[a-z]+\{[^,]+' review.bib | sed 's/^@[a-z]*{//' | sort -u > /tmp/defined.txt
comm -23 /tmp/cited.txt /tmp/defined.txt   # cited but not defined — MUST be empty
```
