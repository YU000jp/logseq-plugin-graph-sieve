<div align="center">

# Logseq Graph Sieve Plugin <a href="https://www.buymeacoffee.com/hidekaz"><img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30" /></a>

Helper tool to extract plain text from pages in your current graph or from an "old" graph folder (read‑only) using a simple card + preview interface.

Logseq mode: load the currently opened file‑based graph.  
Folder mode: load an external (old) graph folder for read‑only plain text extraction.

</div>

[日本語](./README.ja.md) | English

## What is it?
Graph Sieve focuses on three things:

- Switch between the active Logseq graph and any read‑only folder (Folder Mode)
- Clean / normalize text: remove properties, refs, embeds, blank lines, [[Page]] brackets, page refs
- Additional normalization: always‑hide property keys, arbitrary string removal (removeStrings), hide query blocks

It is a feature‑extended derivative of the CardBox plugin with a reworked internal structure and settings model.

## Usage
1. Launch (toolbar icon).
2. Close with `Esc` or by clicking outside.
3. On launch you see a card list for the current graph.  
  > Use the button on the right side to switch to Folder Mode.
4. Click a card to open it in the right‑hand preview (a tab opens).
5. Inside a tab you can switch view type, copy text, open in Logseq, or create a new page in Logseq from the content.

## Preview Tab Types
- Content: Rendered style blocks (with property / ref hiding applied)
- No Markdown: Plain text with markup stripped
- Raw: Original markdown (after removal of Logseq‑specific artifacts)

## Text Cleanup Options
| Option | Purpose |
|--------|---------|
| Hide properties | Remove properties from rendered output |
| Always hide properties | Comma separated property keys to always hide |
| Strip [[...]] brackets | [[Page Title]] → Page Title |
| Remove page refs | Show plain text (no link) |
| Hide query blocks | Remove {{query ...}} blocks |
| String removal (removeStrings) | Delete listed substrings from body & copy output |

Settings persist in localStorage.

## Limitations / Notes
- Folder Mode cannot fully reproduce Logseq hierarchy / metadata.
- Whiteboards / temporary in‑progress files are ignored.
- Formatting may differ slightly from native Logseq rendering.

## Credits
- Based on / inspired by: [CardBox](https://github.com/sosuisen/logseq-cardbox) by [sosuisen](https://github.com/sosuisen)  [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://www.buymeacoffee.com/hidekaz)
- Libraries: React, Dexie, Material UI, @logseq/libs

## Author
Author: YU000jp [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://buymeacoffee.com/yu000japan)
