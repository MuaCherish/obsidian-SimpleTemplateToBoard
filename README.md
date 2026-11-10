# SimpleTemplateToBoard

> 简单模板转换到粘贴板 — Transform selected or copied text with a template, then copy the result straight to the clipboard.

[![Obsidian](https://img.shields.io/badge/Obsidian-%23483699.svg?style=flat&logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A lightweight [Obsidian](https://obsidian.md) plugin that turns a selected (or copied) piece of text into a fixed format using a user-defined template, and copies the result onto the clipboard. The common case needs **no regex knowledge** — and full **regex** is available when you need it.

## Features

- 🪄 **Template profiles** — create, edit, test, and delete any number of templates.
- 🖱️ **Context menu** — right-click in the editor and pick a template to transform the current selection (or clipboard content).
- 📋 **Clipboard-first** — the result goes straight to the clipboard; optionally delete the original selection.
- 🧩 **Two input syntaxes**
  - **Placeholders** (`%1`, `%2`, …) — simple, no regex required.
  - **Regex** (`(...)` capture groups) — full power when you need it.
- ✅ **Built-in test panel** — verify input → output before using a template.

## Installation

### From source

```bash
git clone <repo-url> template-clipboard
cd template-clipboard
npm install
npm run build
```

Then copy `main.js` and `manifest.json` into:

```
<your-vault>/.obsidian/plugins/template-clipboard/
```

Finally enable **简单模板转换到粘贴板 (SimpleTemplateToBoard)** under `Settings → Community plugins`.

### Manual

Download the latest release and copy the whole plugin folder into the plugins directory above.

## Usage

1. Click the ribbon icon (🪄) to open the settings panel.
2. Create a template (a name plus `<input>` / `<output>` blocks) and check it with **Test**.
3. Select some text in the editor, or copy text to the clipboard.
4. Right-click → **模板转换** → choose a template.
5. The transformed text is copied to the clipboard. By default the original selection is also deleted (configurable).

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

Use `%1`, `%2`, … as positional placeholders. Everything else is treated as literal text.

```
<input>
- %1 and %2
</input>

<output>
Please deep think, %1 and %2
<\n>===
</output>
```

### Regex mode

If the `<input>` block contains **no** `%N` placeholder, it is compiled as a regular expression. Capture groups `(...)` are referenced as `%1`, `%2`, … in the output.

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
- `%N` placeholders match as little as possible (non-greedy).
- Lines that do not match are kept as-is; empty lines are skipped.

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
| `转换后删除原选区` | on | Delete the original selection after transforming. Turn it off to leave the text untouched. |

## Development

```bash
npm run dev     # watch and rebuild
npm run build   # type-check + production build
node verify.js  # run the transformation tests offline
```

## License

[MIT](LICENSE)
