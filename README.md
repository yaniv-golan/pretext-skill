# Pretext Skill

<p align="center">
  <img src="assets/banner.png" alt="Pretext Skill" width="100%">
</p>

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in_Claude_Desktop-D97757?style=for-the-badge&logo=claude&logoColor=white)](https://yaniv-golan.github.io/pretext-skill/static/install-claude-desktop.html)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Agent Skills Compatible](https://img.shields.io/badge/Agent_Skills-compatible-4A90D9)](https://agentskills.io)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-plugin-F97316)](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/plugins)
[![Cursor Plugin](https://img.shields.io/badge/Cursor-plugin-00D886)](https://cursor.com/docs/plugins)
[![Built with Skill Creator Plus](https://img.shields.io/badge/Built_with-Skill_Creator_Plus-4ecdc4?style=flat-square)](https://github.com/yaniv-golan/skill-creator-plus)

An AI agent skill that helps developers use **[@chenglou/pretext](https://github.com/chenglou/pretext)** — a TypeScript library that predicts line breaks and heights without DOM reflows.

Uses the open [Agent Skills](https://agentskills.io) standard. Works with Claude Desktop, Claude Cowork, Claude Code, Codex CLI, Cursor, Windsurf, Manus, ChatGPT, and any other compatible tool.

## About @chenglou/pretext

[Pretext](https://github.com/chenglou/pretext) is a TypeScript library by Cheng Lou that predicts line breaks and heights. It segments text and measures it once with `CanvasRenderingContext2D.measureText`, using ports of each browser's line breaker, then lays it out at any width with arithmetic alone, cheap enough to call on every animation frame.

**Key capabilities:**
- Know text dimensions before rendering (virtual scrolling, masonry layouts)
- Auto-fit text to a container (find largest font that fits N lines)
- Flow text around obstacles (magazine-style layouts)
- Render rich inline text — mentions, chips, code spans — via the `@chenglou/pretext/rich-inline` subpath
- Measure text in canvas/SVG/WebGL

## What This Skill Covers

This skill teaches AI agents how to use pretext correctly. Tracks `@chenglou/pretext` 1.0.0.

- **API usage** — all 12 core functions plus the 5 in `@chenglou/pretext/rich-inline`, with correct argument order and types
- **Critical gotchas** — the lineHeight-must-be-pixels bug, text-before-font argument order, `layoutNextLine` taking the width before the cursor since 1.0 (the old order loops forever), font loading and invalid font strings, handles tied to the version that made them
- **Migration** — upgrading from 0.0.x to 1.0: checking the installed version, finding old usage, breaking and silent changes
- **Accuracy** — painting text so the browser wraps it to the same lines, font and language pitfalls, CSS Pretext doesn't model, running outside the browser
- **Integration patterns** — wrapper modules, auto-fit font size, height estimation, truncation with an ellipsis, virtualized lists, text around obstacles with and without string allocation, rich inline runs with chips, mentions and images, shrink-wrap chat bubbles
- **Creative patterns** — editorial layouts, balanced/Knuth-Plass paragraphs, streaming AI chat, framework-integration idioms (React/Vue/Svelte)
- **When NOT to use Pretext** — CSS-only solutions, and mixed HTML content Pretext can't size

## Installation

### Claude.ai (Web)

1. Download [`pretext-skill.zip`](https://github.com/yaniv-golan/pretext-skill/releases/latest/download/pretext-skill.zip)
2. Click **Customize** in the sidebar
3. Go to **Skills** and click **+**
4. Choose **Upload a skill** and upload the zip file

### Claude Desktop

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in_Claude_Desktop-D97757?style=for-the-badge&logo=claude&logoColor=white)](https://yaniv-golan.github.io/pretext-skill/static/install-claude-desktop.html)

*— or install manually —*

1. Click **Customize** in the sidebar
2. Click **Browse Plugins**
3. Go to the **Personal** tab and click **+**
4. Choose **Add marketplace**
5. Type `yaniv-golan/pretext-skill` and click **Sync**

### Claude Code (CLI)

From your terminal:

```bash
claude plugin marketplace add https://github.com/yaniv-golan/pretext-skill
claude plugin install pretext@pretext-marketplace
```

Or from within a Claude Code session:

```
/plugin marketplace add yaniv-golan/pretext-skill
/plugin install pretext@pretext-marketplace
```

### Cursor

1. Open **Cursor Settings**
2. Paste `https://github.com/yaniv-golan/pretext-skill` into the **Search or Paste Link** box

### Manus

1. Download [`pretext-skill.zip`](https://github.com/yaniv-golan/pretext-skill/releases/latest/download/pretext-skill.zip)
2. Go to **Settings** -> **Skills**
3. Click **+ Add** -> **Upload**
4. Upload the zip

### ChatGPT

> **Note:** ChatGPT Skills are currently in beta, available on Business, Enterprise, Edu, Teachers, and Healthcare plans only.

1. Download [`pretext-skill.zip`](https://github.com/yaniv-golan/pretext-skill/releases/latest/download/pretext-skill.zip)
2. Upload at [chatgpt.com/skills](https://chatgpt.com/skills)

### Codex CLI

Use the built-in skill installer:

```
$skill-installer https://github.com/yaniv-golan/pretext-skill
```

Or install manually:

1. Download [`pretext-skill.zip`](https://github.com/yaniv-golan/pretext-skill/releases/latest/download/pretext-skill.zip)
2. Extract the `pretext/` folder to `~/.codex/skills/`

### Any Agent (npx)

Works with Claude Code, Cursor, Copilot, Windsurf, and [40+ other agents](https://github.com/vercel-labs/skills):

```bash
npx skills add yaniv-golan/pretext-skill
```

### Other Tools (Windsurf, etc.)

Download [`pretext-skill.zip`](https://github.com/yaniv-golan/pretext-skill/releases/latest/download/pretext-skill.zip) and extract the `pretext/` folder to:

- **Project-level**: `.agents/skills/` in your project root
- **User-level**: `~/.agents/skills/`

## Usage

The skill auto-activates whenever your AI assistant encounters something it covers. Triggers include any mention of pretext, `@chenglou/pretext`, or `@chenglou/pretext/rich-inline`; symptom phrases like *"measure text height without triggering DOM reflow"*; capability mentions like auto-fitting font size, flowing text around obstacles, computing intrinsic line width, rich inline runs with chips or mentions; and API names like `layoutNextLine`, `layoutNextLineRange`, or `prepareWithSegments`. Example queries:

```
I need to measure text height without triggering a reflow
```

```
How do I auto-fit a headline to 3 lines using pretext?
```

```
Help me flow text around a circular image using layoutNextLine
```

```
How do I render an @mention chip inside a chat bubble using pretext's rich-inline?
```

```
Upgrade this project from pretext 0.0.x to 1.0 and fix the calls that changed
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full version history. The latest release notes are on the [GitHub Releases](https://github.com/yaniv-golan/pretext-skill/releases) page.

## Contributing

- [docs/cross-platform.md](docs/cross-platform.md) — how this single repo ships to Claude Code, Cursor, ChatGPT, Manus, Codex CLI, and any agentskills.io host
- [VERSIONING.md](VERSIONING.md) — version source-of-truth and release process

## License

MIT

---

Built with [Skill Creator Plus](https://github.com/yaniv-golan/skill-creator-plus).
