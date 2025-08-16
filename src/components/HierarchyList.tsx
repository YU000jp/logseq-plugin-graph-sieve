import React, { useEffect, useRef, useState } from 'react';
import { Popover, CircularProgress } from '@mui/material';
import type { Box } from '../db';
import { BlockList } from './BlockList';
import type { BlockNode } from '../utils/blockText';
import { stripLogbook } from '../utils/content';

export interface HierarchyListProps {
  items: Box[];
  displayTitle: (name: string) => string;
  onOpenPage: (name: string) => void;
  basePrefix?: string; // optional: render relative to this prefix
  truncateAt?: number;
  // 左ペイン LIST 用: ホバー時に本文プレビューを表示
  enableHoverPreview?: boolean;
  currentGraph?: string;
  pagesDirHandle?: FileSystemDirectoryHandle;
  journalsDirHandle?: FileSystemDirectoryHandle;
}

type TreeNode = { key: string; label: string; fullName?: string; children: Map<string, TreeNode> };

const truncateLabel = (s: string, max = 24): { text: string; truncated: boolean } => {
  if (!s) return { text: '', truncated: false };
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max - 1) + '…', truncated: true };
};

const buildTree = (items: Box[], displayTitle: (name: string) => string, basePrefix?: string): TreeNode[] => {
  const roots = new Map<string, TreeNode>();
  const addNode = (segments: string[], fullName: string, label: string) => {
    if (segments.length === 0) return;
    const [head, ...rest] = segments;
    let node = roots.get(head);
    if (!node) { node = { key: head, label: head, children: new Map() }; roots.set(head, node); }
    let parent = node;
    for (const seg of rest) {
      let child = parent.children.get(seg);
      if (!child) { child = { key: seg, label: seg, children: new Map() }; parent.children.set(seg, child); }
      parent = child;
    }
    parent.fullName = fullName;
    parent.label = label || parent.key;
  };
  for (const it of items) {
    const name = it.name || '';
    const rel = (basePrefix && (name === basePrefix || name.startsWith(basePrefix + '/')))
      ? name.slice(basePrefix.length + (name === basePrefix ? 0 : 1))
      : name;
    const segs = rel.split('/').filter(Boolean);
    if (segs.length === 0) continue;
    addNode(segs, it.name, displayTitle(it.name));
  }
  return Array.from(roots.values());
};

