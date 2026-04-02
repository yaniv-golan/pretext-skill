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

An AI agent skill that helps developers use **[@chenglou/pretext](https://github.com/chenglou/pretext)** — the 15KB TypeScript library that computes exact text metrics without DOM reflows.

Uses the open [Agent Skills](https://agentskills.io) standard. Works with Claude Desktop, Claude Cowork, Claude Code, Codex CLI, Cursor, Windsurf, Manus, ChatGPT, and any other compatible tool.

## What It Does

Pretext computes exact text dimensions using pure math — no DOM reflows. This skill teaches AI agents how to use it correctly, covering:

- **API usage** — all 8 exported functions with correct argument order and types
- **Critical gotchas** — the lineHeight-must-be-pixels bug, argument order, font loading timing
- **Integration patterns** — wrapper modules, auto-fit font size, height estimation, text around obstacles
- **Creative patterns** — ASCII art, editorial layouts, shrink-wrap chat bubbles, 3D text wrapping, streaming AI chat
- **When NOT to use Pretext** — CSS-only solutions, HTML content, fragile virtualizer integrations

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

The skill auto-activates when you mention pretext, `@chenglou/pretext`, text measurement without DOM, auto-fit font size, `layoutNextLine`, or text around obstacles. Examples:

```
I need to measure text height without triggering a reflow
```

```
How do I auto-fit a headline to 3 lines using pretext?
```

```
Help me flow text around a circular image using layoutNextLine
```

## What Pretext Is

[Pretext](https://github.com/chenglou/pretext) is a 15KB TypeScript library by Cheng Lou. It uses `CanvasRenderingContext2D.measureText` internally, segments text, measures once, caches, then does arithmetic for all subsequent layouts. Each `layout()` call is ~0.0002ms — safe to call every animation frame.

**Key capabilities:**
- Know text dimensions before rendering (virtual scrolling, masonry layouts)
- Auto-fit text to a container (find largest font that fits N lines)
- Flow text around obstacles (magazine-style layouts)
- Measure text in canvas/SVG/WebGL

## License

MIT

---

Built with [Skill Creator Plus](https://github.com/yaniv-golan/skill-creator-plus).
