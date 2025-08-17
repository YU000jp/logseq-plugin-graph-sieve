import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Popover, CircularProgress } from '@mui/material';
import { useHoverPagePreview } from '../hooks/useHoverPagePreview';
import { ensureHasContentChecked, getCachedHasContent, subscribeLinkCheck } from '../utils/linkCheck';
import { useTranslation } from 'react-i18next';
import { sanitizePlain as sanitizePlainUtil, isForcedHiddenPropLine as isForcedHiddenPropLineUtil, isOnlyRef as isOnlyRefUtil, isOnlyEmbed as isOnlyEmbedUtil, stripLogbook as stripLogbookUtil } from '../utils/content';
import type { BlockNode } from '../utils/blockText';
import { stripLogbookNodes } from '../utils/blockText';
import { getOpenPageLinkProps } from '../utils/openLink';

export function hasRenderableContent(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, alwaysHideKeys: string[] = [], hidePageRefs = false, hideQueries = false, removeStrings: string[] = [], hideRenderers: boolean = false): boolean {
  const check = (arr: BlockNode[]): boolean => {
    for (const b of arr) {
      const raw = (b.content || '')
        .split('\n')
        .map(l => {
          let l2 = l.replace(/\r/g, '');
          if (removeStrings && removeStrings.length) {
            for (const rs of removeStrings) if (rs) l2 = l2.split(rs).join('');
          }
          return l2;
        });
      for (const l of raw) {
        if (isForcedHiddenPropLineUtil(l, alwaysHideKeys)) continue;
        if (hideProperties && l.includes(':: ')) continue;
  if (hideQueries && /\{\{\s*query\b/i.test(l)) continue;
  if (hideRenderers && /\{\{\s*renderer\b/i.test(l)) continue;
        let transformed = l;
        if (hidePageRefs) transformed = transformed.replace(/\[\[([^\]]+)\]\]/g, '$1');
        if (transformed.trim().length === 0) continue;
        const onlyRef = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(l);
        const onlyEmbed = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(l);
        if (hideReferences && (onlyRef || onlyEmbed)) continue;
        return true;
      }
      if (b.children && b.children.length && check(b.children)) return true;
    }
    return false;
  };
  return check(blocks);
}

export const BlockList: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; currentGraph?: string; onOpenPage?: (name: string) => void; folderMode?: boolean; stripPageBrackets?: boolean; hidePageRefs?: boolean; hideQueries?: boolean; hideRenderers?: boolean; hideEmbeds?: boolean; hideLogbook?: boolean; assetsDirHandle?: FileSystemDirectoryHandle; removeStrings?: string[]; normalizeTasks?: boolean; highlightTerms?: string[]; enableHoverPreview?: boolean; pagesDirHandle?: FileSystemDirectoryHandle; journalsDirHandle?: FileSystemDirectoryHandle }> = ({ blocks, hideProperties, hideReferences, alwaysHideKeys = [], currentGraph, onOpenPage, folderMode, stripPageBrackets, hidePageRefs, hideQueries, hideRenderers = false, hideEmbeds = false, hideLogbook = true, assetsDirHandle, removeStrings = [], normalizeTasks = false, highlightTerms = [], enableHoverPreview = false, pagesDirHandle, journalsDirHandle }) => {
  const { t } = useTranslation();
  const sanitize = (s?: string) => sanitizePlainUtil(s, { removeStrings, hideProperties, alwaysHideKeys });
  const [assetUrls, setAssetUrls] = useState<Record<string,string>>({});
  const pendingRef = useRef<Set<string>>(new Set());
  // ページ本文有無（非同期キャッシュの反映用）
  const [, forceTick] = useState(0);
  useEffect(() => {
    const unsub = subscribeLinkCheck((_graph, _name, _val) => { forceTick(v => v + 1); });
    return unsub;
  }, []);

  // === Hover preview via reusable hook ===
  const { getHoverZoneProps, open, anchorEl, hoverName, previewBlocks, previewLoading, popoverProps } = useHoverPagePreview({
    enable: !!enableHoverPreview && !!folderMode,
    folderMode,
    pagesDirHandle,
    journalsDirHandle,
    showDelayMs: Number(localStorage.getItem('hoverShowDelayMs') || '1500') || 1500,
    minVisibleMs: Number(localStorage.getItem('hoverMinVisibleMs') || '2000') || 2000,
    cacheMax: Number(localStorage.getItem('hoverCacheMax') || '50') || 50,
    cacheTTLms: Number(localStorage.getItem('hoverCacheTTLms') || '120000') || 120000,
  });

  const triggerAsyncCheck = useCallback((pageName: string, element?: Element) => {
    if (!pageName) return;
    const env = folderMode ? {
      mode: 'folder' as const,
      pagesDirHandle,
      journalsDirHandle,
      hideProperties,
      hideQueries,
      hideRenderers,
      alwaysHideKeys,
    } : {
      mode: 'api' as const,
      hideProperties,
      hideQueries,
      hideRenderers,
      alwaysHideKeys,
    };
    ensureHasContentChecked(currentGraph, pageName, env, element);
  }, [folderMode, pagesDirHandle, journalsDirHandle, hideProperties, hideQueries, hideRenderers, alwaysHideKeys, currentGraph]);

  // 内部ページリンク描画（共通処理）
  const renderInternalPageLink = useCallback((pageName: string, label: string, key: string) => {
    // 本文有無チェック（モード別）
    // 非同期キャッシュから取得（未判定ならトリガー）
    let hasC: boolean | undefined = getCachedHasContent(currentGraph, pageName);
    
    return (
      <span key={key} className='ls-hover-zone'
        {...getHoverZoneProps(pageName)}
        style={{ display:'inline-block', padding:'3px 6px', margin:'-3px -6px', borderRadius:4 }}
        ref={(el) => {
          // 要素がマウントされたらリンクチェックを開始
          if (el && hasC === undefined) {
            triggerAsyncCheck(pageName, el);
          }
        }}>
        <a
          {...(onOpenPage ? getOpenPageLinkProps(pageName, onOpenPage) : { href: '#', tabIndex: 0 })}
          className='ls-page-ref'
          title={pageName}
          data-hascontent={hasC === undefined ? undefined : (hasC ? '1' : '0')}
          // Note: data-hascontent-label is styled via CSS; i18n labels are provided in CSS for now.
          data-hascontent-label={hasC === undefined ? undefined : (hasC ? t('has-content') : t('no-content'))}
          aria-label={`${pageName}${hasC === undefined ? '' : hasC ? ' — ' + (t('has-content') as string) : ' — ' + (t('no-content') as string)}`}
          aria-describedby={(open && hoverName === pageName) ? 'gs-hover-popover' : undefined}
        >
          {label}
        </a>
      </span>
    );
  }, [triggerAsyncCheck, getHoverZoneProps, onOpenPage, currentGraph, t, open, hoverName]);

  // 検索語ハイライト用の正規表現（大文字小文字無視）
  const highlightRe = useMemo(() => {
    const terms = (highlightTerms || []).map(s => (s || '').trim()).filter(Boolean);
    if (terms.length === 0) return null as RegExp | null;
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return new RegExp(`(${terms.map(esc).join('|')})`, 'gi');
    } catch {
      return null;
    }
  }, [highlightTerms]);

  // 文字列を <mark> で分割挿入
  const highlightString = (text: string): Array<string | React.ReactElement> => {
    if (!highlightRe) return [text];
    if (!text) return [text];
    const out: Array<string | React.ReactElement> = [];
    let last = 0; let m: RegExpExecArray | null;
    while ((m = highlightRe.exec(text)) !== null) {
      const start = m.index; const end = start + m[0].length;
      if (start > last) out.push(text.slice(last, start));
      out.push(<mark key={`hl-${start}`} className='hl'>{m[0]}</mark>);
      last = end;
      // 安全ブレーク
      if (highlightRe.lastIndex === start) highlightRe.lastIndex++;
    }
    if (last < text.length) out.push(text.slice(last));
    return out.length === 0 ? [text] : out;
  };

  // ノード（文字列/要素）の子を再帰処理してハイライトを適用
  const applyHighlight = (node: React.ReactNode): React.ReactNode => {
    if (!highlightRe) return node;
    if (typeof node === 'string') return highlightString(node);
    if (Array.isArray(node)) return node.map((n, i) => <React.Fragment key={`hn-${i}`}>{applyHighlight(n)}</React.Fragment>);
    if (React.isValidElement(node)) {
      const props: any = node.props || {};
      if (!('children' in props)) return node;
      const children = props.children;
      const newChildren = applyHighlight(children);
      if (newChildren === children) return node;
      return React.cloneElement(node, { ...props, children: newChildren });
    }
    return node;
  };

  useEffect(() => {
    if (!folderMode || !assetsDirHandle) return;
    const assets: string[] = [];
    const visit = (arr: BlockNode[]) => {
      for (const b of arr) {
        const raw = b.content || '';
        for (const line of raw.split('\n')) {
          const mdImg = line.match(/!\[[^\]]*\]\((\.\.\/assets\/[^)]+)\)/i);
          const orgImg = line.match(/\[\[(\.\.\/assets\/[^\]]+)\]/i);
          const p = (mdImg && mdImg[1]) || (orgImg && orgImg[1]);
          if (p && p.startsWith('../assets/')) {
            const fn = p.replace(/^\.\.\/assets\//, '');
            if (!assetUrls[fn]) assets.push(fn);
          }
        }
        if (b.children && b.children.length) visit(b.children as any);
      }
    };
    visit(blocks);
    if (assets.length === 0) return;
    assets.forEach(fn => {
      if (pendingRef.current.has(fn)) return;
      pendingRef.current.add(fn);
      (async () => {
        try {
          const fh = await assetsDirHandle.getFileHandle(fn).catch(()=>null);
          if (!fh) return;
          const file = await fh.getFile();
          const url = URL.createObjectURL(file);
          setAssetUrls(prev => ({ ...prev, [fn]: url }));
        } finally {
          pendingRef.current.delete(fn);
        }
      })();
    });
  }, [blocks, folderMode, assetsDirHandle]);

  const renderLine = (lineIn: string, idx: number) => {
    let line = lineIn;
    // Optionally strip any inline {{embed ...}} macro occurrences in CONTENT view as requested
    if (hideEmbeds) {
      line = line.replace(/\{\{\s*embed[^}]*\}\}/gi, '').replace(/\s+$/,'');
      if (!line.trim()) return <div key={idx} className='ls-block-line'/>;
    }
    const mdImg = line.match(/^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*!\[([^\]]*)\]\((\.\.\/assets\/[^)]+)\)(?:\{\:[^}]*\})?/i);
    const orgImg = line.match(/^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\[\[(\.\.\/assets\/[^\]]+)\](?:\[[^\]]*\])?\]/i);
    const assetPath = (mdImg && mdImg[2]) || (orgImg && orgImg[1]);
    if (assetPath && currentGraph) {
      let src: string | null = null;
      if (folderMode && assetPath.startsWith('../assets/')) {
        const fileName = assetPath.replace(/^\.\.\/assets\//, '');
        src = assetUrls[fileName] || null;
      }
      if (!src) src = currentGraph.replace('logseq_local_', '') + '/' + assetPath.replace(/^\.\.\//, '');
      const isPdf = /\.pdf(\?|#|$)/i.test(assetPath);
      if (isPdf) {
        const label = (mdImg && mdImg[1]) || assetPath.split('/').pop() || 'PDF';
        return <div key={idx} className='ls-block-line'><a href={src} target='_blank' rel='noopener noreferrer' className='ls-asset-link pdf' title={label}>📄 {label}</a></div>;
      }
      return <div key={idx} className='ls-block-line image'><a href={src} target='_blank' rel='noopener noreferrer' className='ls-img-link'><img src={src} alt={(mdImg && mdImg[1]) || ''} className='ls-img' /></a></div>;
    }

  const withLinks: Array<React.ReactNode> = [];
    let lastIndex = 0;
    const regex = /\[\[([^\]]+)\]\]/g; let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const before = line.slice(lastIndex, m.index);
      if (before) withLinks.push(before);
      let name = m[1];
      const looksUrl = /(^|\s)([a-zA-Z]+:\/\/|www\.)/.test(name);
      if (looksUrl) {
        withLinks.push(m[0]);
      } else if (onOpenPage && !hidePageRefs) {
        withLinks.push(renderInternalPageLink(name, stripPageBrackets ? name : `[[${name}]]`, `ref-wrap-${idx}-${m.index}`));
      } else {
        withLinks.push(m[0]);
      }
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < line.length) withLinks.push(line.slice(lastIndex));
    if (stripPageBrackets) {
      for (let i = 0; i < withLinks.length; i++) if (typeof withLinks[i] === 'string') withLinks[i] = (withLinks[i] as string).replace(/\[\[([^\]]+)\]\]/g,'$1');
    }
  if (hideQueries && /\{\{\s*query\b/i.test(line)) return <div key={idx} className='ls-block-line'/>;
  if (hideRenderers && /\{\{\s*renderer\b/i.test(line)) return <div key={idx} className='ls-block-line'/>;

  const withMdLinks: Array<React.ReactNode> = [];
    const getAssetUrl = (p: string): string | null => {
      if (!p.startsWith('../assets/')) return null;
      const fn = p.replace(/^\.\.\/assets\//, '');
      if (folderMode) return assetUrls[fn] || null;
      if (currentGraph) return currentGraph.replace('logseq_local_', '') + '/' + p.replace(/^\.\.\//, '');
      return null;
    };
  const processMdLinks = (chunk: string, baseKey: string) => {
      let cursor = 0;
  const mdRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  const orgRe = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]\]/g;
      // ハッシュタグ（#tag）をリンク化する。条件:
      // - 直後が空白ではない（Markdownヘッダー # Title は除外）
      // - トークン末尾は行末か空白
      // - 行頭 #+ 除外
      // - 可能な限り他のリンク構文より後に割り込まないよう、次候補の一つとして扱う
  // タグ名は空白/終端/句読点/全角句読点/閉じ記号で終わる想定（日本語タグ対応）
  const hashRe = /(^|[^\w\]])#([^\s#\]））】>、。,:;!？?]+)(?=$|\s|[\]）】>、。,:;!？?])/g;
  const isExternal = (u: string) => /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|www\.|mailto:|tel:|ftp:|file:|about:|data:|blob:|chrome:|edge:|opera:)/.test(u);
      while (true) {
        mdRe.lastIndex = cursor; orgRe.lastIndex = cursor; hashRe.lastIndex = cursor;
        const m1 = mdRe.exec(chunk); const m2 = orgRe.exec(chunk); const m3 = hashRe.exec(chunk);
        let next: { type: 'md'|'org'|'hash'; m: RegExpExecArray } | null = null;
        if (m1 && (!m2 || m1.index <= m2.index) && (!m3 || m1.index <= m3.index)) next = { type: 'md', m: m1 };
        else if (m2 && (!m3 || m2.index <= m3.index)) next = { type: 'org', m: m2 };
        else if (m3) next = { type: 'hash', m: m3 };
        if (!next) break;
        const start = next.m.index;
        if (start > cursor) withMdLinks.push(chunk.slice(cursor, start));
        if (next.type === 'md') {
          const text = next.m[1]; let href = next.m[2];
          if (href.startsWith('../assets/')) {
            const assetHref = getAssetUrl(href) || href;
            withMdLinks.push(<a key={`${baseKey}-md-${start}`} href={assetHref} target='_blank' rel='noopener noreferrer' className='ls-asset-link' title={text}>{text}</a>);
            cursor = start + next.m[0].length; continue;
          }
          if (!isExternal(href) && onOpenPage) {
            withMdLinks.push(renderInternalPageLink(href, text, `${baseKey}-md-wrap-${start}`));
          } else {
            withMdLinks.push(<a key={`${baseKey}-md-${start}`} href={href} target='_blank' rel='noopener noreferrer' className='ls-ext-link' title={text}>{text}</a>);
          }
          cursor = start + next.m[0].length;
        } else if (next.type === 'org') {
          let url = next.m[1];
          const text = next.m[2] || next.m[1];
          if (url.startsWith('../assets/')) {
            const assetHref = getAssetUrl(url) || url;
            withMdLinks.push(<a key={`${baseKey}-org-${start}`} href={assetHref} target='_blank' rel='noopener noreferrer' className='ls-asset-link' title={text}>{text}</a>);
            cursor = start + next.m[0].length; continue;
          }
          if (!isExternal(url) && onOpenPage) {
            withMdLinks.push(renderInternalPageLink(url, text, `${baseKey}-org-wrap-${start}`));
          } else {
            withMdLinks.push(<a key={`${baseKey}-org-${start}`} href={url} target='_blank' rel='noopener noreferrer' className='ls-ext-link' title={text}>{text}</a>);
          }
          cursor = start + next.m[0].length;
        } else {
          // hashtag
          // m3[1] は前置境界、m3[2] がタグ名
          const boundary = next.m[1] || '';
          const tag = next.m[2];
          const hashPos = start + boundary.length; // '#' の位置
          // 行頭 #+ 除外: チャンク先頭から # までが空白のみ、かつ直後が '+'
          const isLineStart = /^\s*$/.test(chunk.slice(0, hashPos));
          const afterChar = chunk[hashPos + 1] || '';
          if (isLineStart && afterChar === '+') {
            // 除外: プレーンテキストとして扱う
            withMdLinks.push(chunk.slice(start, start + next.m[0].length));
            cursor = start + next.m[0].length;
            continue;
          }
          if (onOpenPage && !hidePageRefs) {
            const pageName = tag;
            // 前置境界文字を保持
            if (boundary) withMdLinks.push(boundary);
            withMdLinks.push(renderInternalPageLink(pageName, `#${pageName}`, `${baseKey}-hash-wrap-${hashPos}`));
          } else {
            withMdLinks.push(next.m[0]);
          }
          cursor = start + next.m[0].length;
        }
      }
      if (cursor < chunk.length) withMdLinks.push(chunk.slice(cursor));
      // プレーンURLを自動リンク化
      const autoUrlRe = /(https?:\/\/[^\s)<>]+|www\.[^\s)<>]+)/g;
      const lastIndexStart = withMdLinks.length - 1;
      if (lastIndexStart >= 0 && typeof withMdLinks[lastIndexStart] === 'string') {
        const s = withMdLinks[lastIndexStart] as string;
        const parts: Array<React.ReactNode> = [];
        let li = 0; let mm: RegExpExecArray | null;
        while ((mm = autoUrlRe.exec(s)) !== null) {
          const start = mm.index; const end = start + mm[0].length;
          if (start > li) parts.push(s.slice(li, start));
          const href = /^www\./i.test(mm[0]) ? 'https://' + mm[0] : mm[0];
          parts.push(<a key={`${baseKey}-auto-${start}`} href={href} target='_blank' rel='noopener noreferrer' className='ls-ext-link'>{mm[0]}</a>);
          li = end;
        }
        if (li < s.length) parts.push(s.slice(li));
        if (parts.length > 0) withMdLinks[lastIndexStart] = parts;
      }
    };
    withLinks.forEach((chunk, i) => { if (typeof chunk !== 'string') { withMdLinks.push(chunk); return; } processMdLinks(chunk, `lnk-${idx}-${i}`); });

    const InlineRef: React.FC<{ uuid: string; k: string }> = ({ uuid, k }) => {
      const [preview, setPreview] = useState<string>('');
      useEffect(() => {
        let mounted = true; (async () => { if (folderMode) return; try { const { getBlock, isLogseqAvailable } = await import('../services/logseqApi'); if (!isLogseqAvailable()) return; const blk = await getBlock(uuid); if (blk && mounted) setPreview((blk.content || '').split('\n')[0] || ''); } catch {} })();
        return () => { mounted = false; };
      }, [uuid]);
      if (folderMode) return <span key={k} className='ls-inline-ref ref removed'></span>;
      const detached = (window as any).__graphSieveDetachedMode;
      return <span key={k} className='ls-inline-ref ref faded'>[ref] <span className='ref-text'>{detached ? uuid.slice(0,8) : preview}</span></span>;
    };

    const withRefs: Array<React.ReactNode> = [];
    withMdLinks.forEach((chunk, i) => {
      if (typeof chunk !== 'string') { withRefs.push(chunk); return; }
      let last = 0; let mm: RegExpExecArray | null; const r = /\(\(([0-9a-fA-F-]{36})\)\)/g;
      while ((mm = r.exec(chunk)) !== null) {
        const before = chunk.slice(last, mm.index); if (before) withRefs.push(before);
        const uuid = mm[1]; if (!hideReferences) withRefs.push(<InlineRef key={`bref-${idx}-${i}-${mm.index}`} uuid={uuid} k={`bref-${idx}-${i}-${mm.index}`} />);
        last = mm.index + mm[0].length;
      }
      if (last < chunk.length) withRefs.push(chunk.slice(last));
    });

    const InlineEmbedBlock: React.FC<{ uuid: string; k: string }> = ({ uuid, k }) => {
      const [preview, setPreview] = useState<string>('');
      useEffect(() => {
        let mounted = true; (async () => { if (folderMode) return; try { const { getBlock, isLogseqAvailable } = await import('../services/logseqApi'); if (!isLogseqAvailable()) return; const blk = await getBlock(uuid); if (blk && mounted) setPreview((blk.content || '').split('\n')[0] || ''); } catch {} })();
        return () => { mounted = false; };
      }, [uuid]);
      if (folderMode) return <span key={k} className='ls-inline-embed embed removed'></span>;
      const detached = (window as any).__graphSieveDetachedMode;
      return <span key={k} className='ls-inline-embed embed faded'>[embed] <span className='embed-text'>{detached ? uuid.slice(0,8) : preview}</span></span>;
    };

    const InlineEmbedPage: React.FC<{ name: string; k: string }> = ({ name, k }) => {
      if (folderMode) return <span key={k} className='ls-inline-embed embed removed'></span>;
      return <span key={k} className='ls-inline-embed embed faded'>[embed] <span className='embed-text'>[[{name}]]</span></span>;
    };

    const withEmbeds: Array<React.ReactNode> = [];
    withRefs.forEach((chunk, i) => {
      if (typeof chunk !== 'string') { withEmbeds.push(chunk); return; }
      let cursor = 0;
      const patterns: Array<{ regex: RegExp; handler: (m: RegExpExecArray, start: number) => void }> = [
        { regex: /\{\{\s*embed\s*\(\(([0-9a-fA-F-]{36})\)\)\s*\}\}/g, handler: (m, start) => {
          const before = chunk.slice(cursor, start); if (before) withEmbeds.push(before);
          const uuid = m[1]; if (!hideReferences) withEmbeds.push(<InlineEmbedBlock key={`emb-b-${idx}-${i}-${start}`} uuid={uuid} k={`emb-b-${idx}-${i}-${start}`} />);
          cursor = start + m[0].length;
        } },
        { regex: /\{\{\s*embed\s*\[\[([^\]]+)\]\]\s*\}\}/g, handler: (m, start) => {
          const before = chunk.slice(cursor, start); if (before) withEmbeds.push(before);
          const name = m[1]; if (!hideReferences) withEmbeds.push(<InlineEmbedPage key={`emb-p-${idx}-${i}-${start}`} name={name} k={`emb-p-${idx}-${i}-${start}`} />);
          cursor = start + m[0].length;
        } },
      ];
      while (true) {
        let nextMatch: { which: number; m: RegExpExecArray } | null = null;
        for (let pi = 0; pi < patterns.length; pi++) {
          patterns[pi].regex.lastIndex = cursor; const m = patterns[pi].regex.exec(chunk);
          if (m) { if (!nextMatch || m.index < nextMatch.m.index) nextMatch = { which: pi, m }; }
        }
        if (!nextMatch) break;
        patterns[nextMatch.which].handler(nextMatch.m, nextMatch.m.index);
      }
      if (cursor < chunk.length) withEmbeds.push(chunk.slice(cursor));
    });
  let finalNodes = withEmbeds.length ? withEmbeds : (withRefs.length ? withRefs : (withLinks.length ? withLinks : [line]));
    if (hideReferences) finalNodes = finalNodes.map(n => typeof n === 'string' ? n.replace(/\{\{\s*embed[^}]*\}\}/gi,'') : n);
  const highlighted = applyHighlight(finalNodes);
  return <div key={idx} className={'ls-block-line' + (line.includes(':: ') && !hideProperties ? ' prop' : '')}>{highlighted}</div>;
  };

  if (!blocks || blocks.length === 0) return <div className='sidebar-empty'>{t('no-content')}</div>;

  const isRef = (line: string) => /\(\([0-9a-fA-F-]{36}\)\)/.test(line);
  const isEmbed = (line: string) => /\{\{\s*embed\b[^}]*\}\}/i.test(line);
  const isOnlyRef = isOnlyRefUtil; const isOnlyEmbed = isOnlyEmbedUtil;

  const RefLine: React.FC<{ line: string }> = ({ line }) => {
    const uuidMatch = line.match(/[0-9a-fA-F-]{36}/);
    const [preview, setPreview] = useState<string>('');
    useEffect(() => {
      let mounted = true; (async () => { if (folderMode) return; if (uuidMatch) { try { const { getBlock, isLogseqAvailable } = await import('../services/logseqApi'); if (!isLogseqAvailable()) return; const blk = await getBlock(uuidMatch[0]); if (blk && mounted) setPreview((blk.content || '').split('\n')[0] || ''); } catch {} } else { const pageMatch = line.match(/\[\[([^\]]+)\]\]/); if (pageMatch && mounted) setPreview(pageMatch[1]); } })();
      return () => { mounted = false; };
    }, []);
    if (folderMode) return <></>;
    const isE = isEmbed(line);
    return (
      <div className={'ls-block-line ref ' + (isE ? 'embed' : 'reference')}>
        {isE ? '[embed] ' : '[ref] '}<span className='ref-text'>{preview}</span>
      </div>
    );
  };

  const cleanedBlocks = hideLogbook ? stripLogbookNodes(blocks) : blocks;
  return (
  <div className='ls-block-list-wrap'>
    <ul className='ls-block-list'>
      {cleanedBlocks.map((b, i) => {
        const rawWithoutLog = hideLogbook ? stripLogbookUtil(b.content ?? '') : (b.content ?? '');
        const text = sanitize(rawWithoutLog);
        let rawLines = rawWithoutLog.split('\n');
        rawLines = rawLines.filter(line => !isForcedHiddenPropLineUtil(line, alwaysHideKeys));
        const filteredLines = rawLines.filter(line => {
          const l = line.replace(/\r/g, '');
          if (hideProperties && l.includes(':: ')) return false;
          if (l.trim().length === 0) return false;
          const only = isOnlyRef(l) || isOnlyEmbed(l);
          if (hideReferences && only) return false;
          return true;
        });
        const hasRenderable = filteredLines.length > 0;
        let visibleLines = hideProperties ? (text ? text.split('\n') : []) : rawLines;
        return (
          <li key={i} className={'ls-block-item' + (hasRenderable ? '' : ' no-content')}>
            <div className='ls-block-content'>
              {visibleLines.map((line, idx) => {
                const ln = line.replace(/\r/g, '');
                if (isForcedHiddenPropLineUtil(ln, alwaysHideKeys)) return null;
                if (/^\s*-\s*-\s*$/.test(ln)) return null;
                const only = isOnlyRef(ln) || isOnlyEmbed(ln);
                if ((isRef(ln) || isEmbed(ln))) { if (hideReferences && only) return null; if (only) return <RefLine key={idx} line={ln} /> }
                if (folderMode && /^\s*-\s*$/.test(ln)) return null;
                let processedLine = ln;
                if (removeStrings && removeStrings.length) for (const rs of removeStrings) if (rs) processedLine = processedLine.split(rs).join('');
                if (hideQueries && /\{\{\s*query\b/i.test(processedLine)) return null;
                if (hideRenderers && /\{\{\s*renderer\b/i.test(processedLine)) return null;
                if (folderMode) {
                  let processed = processedLine
                    .replace(/\(\([0-9a-fA-F-]{36}\)\)/g, '')
                    .replace(/\{\{\s*embed\s*\(\([0-9a-fA-F-]{36}\)\)\s*\}\}/gi, '')
                    .replace(/\{\{\s*embed\s*\[\[[^\]]+\]\]\s*\}\}/gi, '')
                    .replace(/\s+/g, ' ').trim();
                  if (normalizeTasks) {
                    const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|DONE|CANCELED|CANCELLED)\s+/i;
                    processed = processed.split('\n').map(l => {
                      if (/^\s*```/.test(l)) return l;
                      const m = l.match(statusRe); if (!m) return l; if (/^\s*[-*+]\s+\[[ xX-]\]/.test(l)) return l;
                      const status = (m[3]||'').toUpperCase(); const done = /DONE/.test(status); const cancel = /CANCEL/.test(status);
                      const box = done ? '[x]' : (cancel ? '[-]' : '[ ]');
                      return l.replace(statusRe, `${m[1]||''}${m[2]||''}${box} `);
                    }).join('\n');
                  }
                  if (processed.length === 0) return null;
                  return renderLine(processed, idx);
                }
                if (processedLine.trim().length === 0) return null;
                const normalized = normalizeTasks ? (() => {
                  const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|DONE|CANCELED|CANCELLED)\s+/i;
                  return processedLine.split('\n').map(l => {
                    if (/^\s*```/.test(l)) return l;
                    const m = l.match(statusRe); if (!m) return l; if (/^\s*[-*+]\s+\[[ xX-]\]/.test(l)) return l;
                    const status = (m[3]||'').toUpperCase(); const done = /DONE/.test(status); const cancel = /CANCEL/.test(status);
                    const box = done ? '[x]' : (cancel ? '[-]' : '[ ]');
                    return l.replace(statusRe, `${m[1]||''}${m[2]||''}${box} `);
                  }).join('\n');
                })() : processedLine;
                return renderLine(normalized, idx);
              })}
            </div>
            {b.children && b.children.length > 0 && (
              <BlockList
                blocks={(hideLogbook ? stripLogbookNodes(b.children as BlockNode[]) : (b.children as BlockNode[]))}
                hideProperties={hideProperties}
                hideReferences={hideReferences}
                alwaysHideKeys={alwaysHideKeys}
                currentGraph={currentGraph}
                onOpenPage={onOpenPage}
                folderMode={folderMode}
                stripPageBrackets={stripPageBrackets}
                hidePageRefs={hidePageRefs}
                hideQueries={hideQueries}
                hideRenderers={hideRenderers}
                hideEmbeds={hideEmbeds}
                hideLogbook={hideLogbook}
                assetsDirHandle={assetsDirHandle}
                removeStrings={removeStrings}
                normalizeTasks={normalizeTasks}
                highlightTerms={highlightTerms}
                enableHoverPreview={enableHoverPreview}
                pagesDirHandle={pagesDirHandle}
                journalsDirHandle={journalsDirHandle}
              />
            )}
          </li>
        );
      })}
  </ul>
  { (!!enableHoverPreview && !!folderMode) && (
      <Popover
    open={open}
    anchorEl={anchorEl}
    onClose={popoverProps.onClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        disableRestoreFocus
        keepMounted
        slotProps={{ paper: { style: { pointerEvents: 'auto' }, role: 'dialog', id: 'gs-hover-popover', 'aria-live': 'polite' } as any }}
      >
    {hoverName ? (
      <div
            style={{ maxWidth: 600, maxHeight: 600, overflow: 'auto', padding: 8 }}
      onMouseEnter={popoverProps.onMouseEnter}
      onMouseLeave={popoverProps.onMouseLeave}
      onMouseOver={popoverProps.onMouseOver}
    aria-busy={previewLoading ? 'true' : 'false'}
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
