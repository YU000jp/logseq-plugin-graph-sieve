# Logseq Graph Sieve Plugin
<div align="center">

Helper tool to extract and normalize plain text from a file‑based graph’s `pages` and `journals` folders using a simple card + preview interface.

</div>

[日本語](./README.ja.md) | English

## What is it?
Graph Sieve combines page discovery and normalization in one screen:

- Folder Mode (read‑only): choose your Logseq graph folder and browse pages without running Logseq
- Remove/normalize: properties, page refs, query blocks, renderers, [[Page]] brackets
- Extra normalization: always‑hide property keys, arbitrary string removal, task normalization, macro removal
- Helpful extras: preview tabs, related/sub‑pages, tab management, favorites

It’s a feature‑extended derivative of the CardBox plugin with a redesigned internal structure and settings model.

## Usage
1. Launch from the Logseq toolbar icon.
  > The icon may be hidden by default
2. Choose a folder
  - Click “Folder Mode” and select your graph’s root folder (it must contain a `pages` directory)
3. Work with cards
  - Empty pages aren’t listed
  - Click or move selection and press Enter to open a page in the right‑hand preview (opens as a tab)
4. In a tab
  - Switch view type (Content / No Markdown / RAW)
  - Copy content, close all tabs, etc.

## Preview tab types
- Content: Logseq‑like rendering (with property/ref hiding applied)
- No Markdown: Plain text with markup removed
- RAW: Processed raw markdown

## Text formatting / display options
Settings are persisted to localStorage.

- Hide properties
- Always hide properties (comma‑separated keys)
- Strip [[ ]] brackets ([[Page Title]] → Page Title)
- Enable page links
- Hide page refs
- Hide queries ({{query ...}})
- Hide renderers (e.g., {{renderer ...}})
- Remove macros (non‑query/custom macros)
- Normalize tasks (TODO/DOING/DONE… → Markdown checkboxes)
- Remove strings (filter substrings from body and copy output)

## Limitations / Notes
- Folder Mode does not fully reproduce Logseq’s hierarchy/metadata.
- Whiteboards and temporary in‑progress files are ignored.
- Some formatting may differ slightly from Logseq’s native rendering.

## Credits
- Based on / inspired by: [CardBox](https://github.com/sosuisen/logseq-cardbox) by [sosuisen](https://github.com/sosuisen)  [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://www.buymeacoffee.com/hidekaz)
- Libraries: React, Dexie, Material UI, @logseq/libs

## Author
Author: YU000jp [<img align="right" src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" height="30"/>](https://buymeacoffee.com/yu000japan)
