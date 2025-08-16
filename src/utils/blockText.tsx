import React from 'react';
import { normalizeTaskLines as normalizeTaskLinesUtil } from './text';
import { stripLogbook, isForcedHiddenPropLine } from './content';
import { useTranslation } from 'react-i18next';

export interface BlockNode { content?: string; children?: BlockNode[]; }
export interface BlockTextOptions {
  hideProperties: boolean;
  hideReferences: boolean;
  alwaysHideKeys: string[];
  folderMode: boolean;
  removeStrings: string[];
  hideQueries?: boolean;
  firstLineOnly?: boolean;
  stripPageBrackets?: boolean;
  stripLogbook?: boolean; // default true; when false, keep :LOGBOOK: sections
}
export type LineEmit = (args: { depth: number; core: string }) => void;

export const RE = {
  bulletStart: /^\s*([-*+]|\d+\.)\s+/,  refOrEmbed: /((\(\([0-9a-fA-F-]{36}\)\)))|\{\{\s*embed\b[^}]*\}\}/i,
  inlineRef: /\(\([0-9a-fA-F-]{36}\)\)/g, inlineEmbedBlock: /\{\{\s*embed\s*\(\([0-9a-fA-F-]{36}\)\)\s*\}\}/gi,
  inlineEmbedPage: /\{\{\s*embed\s*\[\[[^\]]+\]\]\s*\}\}/gi, query: /\{\{\s*query\b[^}]*\}\}/i,
  renderer: /\{\{\s*renderer\b[^}]*\}\}/i,
  loneDash: /^\s*-\s*$/, pageRef: /\[\[([^\]]+)\]\]/g, mdImage: /!\[[^\]]*\]\([^)]*\)/g,
  mdLink: /\[([^\]]+)\]\([^)]*\)/g, lsLinkWithAlias: /\[\[([^\]]+)\]\[([^\]]*)\]\]/g, uuid: /[0-9a-fA-F-]{36}/
};

