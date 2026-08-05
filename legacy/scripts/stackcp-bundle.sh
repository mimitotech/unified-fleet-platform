#!/usr/bin/env bash
# Build on your Mac (npm run build), zip dist folders for StackCP File Manager upload.
# Database stays on the server — .env on the server is not touched.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE="$ROOT/stackcp-bundle"
ZIP="$ROOT/mams-stackcp-upload.zip"

cd "$ROOT"

echo "==> Building (npm run build)…"
npm run build

echo "==> Staging upload bundle…"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"

copy() {
  local src="$1"
  local dest="$2"
  if [[ -e "$src" ]]; then
    mkdir -p "$(dirname "$dest")"
    cp -R "$src" "$dest"
  fi
}

copy "$ROOT/backend/dist" "$BUNDLE/backend/dist"
copy "$ROOT/frontend/dist" "$BUNDLE/frontend/dist"
copy "$ROOT/packages/shared/dist" "$BUNDLE/packages/shared/dist"

test -f "$BUNDLE/backend/dist/index.js" || { echo "Missing backend/dist/index.js"; exit 1; }
test -f "$BUNDLE/frontend/dist/index.html" || { echo "Missing frontend/dist/index.html"; exit 1; }

echo "==> Creating zip…"
rm -f "$ZIP"
(
  cd "$BUNDLE"
  zip -rq "$ZIP" .
)

BYTES="$(wc -c < "$ZIP" | tr -d ' ')"
echo ""
echo "Done."
echo "  Upload zip: $ZIP ($BYTES bytes)"
echo ""
echo "Upload to StackCP File Manager → repos/mams → extract (overwrite dist folders)."
echo "Do not replace .env — your MySQL settings stay as they are."
echo "Then restart the mams Node app."
