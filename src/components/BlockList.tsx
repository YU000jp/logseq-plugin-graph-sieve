import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sanitizePlain as sanitizePlainUtil, isForcedHiddenPropLine as isForcedHiddenPropLineUtil, isOnlyRef as isOnlyRefUtil, isOnlyEmbed as isOnlyEmbedUtil } from '../utils/content';
import { inferJournalPageNameFromText, toJournalPageNameIfDateUsing } from '../utils/journal';
import type { BlockNode } from '../utils/blockText';

export function hasRenderableContent(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, alwaysHideKeys: string[] = [], hidePageRefs = false, hideQueries = false, removeStrings: string[] = []): boolean {
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

export const BlockList: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; currentGraph?: string; onOpenPage?: (name: string) => void; folderMode?: boolean; stripPageBrackets?: boolean; hidePageRefs?: boolean; hideQueries?: boolean; assetsDirHandle?: FileSystemDirectoryHandle; removeStrings?: string[]; normalizeTasks?: boolean; journalLinkPattern?: string }> = ({ blocks, hideProperties, hideReferences, alwaysHideKeys = [], currentGraph, onOpenPage, folderMode, stripPageBrackets, hidePageRefs, hideQueries, assetsDirHandle, removeStrings = [], normalizeTasks = false, journalLinkPattern }) => {
  const { t } = useTranslation();
  const sanitize = (s?: string) => sanitizePlainUtil(s, { removeStrings, hideProperties, alwaysHideKeys });
  const [assetUrls, setAssetUrls] = useState<Record<string,string>>({});
  const pendingRef = useRef<Set<string>>(new Set());

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

  const renderLine = (line: string, idx: number) => {
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
      const j = journalLinkPattern ? toJournalPageNameIfDateUsing(journalLinkPattern, name) : null;
      if (j) name = j;
      const looksUrl = /(^|\s)([a-zA-Z]+:\/\/|www\.)/.test(name);
      if (looksUrl) {
        withLinks.push(m[0]);
      } else if (onOpenPage && !hidePageRefs) {
        withLinks.push(
          <a key={`ref-${idx}-${m.index}`} href='#' className='ls-page-ref'
            onClick={(e) => { e.preventDefault(); onOpenPage(name); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPage(name); } }} tabIndex={0} title={name}>
            {stripPageBrackets ? name : `[[${name}]]`}
          </a>
        );
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
      const orgRe = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g;
      const isExternal = (u: string) => /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|www\.|mailto:|tel:|ftp:|file:|about:|data:|blob:|chrome:|edge:|opera:)/.test(u);
      while (true) {
        mdRe.lastIndex = cursor; orgRe.lastIndex = cursor;
        const m1 = mdRe.exec(chunk); const m2 = orgRe.exec(chunk);
        let next: { type: 'md'|'org'; m: RegExpExecArray } | null = null;
        if (m1 && (!m2 || m1.index <= m2.index)) next = { type: 'md', m: m1 };
        else if (m2) next = { type: 'org', m: m2 };
        if (!next) break;
        const start = next.m.index;
        if (start > cursor) withMdLinks.push(chunk.slice(cursor, start));
        if (next.type === 'md') {
          const text = next.m[1]; let href = next.m[2];
          const j = inferJournalPageNameFromText(href, journalLinkPattern); if (j) href = j;
          if (href.startsWith('../assets/')) {
            const assetHref = getAssetUrl(href) || href;
            withMdLinks.push(<a key={`${baseKey}-md-${start}`} href={assetHref} target='_blank' rel='noopener noreferrer' className='ls-asset-link' title={text}>{text}</a>);
            cursor = start + next.m[0].length; continue;
          }
          if (!isExternal(href) && onOpenPage) {
            withMdLinks.push(
              <a key={`${baseKey}-md-${start}`} href='#' className='ls-page-ref'
                onClick={(e) => { e.preventDefault(); onOpenPage(href); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPage(href); } }} tabIndex={0} title={href}>
                {text}
              </a>
            );
          } else {
            withMdLinks.push(<a key={`${baseKey}-md-${start}`} href={href} target='_blank' rel='noopener noreferrer' className='ls-ext-link' title={text}>{text}</a>);
          }
          cursor = start + next.m[0].length;
        } else {
          let url = next.m[1]; const j2 = inferJournalPageNameFromText(url, journalLinkPattern); if (j2) url = j2;
          const text = next.m[2] || next.m[1];
          if (url.startsWith('../assets/')) {
            const assetHref = getAssetUrl(url) || url;
            withMdLinks.push(<a key={`${baseKey}-org-${start}`} href={assetHref} target='_blank' rel='noopener noreferrer' className='ls-asset-link' title={text}>{text}</a>);
            cursor = start + next.m[0].length; continue;
          }
          if (!isExternal(url) && onOpenPage) {
            withMdLinks.push(
              <a key={`${baseKey}-org-${start}`} href='#' className='ls-page-ref'
                onClick={(e) => { e.preventDefault(); onOpenPage(url); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPage(url); } }} tabIndex={0} title={url}>
                {text}
              </a>
            );
          } else {
            withMdLinks.push(<a key={`${baseKey}-org-${start}`} href={url} target='_blank' rel='noopener noreferrer' className='ls-ext-link' title={text}>{text}</a>);
          }
          cursor = start + next.m[0].length;
        }
      }
      if (cursor < chunk.length) withMdLinks.push(chunk.slice(cursor));
    };
    withLinks.forEach((chunk, i) => { if (typeof chunk !== 'string') { withMdLinks.push(chunk); return; } processMdLinks(chunk, `lnk-${idx}-${i}`); });

    const InlineRef: React.FC<{ uuid: string; k: string }> = ({ uuid, k }) => {
      const [preview, setPreview] = useState<string>('');
      useEffect(() => {
        let mounted = true; (async () => { if (folderMode) return; try { if ((window as any).__graphSieveDetachedMode) return; const blk = await logseq.Editor.getBlock(uuid); if (blk && mounted) setPreview((blk.content || '').split('\n')[0] || ''); } catch {} })();
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
        let mounted = true; (async () => { if (folderMode) return; try { if ((window as any).__graphSieveDetachedMode) return; const blk = await logseq.Editor.getBlock(uuid); if (blk && mounted) setPreview((blk.content || '').split('\n')[0] || ''); } catch {} })();
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
    return <div key={idx} className={'ls-block-line' + (line.includes(':: ') && !hideProperties ? ' prop' : '')}>{finalNodes}</div>;
  };

  if (!blocks || blocks.length === 0) return <div className='sidebar-empty'>{t('no-content')}</div>;

  const isRef = (line: string) => /\(\([0-9a-fA-F-]{36}\)\)/.test(line);
  const isEmbed = (line: string) => /\{\{\s*embed\b[^}]*\}\}/i.test(line);
  const isOnlyRef = isOnlyRefUtil; const isOnlyEmbed = isOnlyEmbedUtil;

  const RefLine: React.FC<{ line: string }> = ({ line }) => {
    const uuidMatch = line.match(/[0-9a-fA-F-]{36}/);
    const [preview, setPreview] = useState<string>('');
    useEffect(() => {
      let mounted = true; (async () => { if (folderMode) return; if (uuidMatch) { try { if ((window as any).__graphSieveDetachedMode) return; const blk = await logseq.Editor.getBlock(uuidMatch[0]); if (blk && mounted) setPreview((blk.content || '').split('\n')[0] || ''); } catch {} } else { const pageMatch = line.match(/\[\[([^\]]+)\]\]/); if (pageMatch && mounted) setPreview(pageMatch[1]); } })();
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

  return (
    <ul className='ls-block-list'>
      {blocks.map((b, i) => {
        const text = sanitize(b.content);
        let rawLines = (b.content ?? '').split('\n');
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
                if (folderMode) {
                  let processed = processedLine
                    .replace(/\(\([0-9a-fA-F-]{36}\)\)/g, '')
                    .replace(/\{\{\s*embed\s*\(\([0-9a-fA-F-]{36}\)\)\s*\}\}/gi, '')
                    .replace(/\{\{\s*embed\s*\[\[[^\]]+\]\]\s*\}\}/gi, '')
                    .replace(/\s+/g, ' ').trim();
                  if (normalizeTasks) {
                    const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|HABIT|START|STARTED|DONE|CANCELED|CANCELLED)\s+/i;
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
                  const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|HABIT|START|STARTED|DONE|CANCELED|CANCELLED)\s+/i;
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
              <BlockList blocks={b.children as BlockNode[]} hideProperties={hideProperties} hideReferences={hideReferences} alwaysHideKeys={alwaysHideKeys} currentGraph={currentGraph} onOpenPage={onOpenPage} folderMode={folderMode} stripPageBrackets={stripPageBrackets} hidePageRefs={hidePageRefs} hideQueries={hideQueries} assetsDirHandle={assetsDirHandle} removeStrings={removeStrings} normalizeTasks={normalizeTasks} journalLinkPattern={journalLinkPattern} />
            )}
          </li>
        );
      })}
    </ul>
  );
};
