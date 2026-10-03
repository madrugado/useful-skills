#!/usr/bin/env bash
# Build a LaTeX literature review into a PDF.
#
# Usage: build_pdf.sh <workdir> <jobname>
#   <workdir>  directory containing <jobname>.tex and <jobname>.bib
#   <jobname>  the .tex file basename (e.g. "review" for review.tex)
#
# Runs pdflatex -> bibtex -> pdflatex -> pdflatex to resolve the bibliography
# and cross-references, then prints the path to the final PDF.
#
# Exits non-zero on a LaTeX error. The .log file is left in place for debugging.

set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <workdir> <jobname>" >&2
  exit 64
fi

workdir="$1"
jobname="$2"
texfile="${workdir}/${jobname}.tex"

if [ ! -f "$texfile" ]; then
  echo "Error: ${texfile} not found" >&2
  exit 66
fi

if ! command -v pdflatex >/dev/null 2>&1; then
  echo "Error: pdflatex is not installed. Install TeX Live or MacTeX first." >&2
  exit 127
fi

cd "$workdir"

run_latex() {
  # -interaction=nonstopmode keeps going past non-fatal warnings;
  # -halt-on-error stops on real errors so the log shows the cause.
  pdflatex -interaction=nonstopmode -halt-on-error "$jobname.tex" > /dev/null
}

echo "Pass 1: pdflatex"
run_latex || { echo "pdflatex failed on pass 1; see ${workdir}/${jobname}.log" >&2; exit 1; }

if [ -f "${jobname}.bib" ]; then
  echo "Pass 2: bibtex"
  bibtex "$jobname" > /dev/null 2>&1 || echo "Warning: bibtex reported issues; continuing" >&2
fi

echo "Pass 3: pdflatex"
run_latex || { echo "pdflatex failed on pass 3; see ${workdir}/${jobname}.log" >&2; exit 1; }

echo "Pass 4: pdflatex (final)"
run_latex || { echo "pdflatex failed on pass 4; see ${workdir}/${jobname}.log" >&2; exit 1; }

pdf="${workdir}/${jobname}.pdf"
if [ -f "$pdf" ]; then
  echo "OK: ${pdf}"
else
  echo "Error: build finished but ${pdf} was not produced" >&2
  exit 1
fi
