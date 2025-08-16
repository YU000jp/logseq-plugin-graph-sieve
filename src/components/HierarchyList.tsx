import React from 'react';
import { Popover, CircularProgress } from '@mui/material';
import type { Box } from '../db';
import { BlockList } from './BlockList';
// (unused imports removed)
import { useHoverPagePreview } from '../hooks/useHoverPagePreview';
import { getOpenPageLinkProps } from '../utils/openLink';

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
  const folderMode = (currentGraph || '').startsWith('fs_');
  const enableHover = !!enableHoverPreview && folderMode;
  // Reusable hover preview hook (1.5s hover to open, keep visible min 2s)
  const { getHoverZoneProps, open, anchorEl, hoverName, previewBlocks, previewLoading, popoverProps } = useHoverPagePreview({
    enable: enableHover,
    folderMode,
    pagesDirHandle,
    journalsDirHandle,
  });

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
                      <span
                        className='bul-hover-zone'
                        {...getHoverZoneProps(n.fullName!)}
                        style={{ display:'inline-block', padding:'3px 6px', margin:'-3px -6px', borderRadius:4 }}
                      >
                        <a
                          {...getOpenPageLinkProps(n.fullName!, onOpenPage, { stopPropagation: true })}
                          className={'bul-link' + (tail.truncated ? ' truncated' : '')}
                          title={lbl}
                        >
                          <span className='bul-dim'>{prefix}</span>
                          <span className='bul-tail'>{tail.text}</span>
                        </a>
                      </span>
                    );
                  }
                  // no slash: fallback to whole text
                  return (
                    <span
                      className='bul-hover-zone'
                      {...getHoverZoneProps(n.fullName!)}
                      style={{ display:'inline-block', padding:'3px 6px', margin:'-3px -6px', borderRadius:4 }}
                    >
                      <a
                        {...getOpenPageLinkProps(n.fullName!, onOpenPage, { stopPropagation: true })}
                        className={'bul-link' + (t.truncated ? ' truncated' : '')}
                        title={lbl}
                      >{t.text}</a>
                    </span>
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
          onClose={popoverProps.onClose}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          disableRestoreFocus
          keepMounted
          slotProps={{ paper: { style: { pointerEvents: 'auto' } } as any }}
        >
          {hoverName ? (
            <div
              style={{ maxWidth: 600, maxHeight: 600, overflow: 'auto', padding: 8 }}
              onMouseEnter={popoverProps.onMouseEnter}
              onMouseLeave={popoverProps.onMouseLeave}
              onMouseOver={popoverProps.onMouseOver}
              onClickCapture={(e) => e.stopPropagation()}
              onMouseDownCapture={(e) => e.stopPropagation()}
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              {previewLoading ? (
                <div style={{ width: '100%', height: '100%', display:'flex', alignItems:'center', justifyContent:'center' }}><CircularProgress size={20} /></div>
              ) : (
                (previewBlocks && previewBlocks.length > 0) ? (
                  <BlockList
                    blocks={previewBlocks}
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
                    enableHoverPreview={true}
                    pagesDirHandle={pagesDirHandle}
                    journalsDirHandle={journalsDirHandle}
                  />
                ) : (
                  <div style={{ padding:'8px 12px', color:'#64748b', fontSize:12 }}>(no content)</div>
                )
              )}
            </div>
          ) : <div style={{ maxWidth: 600, maxHeight: 600 }} />}
        </Popover>
      )}
    </div>
  );
};

export default HierarchyList;
