#!/usr/bin/env bash
set -euo pipefail

# Usage: ./tools/bump-version.sh [VERSION]
# If VERSION is provided, writes it to VERSION file first.
# Then propagates from VERSION to all other locations.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${1:-}" != "" ]; then
  echo "$1" > "$REPO_ROOT/VERSION"
fi

VERSION="$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')"
echo "Bumping to version: $VERSION"

# 1. Plugin manifest (pretext/.claude-plugin/plugin.json)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO_ROOT/pretext/.claude-plugin/plugin.json"

# 2. Cursor plugin manifest (.cursor-plugin/plugin.json)
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$REPO_ROOT/.cursor-plugin/plugin.json"

# 3. SKILL.md frontmatter (metadata.version)
sed -i '' "s/version: \"[^\"]*\"/version: \"$VERSION\"/" "$REPO_ROOT/pretext/skills/pretext/SKILL.md"

# 4. Skill VERSION file
cp "$REPO_ROOT/VERSION" "$REPO_ROOT/pretext/skills/pretext/VERSION"

echo "Version $VERSION propagated to all locations."
