import { useCallback, useRef, useState } from 'react';
import type { BlockNode } from '../utils/blockText';
import { stripLogbook as stripLogbookUtil } from '../utils/content';
import { buildNameCandidates, resolveFileFromDirs } from '../utils/linkResolver';

export interface HoverPreviewOptions {
  enable: boolean;
  folderMode?: boolean;
  currentGraph?: string;
  pagesDirHandle?: FileSystemDirectoryHandle;
  journalsDirHandle?: FileSystemDirectoryHandle;
  onOpenPage?: (name: string) => void;
  showDelayMs?: number; // default 1500
  minVisibleMs?: number; // default 2000
}

export interface HoverPreviewApi {
  getHoverZoneProps: (name: string) => {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => void;
  };
  open: boolean;
  anchorEl: HTMLElement | null;
  hoverName: string;
  previewBlocks: BlockNode[] | null;
  previewLoading: boolean;
  popoverProps: {
    onClose: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onMouseOver: () => void;
  };
}

export function useHoverPagePreview(opts: HoverPreviewOptions): HoverPreviewApi {
  const { enable, folderMode, pagesDirHandle, journalsDirHandle, showDelayMs = 1500, minVisibleMs = 2000 } = opts;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hoverName, setHoverName] = useState<string>('');
  const [open, setOpen] = useState<boolean>(false);
  const [previewBlocks, setPreviewBlocks] = useState<BlockNode[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const overZoneRef = useRef<boolean>(false);
  const overPopoverRef = useRef<boolean>(false);
  const minVisibleUntilRef = useRef<number>(0);
  const loadedForNameRef = useRef<string>('');
  const previewLoadingRef = useRef<boolean>(false);

  const parseBlocksFromText = useCallback((text: string): BlockNode[] => {
    if (!text) return [];
    text = text.replace(/^---[\s\S]*?---\s*/m, '');
    text = stripLogbookUtil(text);
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
  }, []);

  const loadPreviewIfNeeded = useCallback(async (name: string) => {
    if (!enable || !folderMode) return;
    if (loadedForNameRef.current === name && (previewBlocks && previewBlocks.length >= 0)) return;
    if (previewLoadingRef.current) return;
    setPreviewLoading(true);
    previewLoadingRef.current = true;
    try {
  const candidates = buildNameCandidates(name);
  const located = await resolveFileFromDirs([pagesDirHandle, journalsDirHandle], candidates, { scanFallback: true });
  const file: File | null = located?.file || null;
      let text = '';
      if (file) text = await file.text();
      const blocksParsed: BlockNode[] = parseBlocksFromText(text);
      loadedForNameRef.current = name;
      setPreviewBlocks(blocksParsed);
    } finally { setPreviewLoading(false); previewLoadingRef.current = false; }
  }, [enable, folderMode, pagesDirHandle, journalsDirHandle, parseBlocksFromText, previewBlocks]);

  const startShowTimer = useCallback((target: HTMLElement, name: string) => {
    if (!enable) return;
    if (hideTimerRef.current) { window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
    if (hoverName !== name) {
      setHoverName(name);
      setPreviewBlocks(null);
      loadedForNameRef.current = '';
    }
    setAnchorEl(target);
    overZoneRef.current = true;
    void loadPreviewIfNeeded(name);
    showTimerRef.current = window.setTimeout(() => {
      setOpen(true);
      minVisibleUntilRef.current = Date.now() + minVisibleMs;
    }, showDelayMs) as unknown as number;
  }, [enable, hoverName, loadPreviewIfNeeded, minVisibleMs, showDelayMs]);

  const maybeClose = useCallback(() => {
    if (!enable) return;
    if (showTimerRef.current) { window.clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    const check = () => {
      const now = Date.now();
      const tooEarly = now < minVisibleUntilRef.current;
      if (overZoneRef.current || overPopoverRef.current || tooEarly) {
        hideTimerRef.current = window.setTimeout(check, Math.max(100, minVisibleUntilRef.current - now));
        return;
      }
      setOpen(false); setAnchorEl(null);
    };
    hideTimerRef.current = window.setTimeout(check, 100) as unknown as number;
  }, [enable]);

  const getHoverZoneProps = useCallback((name: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { startShowTimer(e.currentTarget as HTMLElement, name); },
    onMouseLeave: () => { overZoneRef.current = false; maybeClose(); },
  }), [startShowTimer, maybeClose]);

  const popoverProps = {
    onClose: () => { setOpen(false); },
    onMouseEnter: () => { overPopoverRef.current = true; if (hideTimerRef.current) { window.clearTimeout(hideTimerRef.current); hideTimerRef.current = null; } },
    onMouseLeave: () => { overPopoverRef.current = false; maybeClose(); },
    onMouseOver: () => { minVisibleUntilRef.current = Math.max(minVisibleUntilRef.current, Date.now() + 500); },
  } as const;

  return { getHoverZoneProps, open, anchorEl, hoverName, previewBlocks, previewLoading, popoverProps };
}
