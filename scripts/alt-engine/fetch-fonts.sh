#!/bin/sh
# Fetches the bundled converter fonts (all OFL or Apache-2.0).
set -e
cd "$(dirname "$0")/fonts" 2>/dev/null || { mkdir -p "$(dirname "$0")/fonts"; cd "$(dirname "$0")/fonts"; }
BASE=https://raw.githubusercontent.com/google/fonts/main/ofl
for f in carlito/Carlito-Regular.ttf carlito/Carlito-Bold.ttf carlito/Carlito-Italic.ttf carlito/Carlito-BoldItalic.ttf \
         caladea/Caladea-Regular.ttf caladea/Caladea-Bold.ttf caladea/Caladea-Italic.ttf caladea/Caladea-BoldItalic.ttf \
         tinos/Tinos-Regular.ttf tinos/Tinos-Bold.ttf tinos/Tinos-Italic.ttf tinos/Tinos-BoldItalic.ttf; do
  curl -sfL -O "$BASE/$f"
done
# Noto statics from the system package (fonts-noto-core)
for f in NotoSerif-Regular.ttf NotoSerif-Bold.ttf NotoSans-Regular.ttf NotoSans-Bold.ttf \
         NotoSansDevanagari-Regular.ttf NotoSansDevanagari-Bold.ttf \
         NotoSansGurmukhi-Regular.ttf NotoSansGurmukhi-Bold.ttf; do
  cp "/usr/share/fonts/truetype/noto/$f" .
done