const HierarchyList: React.FC<HierarchyListProps> = ({ items, displayTitle, onOpenPage, basePrefix, truncateAt = 24, enableHoverPreview, currentGraph, pagesDirHandle, journalsDirHandle }) => {
  const nodes = buildTree(items, displayTitle, basePrefix);
  const enableHover = !!enableHoverPreview;
  const folderMode = (currentGraph || '').startsWith('fs_');

  // Popover states (moved to component scope)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hoverName, setHoverName] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);
  const hideTimer = useRef<number | null>(null);

  const handleEnter = (e: React.MouseEvent<HTMLAnchorElement>, name: string) => {
    if (!enableHover) return;
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    setHoverName(name);
    setAnchorEl(e.currentTarget);
    setOpen(true);
  };
  const delayedClose = () => {
    if (!enableHover) return;
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { setOpen(false); setAnchorEl(null); }, 120) as unknown as number;
  };

  const PagePreviewBody: React.FC<{ name: string }> = ({ name }) => {
    const [blocks, setBlocks] = useState<BlockNode[] | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const parseBlocksFromText = (text: string): BlockNode[] => {
      if (!text) return [];
      // front-matter除去
      text = text.replace(/^---[\s\S]*?---\s*/m, '');
      // LOGBOOKを隠す
      text = stripLogbook(text);
      const lines = text.split(/\r?\n/);
      type T = { indent: number; content: string; children: T[] };
      const root: T = { indent: -1, content: '', children: [] };
      const stack: T[] = [root];
      const indentOf = (s: string) => (s.match(/^\s*/)?.[0].length || 0);
      const asContent = (s: string) => s.replace(/^\s*([-*+]\s+|\d+\.\s+)?/, '');
      for (const raw of lines) {
        const line = raw.replace(/\r/g, '');
        if (!line.trim()) continue;
        const indent = indentOf(line);
        const node: T = { indent, content: asContent(line), children: [] };
        while (stack.length && stack[stack.length-1].indent >= indent) stack.pop();
        (stack[stack.length-1].children as T[]).push(node);
        stack.push(node);
      }
      const toBlock = (n: T): BlockNode => ({ content: n.content, children: n.children.map(toBlock) });
      return root.children.map(toBlock);
    };
    useEffect(() => {
      let mounted = true;
      (async () => {
        setLoading(true);
        try {
          let file: File | null = null;
          if (pagesDirHandle) {
            const vname = [name, name.replace(/\//g,'___')];
            for (const base of vname) {
              const fh = await pagesDirHandle.getFileHandle(base + '.md').catch(()=>null) || await pagesDirHandle.getFileHandle(base + '.org').catch(()=>null);
              if (fh) { file = await fh.getFile(); break; }
            }
          }
          if (!file && journalsDirHandle) {
            const vname = [name, name.replace(/\//g,'___')];
            for (const base of vname) {
              const fh = await journalsDirHandle.getFileHandle(base + '.md').catch(()=>null) || await journalsDirHandle.getFileHandle(base + '.org').catch(()=>null);
              if (fh) { file = await fh.getFile(); break; }
            }
          }
          let text = '';
          if (file) text = await file.text();
          const blocksParsed: BlockNode[] = parseBlocksFromText(text);
          if (!mounted) return;
          setBlocks(blocksParsed);
        } finally { if (mounted) setLoading(false); }
      })();
      return () => { mounted = false; };
    }, [name, pagesDirHandle, journalsDirHandle]);
    const style: React.CSSProperties = { width: 600, height: 600, overflow: 'auto', padding: 8 };
    if (loading) return <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={20} /></div>;
    if (!blocks || blocks.length === 0) return <div style={style}>(no content)</div>;
    return (
      <div style={style} onMouseEnter={() => { if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; } }} onMouseLeave={delayedClose}>
        <BlockList
          blocks={blocks}
          hideProperties={true}
          hideReferences={true}
          alwaysHideKeys={[]}
          currentGraph={currentGraph}
          onOpenPage={onOpenPage}
          folderMode={folderMode}
          stripPageBrackets={false}
          hidePageRefs={false}
          hideQueries={false}
          hideRenderers={false}
          hideEmbeds={true}
          hideLogbook={true}
          assetsDirHandle={undefined}
          removeStrings={[]}
          normalizeTasks={false}
          highlightTerms={[]}
        />
      </div>
    );
  };

  // Pure recursive renderer
  const renderTree = (nodesIn: TreeNode[], level = 0): React.ReactNode => {
    if (!nodesIn || nodesIn.length === 0) return null;
    return (
      <ul className={'bul-list level-' + level}>
        {nodesIn.map((n) => {
          const hasChildren = n.children && n.children.size > 0;
          const t = n.fullName ? truncateLabel(n.label, truncateAt) : { text: n.label, truncated: false };
          return (
            <li key={n.key} className='bul-item'>
              {n.fullName ? (
                (() => {
                  const lbl = n.label || '';
                  const i = lbl.lastIndexOf('/');
                  if (i > 0) {
                    const prefix = lbl.slice(0, i + 1);
                    const tailRaw = lbl.slice(i + 1);
                    const tail = truncateLabel(tailRaw, truncateAt);
                    return (
                      <a
                        href='#'
                        onClick={(e)=>{ e.preventDefault(); onOpenPage(n.fullName!); }}
                        onMouseEnter={(e)=> handleEnter(e, n.fullName!)}
                        onMouseLeave={delayedClose}
                        className={'bul-link' + (tail.truncated ? ' truncated' : '')}
                        title={lbl}
                      >
                        <span className='bul-dim'>{prefix}</span>
                        <span className='bul-tail'>{tail.text}</span>
                      </a>
                    );
                  }
                  // no slash: fallback to whole text
                  return (
                    <a
                      href='#'
                      onClick={(e)=>{ e.preventDefault(); onOpenPage(n.fullName!); }}
                      onMouseEnter={(e)=> handleEnter(e, n.fullName!)}
                      onMouseLeave={delayedClose}
                      className={'bul-link' + (t.truncated ? ' truncated' : '')}
                      title={lbl}
                    >{t.text}</a>
                  );
                })()
              ) : (
                <span className='bul-label'>{n.label}</span>
              )}
              {hasChildren ? renderTree(Array.from(n.children.values()), level + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className='hierarchy-list'>
      {renderTree(nodes, 0)}
      {enableHover && (
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={() => setOpen(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          disableRestoreFocus
          slotProps={{ paper: { style: { pointerEvents: 'auto' } } as any }}
        >
          {hoverName ? <PagePreviewBody name={hoverName} /> : <div style={{ width: 600, height: 600 }} />}
        </Popover>
      )}
    </div>
  );
};

export default HierarchyList;
