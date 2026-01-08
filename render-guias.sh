#!/usr/bin/env bash
# Render the four standalone one-page guides to PDF and move them into the
# Quarto site output directory. Run after `quarto render`; can also be run
# manually from the repository root.

set -euo pipefail

cd "$(dirname "$0")"

OUTDIR="_site/quadro/guias"
mkdir -p "$OUTDIR"

for f in quadro/guias/*.qmd; do
  name="$(basename "$f" .qmd)"
  echo "Rendering $f ..."
  quarto render "$f" --to typst --quiet
  # Quarto writes next to source; move to _site/quadro/guias/
  if [ -f "quadro/guias/${name}.pdf" ]; then
    mv "quadro/guias/${name}.pdf" "$OUTDIR/${name}.pdf"
  fi
done

echo "Guides rendered to $OUTDIR:"
ls "$OUTDIR"