const stripMarkdown = (s: string): string => {
  let out = s;
  out = out.replace(/^\s*```.*$/g, '')
    .replace(/^\s*#{1,6}\s+/g, '')
    .replace(/^\s*\*{1,6}\s+/g, '')
    .replace(/^\s*[-*+]\s+/g, '')
    .replace(/^\s*\d+\.\s+/g, '')
    .replace(/\s*\[(?:x|X| )\]\s*/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/(^|\s)#(\S+)/g, '$1$2');
  return out;
};

// moved to utils/content.ts

/**
 * Remove structural LOGBOOK ranges from a BlockNode array.
 * This removes any sibling sequence starting with a node whose content is ':LOGBOOK:'
 * and continues removing nodes until a sibling with content ':END:' is encountered (inclusive).
 * Runs recursively for children as well.
 */
export function stripLogbookNodes(nodes: BlockNode[] | undefined | null): BlockNode[] {
  if (!nodes || nodes.length === 0) return [];
  const result: BlockNode[] = [];
  let skipping = false;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const content = (n.content || '').replace(/\r/g, '').trim();
    if (!skipping && /^:LOGBOOK:\s*$/i.test(content)) {
      skipping = true;
      continue; // drop the :LOGBOOK: marker itself
    }
    if (skipping) {
      // keep skipping until we see :END:
      if (/^:END:\s*$/i.test(content)) {
        skipping = false; // drop the :END: line and stop skipping
      }
      continue; // drop content in LOGBOOK section
    }
    const children = n.children && n.children.length ? stripLogbookNodes(n.children) : [];
    // create a shallow copy to avoid mutating original structure
    result.push({ content: n.content, children });
  }
  return result;
}

export function walkBlocks(blocks: BlockNode[], opts: BlockTextOptions, depth: number, emit: LineEmit) {
  const { hideProperties, hideReferences, alwaysHideKeys, folderMode, removeStrings, hideQueries, firstLineOnly, stripLogbook: stripLog = true } = opts;
  const levelBlocks = stripLog ? stripLogbookNodes(blocks) : blocks;
  for (const b of levelBlocks) {
    let raw = b.content ?? '';
    if (stripLog !== false) raw = stripLogbook(raw);
    if (removeStrings && removeStrings.length) for (const rs of removeStrings) if (rs) raw = raw.split(rs).join('');
    const rawLines = raw.split('\n');
    const iterate = firstLineOnly ? rawLines.slice(0,1) : rawLines;
    for (const line of iterate) {
      const l = line.replace(/\r/g,''); if (!l.trim()) continue;
      if (isForcedHiddenPropLine(l, alwaysHideKeys)) continue;
      if (hideProperties && l.includes(':: ')) continue;
      if (hideQueries && RE.query.test(l)) continue;
      if (RE.refOrEmbed.test(l)) { // refs / embeds
        if (hideReferences) continue;
        if (folderMode) {
          let processed = l.replace(RE.inlineRef,'')
            .replace(RE.inlineEmbedBlock,'')
            .replace(RE.inlineEmbedPage,'')
            .replace(/\s+/g,' ').trim();
          if (!processed) continue;
            const core2 = RE.bulletStart.test(processed) ? processed.replace(RE.bulletStart,'') : processed;
            emit({ depth, core: core2 });
        }
        continue;
      }
      const coreLine = RE.bulletStart.test(l) ? l.replace(RE.bulletStart,'') : l;
      if (folderMode && RE.loneDash.test(coreLine)) continue;
      emit({ depth, core: coreLine });
    }
  if (b.children && b.children.length) walkBlocks(b.children as BlockNode[], opts, depth + 1, emit);
  }
}

export function flattenBlocksToText(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, depth = 0, alwaysHideKeys: string[] = [], folderMode = false, removeStrings: string[] = [], stripLogbookFlag: boolean = true): string {
  const indent = (n: number) => '  '.repeat(n);
  const lines: string[] = [];
  walkBlocks(blocks, { hideProperties, hideReferences, alwaysHideKeys, folderMode, removeStrings, stripLogbook: stripLogbookFlag }, depth, ({ depth: d, core }) => {
    lines.push(`${indent(d)}- ${core}`);
  });
  return lines.join('\n');
}

export function blocksToPlainText(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, depth = 0, alwaysHideKeys: string[] = [], folderMode: boolean = false, removeStrings: string[] = [], stripLogbookFlag: boolean = true): string {
  const lines: string[] = [];
  walkBlocks(blocks, { hideProperties, hideReferences, alwaysHideKeys, folderMode, removeStrings, stripLogbook: stripLogbookFlag }, depth, ({ depth: d, core }) => {
    const onlyMdImg = /^(?:!\[[^\]]*\]\([^)]*\))$/.test(core.trim());
    const onlyOrgImg = /^\[\[[^\]]+\](?:\[[^\]]*\])?\]$/.test(core.trim());
    if (onlyMdImg || onlyOrgImg) return;
    if (!hideReferences && RE.uuid.test(core) && core.trim() === core) {
      const uuid = core.match(RE.uuid)?.[0] || '';
      lines.push(`${'  '.repeat(d)}[ref] ${uuid}`);
    } else {
      const stripped = stripMarkdown(core);
      if (stripped.trim()) lines.push(`${'  '.repeat(d)}${stripped}`);
    }
  });
  return lines.join('\n');
}

export function outlineTextFromBlocks(blocks: BlockNode[], opts: { hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; hideQueries?: boolean; removeStrings?: string[]; stripPageBrackets?: boolean } = {}) {
  const { hideProperties=false, hideReferences=false, alwaysHideKeys=[], hideQueries=false, removeStrings=[], stripPageBrackets=false } = opts;
  const lines: string[] = [];
  walkBlocks(blocks, { hideProperties, hideReferences, alwaysHideKeys, folderMode:false, removeStrings, hideQueries, firstLineOnly:true }, 0, ({ depth, core }) => {
    let line = core;
    if (stripPageBrackets) line = line.replace(RE.pageRef,'$1');
    line = line
      .replace(RE.mdImage,'')
      .replace(RE.mdLink,'$1')
      .replace(RE.lsLinkWithAlias,(_,u,txt)=> txt || u);
    const trimmed = line.trim();
    if (trimmed) lines.push(`${'  '.repeat(depth)}- ${trimmed}`);
  });
  return lines.join('\n');
}

export const RawCustomView: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; stripPageBrackets?: boolean; hideQueries?: boolean; removeStrings?: string[]; folderMode?: boolean; normalizeTasks?: boolean; hideLogbook?: boolean }> = ({ blocks, hideProperties = false, hideReferences = false, alwaysHideKeys = [], stripPageBrackets = false, hideQueries = false, removeStrings = [], folderMode = false, normalizeTasks = false, hideLogbook = true }) => {
  const normalizeTaskLinesLocal = (text: string, enable: boolean) => normalizeTaskLinesUtil(text, enable);
  // RAW: 生テキスト表示（LOGBOOK はトグルに従う）
  let text = flattenBlocksToText(blocks, hideProperties, hideReferences, 0, alwaysHideKeys, folderMode, removeStrings, !!hideLogbook);
  if (stripPageBrackets) {
    text = text.replace(/\[\[([^\]]+)\]\]/g,'$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/\[\[([^\]]+)\]\[([^\]]*)\]\]/g, (_, u, txt) => txt || u);
  }
  if (hideQueries) text = text.replace(/\{\{\s*query[^}]*\}\}/ig,'');
  if (normalizeTasks) text = normalizeTaskLinesLocal(text, true);
  text = text.split('\n').filter(l => !/^\s*-\s*-\s*$/.test(l) && l.trim().length > 0).join('\n');
  if (!text.trim()) {
    const { t } = useTranslation();
    return <div className='sidebar-empty'>{t('no-content')}</div>;
  }
  return <pre className='ls-plain-text'>{text}</pre>;
};

export const PlainTextView: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; folderMode?: boolean; stripPageBrackets?: boolean; hideQueries?: boolean; removeStrings?: string[]; hideLogbook?: boolean }> = ({ blocks, hideProperties, hideReferences, alwaysHideKeys = [], folderMode, stripPageBrackets, hideQueries, removeStrings = [], hideLogbook = true }) => {
  let text = blocksToPlainText(blocks, !!hideProperties, !!hideReferences, 0, alwaysHideKeys, !!folderMode, removeStrings, !!hideLogbook);
  if (hideQueries) text = text.split('\n').filter(l => !/\{\{\s*query\b/i.test(l)).join('\n');
  if (stripPageBrackets) text = text.replace(/\[\[([^\]]+)\]\]/g,'$1');
  if (removeStrings && removeStrings.length) for (const rs of removeStrings) if (rs) text = text.split(rs).join('');
  text = text
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g,'$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1')
    .replace(/\[\[([^\]]+)\]\[([^\]]*)\]\]/g, (_, u, txt) => txt || u)
    .split('\n').map(l => l.replace(/\s+$/,'')).join('\n')
    .split('\n').filter(l => l.trim().length > 0).join('\n')
    .replace(/\n{3,}/g,'\n\n').trim();
  if (!text || text.trim().length === 0) {
    const { t } = useTranslation();
    return <div className='sidebar-empty'>{t('no-content')}</div>;
  }
  return <pre className='ls-plain-text'>{text}</pre>;
};
