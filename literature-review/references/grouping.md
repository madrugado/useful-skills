# Grouping and feature extraction

Read after Stage 4 (corpus built), before writing `05_groups.json`.

## How to group

The goal is a review a human can navigate, not a flat list. Group by **what the
papers do**, not by metadata.

Good grouping axes (pick the one or two that best fit the corpus):

- **Method family** — e.g. transformer-based vs. GNN-based vs. classical ML.
- **Problem framing** — e.g. node classification vs. link prediction vs.
  community detection, even if methods overlap.
- **Contribution type** — e.g. new architecture vs. scaling/efficiency vs.
  benchmark/analysis vs. theoretical.
- **Data regime** — e.g. supervised vs. self-supervised vs. few-shot.

Bad grouping axes (avoid):

- Year or decade — useless to a reader.
- Venue — encourages "everything from NeurIPS" non-groups.
- Author — collapses unrelated work by the same group.
- Source stage (seed/backward/forward) — internal bookkeeping, not a theme.

## Group shape

- Aim for **3–6 groups**, each with **2–8 papers**.
- A single-paper group is almost always wrong: merge into the nearest neighbor,
  or create an "Other / emerging directions" bucket for the loners that share
  no axis with anyone.
- If one group would have >10 papers, it is under-differentiated — split it on a
  second axis (e.g. split "transformer methods" into "efficient" vs. "long-context").
- Every corpus paper must belong to exactly one group. Track this: count papers
  in `05_groups.json` and compare to `04_corpus.json` length.

## The narrative paragraph (per group)

One paragraph (~4–8 sentences) that:

1. Names the group and states the common thread in the first sentence.
2. Traces the line of work through 3–5 representative papers by `\cite{key}`,
   in roughly chronological or influence order.
3. Calls out the key tension, limitation, or open problem the group leaves.
4. Ends by motivating the next group where relevant.

Do **not** restate every table row in prose — the table carries the per-paper
detail. The paragraph gives the narrative the table cannot.

## Feature extraction (table column)

For each paper, pull **2–4 short phrases** from its abstract. Each phrase should
be 1–6 words and capture one of:

- **Method** — the core technique (e.g. "graph attention", "LoRA adapters").
- **Data / setting** — dataset, scale, or regime (e.g. "ImageNet-1k", "1B params").
- **Key result** — the headline number or finding (e.g. "+3.2% accuracy", "4× faster").
- **Novelty** — what is new (e.g. "first linear-time variant").

Rules:

- Pull from the **abstract** primarily; only fetch the full text if the abstract
  is empty or the key result is missing. Do not invent numbers.
- If a field is genuinely unknown (no abstract, no metadata), write `—`. Never
  guess a feature.
- Keep cells short — long cells break the table layout. If a result needs a
  sentence, it belongs in the narrative paragraph, not the table.

## `05_groups.json` schema

```json
{
  "groups": [
    {
      "name": "Short group title",
      "summary_points": [
        "One line per key tension or finding, used as scaffolding for the narrative paragraph."
      ],
      "papers": ["citekey1", "citekey2"]
    }
  ]
}
```

The narrative paragraph and the feature table are derived from this file at
Stage 6; keep `summary_points` as the bullet scaffolding so the `.tex` generation
is mechanical.
