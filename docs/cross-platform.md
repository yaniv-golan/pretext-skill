# Cross-Platform Architecture

This skill ships from a single source of truth and works across multiple AI platforms. This document explains how.

## Source of Truth

```
pretext/                              <- plugin subdirectory
├── .claude-plugin/plugin.json        <- plugin manifest
└── skills/pretext/
    ├── SKILL.md                      <- canonical skill definition
    ├── VERSION                       <- runtime version
    └── references/                   <- detailed API & pattern docs
        ├── api.md
        └── patterns.md
```

## How Each Platform Consumes the Skill

### Claude Code / Claude Cowork — direct from repo

- Installs from the plugin marketplace: `/plugin marketplace add yaniv-golan/pretext-skill`
- Marketplace manifest: `.claude-plugin/marketplace.json` with `"source": "./pretext"`
- Plugin manifest: `pretext/.claude-plugin/plugin.json` with `"skills": "./skills"`
- Claude Code discovers `pretext/skills/pretext/SKILL.md` automatically

### Cursor — direct from repo

- Installs as a plugin: Settings -> paste repo URL into "Search or Paste Link"
- Manifest: `.cursor-plugin/plugin.json` with `"skills": "./pretext/skills"`
- Same `SKILL.md` as Claude Code

### Claude Desktop — install button or manual

- Use the "Install in Claude Desktop" button in the README
- Or: Customize -> Browse Plugins -> Personal -> + -> Add marketplace -> `yaniv-golan/pretext-skill`

### Manus — upload zip from GitHub Releases

- Download `pretext-skill.zip` from the latest release
- Upload at Settings -> Skills -> + Add -> Upload
- The zip contains a flat `pretext/` folder

### ChatGPT — upload zip from GitHub Releases

- Download `pretext-skill.zip` from the latest release
- Upload as a skill in ChatGPT settings
- The zip contains a flat `pretext/` folder

### Codex CLI — install from repo or zip

**From repo (preferred):**

```
$skill-installer https://github.com/yaniv-golan/pretext-skill
```

**From zip (manual):** Download `pretext-skill.zip` from GitHub Releases and extract to `~/.codex/skills/`.

### Others (Windsurf, etc.) — same zip

- Download and extract to `~/.agents/skills/` or `.agents/skills/` in the project root

## Release Workflow

CI (`.github/workflows/release.yml`) runs on version tags (`v*`) and produces the generic zip:

```bash
mkdir -p dist
cp -r pretext/skills/pretext dist/pretext
find dist/pretext -name '*.md' -exec sed -i 's|\${CLAUDE_SKILL_DIR}/||g' {} +
cd dist && zip -r ../pretext-skill.zip pretext/
```

## Version Management

The canonical version lives in `VERSION` at the repo root. Run `./tools/bump-version.sh` to propagate it to all locations. See [VERSIONING.md](../VERSIONING.md) for the full release process.
