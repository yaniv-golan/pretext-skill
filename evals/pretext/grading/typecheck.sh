#!/bin/bash
# usage: typecheck.sh <file> [1.0.0|0.0.8]   Type-checks one generated file in a clean scratch dir.
# 0.0.8 needs the old package in evals/pretext-workspace/pretext-0.0.8/package: see grading.typecheck.old_version in ../evals.json
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$HERE/../../.."; VERIFY="$REPO/tools/verify"
FILE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; VERSION="${2:-1.0.0}"
DIR="$(mktemp -d)"; trap 'rm -rf "$DIR"' EXIT
if [ "$VERSION" = 1.0.0 ]; then ln -s "$VERIFY/node_modules" "$DIR/node_modules"
else mkdir -p "$DIR/node_modules/@chenglou"; ln -s "$HERE/../../pretext-workspace/pretext-0.0.8/package" "$DIR/node_modules/@chenglou/pretext"; fi
cp "$FILE" "$DIR/"; cd "$DIR"
node "$VERIFY/node_modules/typescript/bin/tsc" --noEmit --strict false --allowJs --checkJs --skipLibCheck --target es2022 --module esnext --moduleResolution bundler --lib es2022,dom,dom.iterable --jsx preserve "$(basename "$FILE")"
