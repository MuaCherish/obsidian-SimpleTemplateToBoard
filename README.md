# SimpleTemplateToBoard

> 简单模板转换到粘贴板 — Transform selected or copied text with a template, then copy the result straight to the clipboard.

[![Obsidian](https://img.shields.io/badge/Obsidian-%23483699.svg?style=flat&logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight [Obsidian](https://obsidian.md) plugin that turns a selected (or clipboard) text into a fixed format using user-defined templates, and copies the result onto the clipboard.
The common use cases need **no regex knowledge** — and full **regex capture groups** are available when you need it.

## Features

- 🪄 **Template profiles** — create, edit, test, and delete any number of templates.
- 🖱️ **Context menu** — right-click in the editor and pick a template to transform the current selection (or clipboard content).
- 📋 **Clipboard-first workflow** — the transformed result goes straight to the clipboard; optionally delete the original selection.
- 🧩 **Two input syntax modes**
  - **Placeholder mode** (`%1`, `%2`, …) — simple, no regex required.
  - **Regex mode** (`(...)` capture groups) — full regex power for advanced parsing.
- ✅ **Built-in test panel** — preview input → output before applying templates.
- 📝 **Line-wise matching** — process each input line separately in batch.

## Installation

### From source

```bash
git clone https://github.com/MuaCherish/obsidian-SimpleTemplateToBoard
cd obsidian-SimpleTemplateToBoard
npm install
npm run build
```

Then copy `main.js` and `manifest.json` into:

```
<your-vault>/.obsidian/plugins/simple-template-to-board/
```

Finally enable **简单模板转换到粘贴板 (SimpleTemplateToBoard)** under `Settings → Community plugins`.

### Manual (Release)

Download the latest release from [Releases](https://github.com/MuaCherish/obsidian-SimpleTemplateToBoard/releases), copy the whole plugin folder into the plugins directory above.

> If this plugin is published to Obsidian Community Plugins later, you can install it directly from the community plugin browser.

## Usage

1. Click the ribbon icon (🪄) to open the template settings panel.
2. Create a template (name + `<input>` / `<output>` blocks) and verify with the **Test** button.
3. Select some text in the editor, or copy text to your clipboard.
4. Right-click → **模板转换 (Template Transform)** → choose a template.
5. The transformed text is copied to clipboard. By default the original selection is deleted (configurable).

## Template syntax

A template consists of two blocks:

```
<input>
INPUT_PATTERN
</input>
<output>
OUTPUT_FORMAT
</output>
```

### Placeholder mode (default)

Use `%1`, `%2`, … as positional placeholders. All other text is treated as literal.

```
<input>
- %1 and %2
</input>
<output>
Please deep think, %1 and %2
<\n>===
</output>
```

> ⚠️ Note: `<\n>` is the special marker for a line break, not plain `\n`.

### Regex mode

If the `<input>` block contains **no `%N` placeholders**, it will be compiled as a regular expression. Capture groups `(...)` are referenced as `%1`, `%2`, … in the output.

```
<input>
- ([A-Za-z]+)-([0-9]+)
</input>
<output>
%1 = %2
</output>
```

### Output rules

- `%1`, `%2`, … refer to capture groups in left-to-right order.
- `<\n>` inserts a line break.
- Line breaks inside the output block are collapsed (consecutive breaks merge into one), so multi-line templates stay readable.

### Matching rules

- Each input line is matched once against the input pattern.
- `%N` placeholders match non-greedily (as little as possible).
- ✅ **Lines that do not match are kept as-is; empty lines are skipped.** This is different from many template tools that drop unmatched lines.

## Examples

### Placeholder mode

**Input**

```
- apple, and banana
- banana, and fish
- d and e
```

**Output**

```
Please deep think, apple, and banana
===
Please deep think, banana, and fish
===
Please deep think, d and e
===
```

### Regex mode

**Input**

```
- apple-42
- banana-7
```

**Output**

```
apple = 42
banana = 7
```

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `转换后删除原选区 (Delete selection after transform)` | on | Delete the original selected text after transformation. Turn it off to leave the editor content untouched. |

## Development

```bash
npm run dev     # watch and rebuild on changes
npm run build   # type-check + production build
node verify.js  # run offline transformation tests
```

## License

[MIT](LICENSE)
