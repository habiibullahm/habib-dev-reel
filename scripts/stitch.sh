#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

FRAMES=out/frames/frame_%04d.png
AUDIO=out/habib-hype.wav
OUT=out/habib-hype.mp4

# ffmpeg's image demuxer stops at the first gap, so the last frame existing is not enough.
for ((i = 0; i < 900; i++)); do
  frame=$(printf 'out/frames/frame_%04d.png' "$i")
  [[ -f "$frame" ]] || { echo "missing $frame; run: npm run frames" >&2; exit 1; }
done
[[ -f "$AUDIO" ]] || { echo "missing $AUDIO; run: npm run audio" >&2; exit 1; }

ffmpeg -y -hide_banner -loglevel warning -stats \
  -thread_queue_size 512 -framerate 30 -i "$FRAMES" \
  -i "$AUDIO" \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 44100 \
  -t 30 -movflags +faststart \
  "$OUT"

ls -lh "$OUT"
