import { useCallback, useRef, useState } from 'react';
import type { BlockNode } from '../utils/blockText';
import { locatePageFile } from '../utils/pageLocator';
import { parseBlocksFromText } from '../utils/parseBlocks';

export interface HoverPreviewOptions {
  enable: boolean;
  folderMode?: boolean;
  currentGraph?: string;
  pagesDirHandle?: FileSystemDirectoryHandle;
  journalsDirHandle?: FileSystemDirectoryHandle;
  onOpenPage?: (name: string) => void;
  showDelayMs?: number; // default 1500
  minVisibleMs?: number; // default 2000
  cacheMax?: number; // default 50
  cacheTTLms?: number; // default 120_000 (2m)
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
  const { enable, folderMode, pagesDirHandle, journalsDirHandle, showDelayMs = 1500, minVisibleMs = 2000, cacheMax = 50, cacheTTLms = 120_000 } = opts;
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
  // Simple in-memory cache with TTL and max size
  const cacheRef = useRef<Map<string, { t: number; blocks: BlockNode[] }>>(new Map());
  const pruneCache = useCallback(() => {
    const now = Date.now();
    const cache = cacheRef.current;
    // remove expired
    for (const [k, v] of cache) {
      if (now - v.t > cacheTTLms) cache.delete(k);
    }
    // trim size
    if (cache.size > cacheMax) {
      const entries = Array.from(cache.entries()).sort((a, b) => a[1].t - b[1].t);
      const excess = cache.size - cacheMax;
      for (let i = 0; i < excess; i++) cache.delete(entries[i][0]);
    }
  }, [cacheMax, cacheTTLms]);

  // パースは共通ユーティリティを利用

  const loadPreviewIfNeeded = useCallback(async (name: string) => {
    if (!enable || !folderMode) return;
    // Try cache first
    pruneCache();
    const cached = cacheRef.current.get(name);
    if (cached) {
      loadedForNameRef.current = name;
      setPreviewBlocks(cached.blocks);
      return;
    }
    if (loadedForNameRef.current === name && (previewBlocks && previewBlocks.length >= 0)) return;
    if (previewLoadingRef.current) return;
    setPreviewLoading(true);
    previewLoadingRef.current = true;
    try {
      const located = await locatePageFile(name, pagesDirHandle, journalsDirHandle, { scanFallback: true });
      const file: File | null = located?.file || null;
      let text = '';
      if (file) text = await file.text();
      const blocksParsed: BlockNode[] = parseBlocksFromText(text);
      loadedForNameRef.current = name;
      setPreviewBlocks(blocksParsed);
      cacheRef.current.set(name, { t: Date.now(), blocks: blocksParsed });
      pruneCache();
    } finally { setPreviewLoading(false); previewLoadingRef.current = false; }
  }, [enable, folderMode, pagesDirHandle, journalsDirHandle, parseBlocksFromText, previewBlocks, pruneCache]);

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
