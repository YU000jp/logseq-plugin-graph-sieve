import { logger } from './logger'; // logger.tsからロガーをインポート
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { db, Box } from './db';
import './App.css'
import { PlainTextView, RawCustomView, outlineTextFromBlocks, flattenBlocksToText, blocksToPlainText } from './utils/blockText';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, IconButton, InputAdornment, TextField, Switch, FormControlLabel, Tooltip, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Clear, ContentCopy } from '@mui/icons-material'; // ContentCopy still used for copy-content button
import SettingsIcon from '@mui/icons-material/Settings';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import { encodeLogseqFileName, getLastUpdatedTime, getSummary, getSummaryFromRawText, parseOperation, sleep, decodeLogseqFileName } from './utils';
import type { MarkdownOrOrg, FileChanges } from './types';
import BoxCard from './components/BoxCard';

const dirHandles: { [graphName: string]: FileSystemDirectoryHandle } = {};

const tileGridHeight = 160; // height of a grid row
// Will hold dynamically measured row height (box + vertical margins)
const measuredRowHeightRef: { current: number } = { current: tileGridHeight };

function App() {
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle>();
  const [assetsDirHandle, setAssetsDirHandle] = useState<FileSystemDirectoryHandle>();
  // ルート直下 (pages と siblings) に journals フォルダがある場合の参照
  const [journalsDirHandle, setJournalsDirHandle] = useState<FileSystemDirectoryHandle>();
  const [currentGraph, setCurrentGraph] = useState<string>('');
  const [preferredDateFormat, setPreferredDateFormat] = useState<string>('');
  // 日付/フォント設定機能削除に伴い固定スタイル & 既定日付書式を使用
  // ジャーナル日付表示パターン (ユーザー設定可能)
  const [journalDatePattern, setJournalDatePattern] = useState<string>(() => {
    try { return localStorage.getItem('journalDatePattern') || 'yyyy/MM/dd'; } catch { return 'yyyy/MM/dd'; }
  });
  useEffect(()=>{ try { localStorage.setItem('journalDatePattern', journalDatePattern); } catch {} }, [journalDatePattern]);
  // ジャーナルリンク判定パターン（プレビュー内リンクをジャーナルとして解釈するための入力書式）
  const [journalLinkPattern, setJournalLinkPattern] = useState<string>(() => {
    try { return localStorage.getItem('journalLinkPattern') || 'yyyy/MM/dd'; } catch { return 'yyyy/MM/dd'; }
  });
  useEffect(()=>{ try { localStorage.setItem('journalLinkPattern', journalLinkPattern); } catch {} }, [journalLinkPattern]);
  // グローバル設定（現在はプレースホルダ）
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  // ===== UI フォント設定 (再導入) =====
  const [uiFontSize, setUiFontSize] = useState<number>(() => { try { return parseInt(localStorage.getItem('uiFontSize')||'13',10)||13; } catch { return 13; } });
  const [uiFontFamily, setUiFontFamily] = useState<string>(() => { try { return localStorage.getItem('uiFontFamily')||''; } catch { return ''; } });
  const [uiLineHeight, setUiLineHeight] = useState<number>(()=>{try{return parseFloat(localStorage.getItem('uiLineHeight')||'1.5')||1.5;}catch{return 1.5;}});
  const [uiFontWeight, setUiFontWeight] = useState<number>(()=>{try{return parseInt(localStorage.getItem('uiFontWeight')||'400',10)||400;}catch{return 400;}});
  useEffect(()=>{ try { localStorage.setItem('uiFontSize', String(uiFontSize)); } catch{} },[uiFontSize]);
  useEffect(()=>{ try { localStorage.setItem('uiFontFamily', uiFontFamily); } catch{} },[uiFontFamily]);
  useEffect(()=>{ try { localStorage.setItem('uiLineHeight', String(uiLineHeight)); } catch{} },[uiLineHeight]);
  useEffect(()=>{ try { localStorage.setItem('uiFontWeight', String(uiFontWeight)); } catch{} },[uiFontWeight]);
  // Google Fonts 自動読み込み + 動的スタイル注入
  useEffect(()=>{
    const linkId = 'gsv-google-font';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (uiFontFamily && /[A-Za-z]/.test(uiFontFamily)) {
      const fam = uiFontFamily.trim().replace(/\s+/g,'+');
      const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}:wght@300;400;500;600;700;800&display=swap`;
      if(!link){ link = document.createElement('link'); link.id = linkId; link.rel='stylesheet'; document.head.appendChild(link); }
      link.href = href;
    } else if(link) link.remove();
    const styleId = 'gsv-ui-font-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if(!styleEl){ styleEl = document.createElement('style'); styleEl.id = styleId; document.head.appendChild(styleEl); }
    const famDecl = uiFontFamily ? `"${uiFontFamily}", system-ui, sans-serif` : 'system-ui, sans-serif';
    styleEl.textContent = `#app{--gsv-font-size:${uiFontSize}px;--gsv-line-height:${uiLineHeight};--gsv-font-weight:${uiFontWeight};--gsv-font-family:${famDecl};font-size:var(--gsv-font-size);line-height:var(--gsv-line-height);font-family:var(--gsv-font-family);}`+
      `#app .card-title,#app .card-body-text,#app .sidebar-inner,#app .left-pane,#app .box{font-size:inherit;line-height:inherit;font-family:inherit;}`;
  },[uiFontFamily, uiFontSize, uiLineHeight, uiFontWeight]);
  const resetUiFont = () => { setUiFontSize(13); setUiFontFamily(''); setUiLineHeight(1.5); setUiFontWeight(400); };
  const [preferredFormat, setPreferredFormat] = useState<MarkdownOrOrg>('markdown');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBox, setSelectedBox] = useState<number>(0);
  // 選択カード参照 (キーボードハンドラ内で最新 index を参照するため)
  const selectedBoxRef = useRef<number>(0);
  useEffect(() => { selectedBoxRef.current = selectedBox; }, [selectedBox]);
  // REBUILD 用ダイアログ廃止につき open state 削除
  // シンプル検索 (ページ名部分一致)
  const [pageName, setPageName] = useState<string>('');
  const tileRef = useRef<HTMLDivElement | null>(null);
  // 旧 tagInputFieldRef 削除
  //  const appRef = useRef<HTMLDivElement | null>(null);
  const [tileColumnSize, setTileColumnSize] = useState<number>(0);
  const [tileRowSize, setTileRowSize] = useState<number>(0);
  const [maxBoxNumber, setMaxBoxNumber] = useState<number>(50); // initial fetch size
  // Exclude journals toggle (default true)
  const [excludeJournals, setExcludeJournals] = useState<boolean>(() => {
    try { const v = localStorage.getItem('excludeJournals'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  // 自動デタッチモード: Logseq が現在開いているグラフとプラグインで扱うグラフが異なる場合 true
  const [detachedMode, setDetachedMode] = useState<boolean>(false);
  const [logseqCurrentGraph, setLogseqCurrentGraph] = useState<string>('');
  // 明示的モード: Logseq既存グラフ or フォルダ(fs_)
  const [graphMode, setGraphMode] = useState<'logseq' | 'folder'>(() => {
    try {
      const v = localStorage.getItem('graphMode');
      return v === 'folder' ? 'folder' : 'logseq';
    } catch { return 'logseq'; }
  });
  // Sidebar preview sessions (multi-preview)
  type PreviewTab = 'content' | 'nomark' | 'outline' | 'raw-custom';
  type Preview = { box: Box; blocks: any[] | null; loading: boolean; tab: PreviewTab; pinned: boolean; createdAt: number };
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(-1);
  const [hoverCloseIndex, setHoverCloseIndex] = useState<number | null>(null);
  const [maxPreviewTabs, setMaxPreviewTabs] = useState<number>(() => {
    try { const v = parseInt(localStorage.getItem('maxPreviewTabs') || '10', 10); return v > 0 ? v : 10; } catch { return 10; }
  });
  useEffect(() => { try { localStorage.setItem('maxPreviewTabs', String(maxPreviewTabs)); } catch {} }, [maxPreviewTabs]);
  const [hideProperties, setHideProperties] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('hideProperties');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  // Refs/embeds は常に非表示 (トグル廃止) - 呼び出し側では true を直接渡す
  // 空行除去: トグル廃止し常に有効（実装は各処理で空行除去）
  // [[Page]] 括弧だけ除去トグル（デフォルトON）
  const [stripPageBrackets, setStripPageBrackets] = useState<boolean>(() => {
    try { const v = localStorage.getItem('stripPageBrackets'); return v === null ? true : v === 'true'; } catch { return true; }
  });
  // Page refs 自体を非表示 (行から除去) （デフォルトOFF）
  const [hidePageRefs, setHidePageRefs] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('hidePageRefs');
      if (v !== null) return v === 'true';
      // migration from old key removePageRefs (true meant old combined behavior)
      const legacy = localStorage.getItem('removePageRefs');
      if (legacy === 'true') {
        // keep old intent: hidePageRefs OFF by default now; if user explicitly had old toggle ON, map to hiding page refs fully? Old meaning was strip brackets; new mapping better: set stripPageBrackets true (already default) and keep hidePageRefs false.
        // So do not turn on hidePageRefs; just clear legacy key.
        try { localStorage.removeItem('removePageRefs'); } catch {}
        return false;
      }
      return false;
    } catch { return false; }
  });
  // クエリ ({{query ...) を隠すトグル（デフォルトOFF）
  const [hideQueries, setHideQueries] = useState<boolean>(() => {
    try { const v = localStorage.getItem('hideQueries'); return v === 'true'; } catch { return false; }
  });
  // RAWタブ: アウトライン(概要)とフルソース切替
  // rawFullMode 廃止: 常に SUMMARY スタイル (旧 RawCustomView)
  // Option: always hide specific property keys (comma-separated), persisted in localStorage
  const [alwaysHidePropKeys, setAlwaysHidePropKeys] = useState<string>(() => {
    try { return localStorage.getItem('alwaysHideProps') || ''; } catch { return ''; }
  });
  const alwaysHideKeys = useMemo(() => {
    return alwaysHidePropKeys
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }, [alwaysHidePropKeys]);
  // 特定文字列を本文から除去 (カンマ区切りそのまま / 大文字小文字区別)
  const [removeStringsRaw, setRemoveStringsRaw] = useState<string>(() => {
    try { return localStorage.getItem('removeStrings') || ''; } catch { return ''; }
  });
  const removeStrings = useMemo(() => removeStringsRaw.split(',').filter(s => s.length > 0), [removeStringsRaw]);
  // Logseq マクロ除去トグル
  const [removeMacros, setRemoveMacros] = useState<boolean>(() => { try { const v = localStorage.getItem('removeMacros'); return v === 'true'; } catch { return false; } });
  useEffect(()=>{ try { localStorage.setItem('removeMacros', String(removeMacros)); } catch {} }, [removeMacros]);
  // タスクステータス正規化トグル
  const [normalizeTasks, setNormalizeTasks] = useState<boolean>(() => { try { const v = localStorage.getItem('normalizeTasks'); return v === 'true'; } catch { return false; } });
  useEffect(()=>{ try { localStorage.setItem('normalizeTasks', String(normalizeTasks)); } catch {} }, [normalizeTasks]);
  // サイドバー設定表示トグル（Hide properties 等をまとめて隠す）
  const [showSidebarSettings, setShowSidebarSettings] = useState<boolean>(() => {
    try { const v = localStorage.getItem('showSidebarSettings'); return v === 'true'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('showSidebarSettings', String(showSidebarSettings)); } catch {} }, [showSidebarSettings]);
  // COPY CONTENT 対象ハイライト用
  const [copyHover, setCopyHover] = useState<boolean>(false);
  const sidebarBodyRef = useRef<HTMLDivElement | null>(null);

  // (Create Page dialog removed)

  // collapsed プロパティ行除去は既に isForcedHiddenPropLine で対応 (key === 'collapsed') されているが、念のため本文再構築時にも除外

  // タスク正規化ユーティリティ
  const normalizeTaskLines = (text: string, enable: boolean) => {
    if (!enable) return text;
    const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|HABIT|START|STARTED|DONE|CANCELED|CANCELLED)\s+/i;
    return text.split('\n').map(line => {
      if (/^\s*```/.test(line)) return line;
      const m = line.match(statusRe);
      if (!m) return line;
      if (/^\s*[-*+]\s+\[[ xX-]\]/.test(line)) return line;
      const status = (m[3]||'').toUpperCase();
      const done = /DONE/.test(status);
      const cancel = /CANCEL/.test(status);
      const box = done ? '[x]' : (cancel ? '[-]' : '[ ]');
      return line.replace(statusRe, `${m[1]||''}${m[2]||''}${box} `);
    }).join('\n');
  };
  const removeMacroTokens = (text: string, enable: boolean, alsoQueries: boolean) => {
    if (!enable) return text;
    let t = text;
    const macroRe = alsoQueries ? /\{\{[^}]*\}\}/g : /\{\{(?!\s*query)[^}]*\}\}/ig;
    t = t.replace(macroRe,'');
    return t.replace(/\n{2,}/g,'\n');
  };


  // Ensure the active preview tab is visible in the global tabs scroll area
  useEffect(() => {
    try {
      const bar = document.querySelector('.global-tabs-row .preview-tabs');
      if (!bar) return;
      const active = bar.querySelector('.preview-tab.active') as HTMLElement | null;
      if (!active) return;
      const barEl = bar as HTMLElement;
      const aLeft = active.offsetLeft;
      const aRight = aLeft + active.offsetWidth;
      const vLeft = barEl.scrollLeft;
      const vRight = vLeft + barEl.clientWidth;
      if (aLeft < vLeft) {
        barEl.scrollTo({ left: aLeft - 16, behavior: 'smooth' });
      } else if (aRight > vRight) {
        barEl.scrollTo({ left: aRight - barEl.clientWidth + 16, behavior: 'smooth' });
      }
    } catch {/* ignore */}
  }, [previews, activePreviewIndex]);

  const { t } = useTranslation();
  useEffect(() => { try { localStorage.setItem('hideProperties', String(hideProperties)); } catch {} }, [hideProperties]);
  // hideRefs: 常時 true なので永続化不要（旧キーは削除してクリーンアップ）
  useEffect(() => { try { localStorage.removeItem('hideRefs'); } catch {} }, []);
  // removeBlankLines 永続化不要（常に true）
  useEffect(() => { try { localStorage.setItem('stripPageBrackets', String(stripPageBrackets)); } catch {} }, [stripPageBrackets]);
  useEffect(() => { try { localStorage.setItem('hidePageRefs', String(hidePageRefs)); } catch {} }, [hidePageRefs]);
  useEffect(() => { try { localStorage.setItem('hideQueries', String(hideQueries)); } catch {} }, [hideQueries]);
  useEffect(() => { try { localStorage.setItem('removeStrings', removeStringsRaw); } catch {} }, [removeStringsRaw]);
  // detachedMode は自動判定なので保存しない
  useEffect(() => { try { localStorage.setItem('graphMode', graphMode); } catch {} }, [graphMode]);
  useEffect(() => {
    const syncGraph = async () => {
      try {
        const { currentGraph: cg } = await logseq.App.getUserConfigs();
        if (cg && cg !== currentGraph) {
          if (graphMode === 'logseq') setCurrentGraph(cg); // フォルダモード時は synthetic を保持
        }
        setLogseqCurrentGraph(cg);
        if (graphMode === 'folder') {
          setDetachedMode(true);
        } else {
          if (currentGraph && cg && cg !== currentGraph) setDetachedMode(true); else setDetachedMode(false);
        }
      } catch { /* ignore */ }
    };
    syncGraph();
    const id = setInterval(syncGraph, 4000);
    // UI 再表示時にも判定
    const handler = ({ visible }: any) => { if (visible) syncGraph(); };
    logseq.on('ui:visible:changed', handler);
    return () => { clearInterval(id); try { (logseq as any).off && (logseq as any).off('ui:visible:changed', handler); } catch { /* ignore */ } };
  }, [currentGraph, graphMode]);

  // graphMode が logseq に戻った時 currentGraph を即同期
  useEffect(() => {
    if (graphMode === 'logseq') {
      (async () => {
        try {
          const { currentGraph: cg } = await logseq.App.getUserConfigs();
          if (cg) setCurrentGraph(cg);
        } catch {/* ignore */}
      })();
    }
  }, [graphMode]);

  // 起動時: folderモード復元だが DirectoryHandle が無い場合は logseq に自動復帰
  useEffect(() => {
    if (graphMode === 'folder') {
      const hasHandle = currentDirHandle || (currentGraph && dirHandles[currentGraph]);
      if (!hasHandle) {
        // フォルダ権限未復元なので logseq モードへ戻す
        (async () => {
          try {
            const { currentGraph: cg } = await logseq.App.getUserConfigs();
            if (cg) setCurrentGraph(cg);
          } catch { /* ignore */ }
          setGraphMode('logseq');
          try { localStorage.setItem('graphMode', 'logseq'); } catch {/* ignore */}
        })();
      }
    }
  }, [graphMode, currentGraph, currentDirHandle]);

  // detachedMode のグローバル共有（App 以外に定義された補助レンダリング関数で参照）
  useEffect(() => {
    try { (window as any).__graphSieveDetachedMode = detachedMode; } catch { /* ignore */ }
  }, [detachedMode]);
  useEffect(() => { try { localStorage.setItem('excludeJournals', String(excludeJournals)); } catch {} }, [excludeJournals]);
  // モード切替時にタブ / プレビューを全て閉じる
  useEffect(() => {
    setPreviews([]);
    setActivePreviewIndex(-1);
  }, [graphMode]);

  // 初期ロードで maxBoxNumber が不足している場合のフェイルセーフ
  useEffect(() => {
    if (maxBoxNumber < 10) setMaxBoxNumber(50);
  }, []);

  const cardboxes = useLiveQuery(
    () => {
      if (graphMode === 'folder') {
        return (async () => {
          const all = await db.box.where('graph').equals(currentGraph).sortBy('time');
          all.reverse();
          return all.slice(0, maxBoxNumber);
        })();
      }
      if (detachedMode) {
        return db.box.orderBy('time').reverse().limit(maxBoxNumber).toArray();
      }
      return db.box
        .orderBy('time')
        .filter(b => b.graph === currentGraph)
        .reverse()
        .limit(maxBoxNumber)
        .toArray();
    },
    [currentGraph, maxBoxNumber, detachedMode, graphMode]
  );
  
  // スクロールに応じて追加ロード（動的測定した行高を利用）
  useEffect(() => {
    const handleScroll = () => {
      if (!tileRef.current) return;
      const rh = measuredRowHeightRef.current || tileGridHeight;
      const scrollTop = tileRef.current.scrollTop;
      const scrolledRows = Math.floor(scrollTop / rh);
      const columnSize = tileColumnSize || 1;
      const rowsInAScreen = tileRowSize || 1;
      const loadScreensAhead = 3;
      const targetRows = rowsInAScreen + scrolledRows + rowsInAScreen * loadScreensAhead;
      const limit = columnSize * targetRows;
      setMaxBoxNumber(current => current < limit ? limit : current);
    };
    const el = tileRef.current;
    if (el) el.addEventListener('scroll', handleScroll);
    return () => { if (el) el.removeEventListener('scroll', handleScroll); };
  }, [tileRowSize, tileColumnSize]);

  useEffect(() => {
    const handleKeyDown = (e: { key: string; }) => {
      switch (e.key) {
        case "Escape":
          logseq.hideMainUI({ restoreEditingCursor: true });
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!tileRef.current) return;
    tileRef.current.style.gridAutoRows = `${tileGridHeight}px`;
    const computeRowHeight = () => {
      if (!tileRef.current) return;
      const first = tileRef.current.querySelector('.box') as HTMLElement | null;
      if (first) {
        const h = first.getBoundingClientRect().height + 16; // include margin
        measuredRowHeightRef.current = h;
        const container = tileRef.current;
        const width = container.clientWidth;
        const boxW = first.getBoundingClientRect().width;
        if (boxW > 0) {
          const cols = Math.max(1, Math.floor(width / boxW));
          if (cols !== tileColumnSize) setTileColumnSize(cols);
          const rows = Math.max(1, Math.floor(container.clientHeight / h));
          if (rows !== tileRowSize) setTileRowSize(rows);
        }
      }
    };
    computeRowHeight();
    const ro = new ResizeObserver(() => computeRowHeight());
    ro.observe(tileRef.current);
    window.addEventListener('resize', computeRowHeight);
    return () => { try { ro.disconnect(); } catch {} window.removeEventListener('resize', computeRowHeight); };
  }, [tileRef.current]);

  useEffect(() => {
    const getUserConfigs = async () => {
      const { currentGraph, preferredDateFormat, preferredLanguage, preferredFormat } = await logseq.App.getUserConfigs();
      setCurrentGraph(currentGraph);
      setPreferredDateFormat(preferredDateFormat);
      setPreferredFormat(preferredFormat);
      i18n.changeLanguage(preferredLanguage);
    };
    getUserConfigs();

    return logseq.App.onCurrentGraphChanged(async () => {
      const { currentGraph } = await logseq.App.getUserConfigs();

      setCurrentDirHandle(dirHandles[currentGraph]); // undefined or FileSystemDirectoryHandle

      setCurrentGraph(currentGraph);
    });
  }, []);

  const rebuildDB = useCallback(() => {
    if (!currentGraph) return;

  db.box.where('graph').equals(currentGraph).count().then(async _initialCount => {
      try {
        // Graph の最新ページ情報を取得して Box テーブルを更新
        const { currentGraph: cg } = await logseq.App.getUserConfigs();
        const isSynthetic = currentGraph.startsWith('fs_');
        const targetGraph = isSynthetic ? currentGraph : cg;

        // Synthetic (フォルダ直読み) グラフは Logseq DB クエリをスキップしてファイル列挙のみ
        if (isSynthetic) {
          if (!currentDirHandle) {
            setLoading(false);
            return;
          }
          try {
            const existingSet = new Set<string>();
            // 既存クリア済み想定だが念のため
            await db.box.where('graph').equals(currentGraph).delete();
            const processFile = async (dir: FileSystemDirectoryHandle, entryName: string) => {
              try {
                if (!/\.(md|org)$/i.test(entryName)) return;
                const base = entryName.replace(/\.(md|org)$/i, '');
                const pageName = decodeLogseqFileName(base);
                if (!pageName) return;
                // ジャーナル形式判定は表示段階で使用するためここでは除外しない
                if (existingSet.has(pageName)) return;
                const fileHandle = await dir.getFileHandle(entryName).catch(() => null);
                if (!fileHandle) return;
                const file = await fileHandle.getFile();
                let text = '';
                if (file.size > 0) text = await file.text();
                const [summaryRaw, image] = getSummaryFromRawText(text);
                const summary = summaryRaw.length === 0 ? [''] : summaryRaw;
                await db.box.put({ graph: currentGraph, name: pageName, uuid: '', time: file.lastModified, summary, image });
                existingSet.add(pageName);
              } catch (e) {
                console.warn('Synthetic import failed', entryName, e);
              }
            };
            // ルート直下
            // @ts-ignore
            for await (const [entryName, entry] of (currentDirHandle as any).entries()) {
              if (!entryName) continue;
              if (entry.kind === 'file') {
                await processFile(currentDirHandle, entryName);
              } else if (entry.kind === 'directory' && entryName === 'journals') {
                // journals フォルダ内を列挙
                const journalsDir = await currentDirHandle.getDirectoryHandle('journals').catch(() => null);
                if (journalsDir) {
                  // @ts-ignore
                  for await (const [jName, jEntry] of (journalsDir as any).entries()) {
                    if (!jName || jEntry.kind !== 'file') continue;
                    await processFile(journalsDir, jName);
                  }
                }
              }
            }
            // pages の sibling として選択された root に journalsDirHandle がある場合 (openDirectoryPicker で取得)
            if (journalsDirHandle) {
              try {
                // @ts-ignore
                for await (const [jName, jEntry] of (journalsDirHandle as any).entries()) {
                  if (!jName || jEntry.kind !== 'file') continue;
                  await processFile(journalsDirHandle, jName);
                }
              } catch (e) {
                console.warn('Root-level journals enumeration failed', e);
              }
            }
          } catch (e) {
            console.warn('Synthetic directory enumeration failed', e);
          }
          setLoading(false);
          return; // ここで完了
        }

        // 1) 軽量クエリでページ一覧取得 (original-name/title, uuid, updated-at, journal?)
  type RawTuple = [string, string, number | undefined, boolean | undefined];
        let tuples: RawTuple[] = [];
        try {
          const q: any[] = await logseq.DB.datascriptQuery(`
          [:find ?name ?uuid ?updated ?journal
            :where
            (or
              [?p :block/original-name ?name]
              [?p :block/title ?name])
            [?p :block/uuid ?uuid]
            (or
              [?p :block/updated-at ?updated]
              [(identity 0) ?updated])
            (or
              [?p :block/journal? ?journal]
              (not [?p :block/journal? true]))]`);
          // q は [ [name uuid updated journal?], ... ] 形式
          tuples = (Array.isArray(q) ? q : []).map(r => [r[0], r[1], r[2], r[3]] as RawTuple);
        } catch (e) {
          console.warn('datascriptQuery failed, fallback to getAllPages()', e);
        }

        // フォールバック: 旧方式 (コスト高)
        if (tuples.length === 0) {
          const pages = await logseq.Editor.getAllPages();
          if (!pages) { setLoading(false); return; }
          tuples = pages.map(p => [ (p as any).originalName || (p as any).title, p.uuid, p.updatedAt, p['journal?'] ] as RawTuple);
        }

  // 2) 重複排除（ジャーナル除外は UI 側で）
        const seen = new Set<string>();
        const filtered = tuples.filter(t => {
          const [name] = t;
          if (!name) return false;
          if (seen.has(name)) return false; // 重複除去
          seen.add(name);
          return true;
        });

        // 3) バッチでサマリ取得 (以前と同様) – ただし updatedTime を優先 (dir handle があればファイル実際の更新日時を使う)
        const promises: Promise<void>[] = [];
        while (filtered.length > 0) {
          const tuple = filtered.pop();
          if (!tuple) break;
          const [originalName, uuid, updatedAt] = tuple;
          const promise = (async () => {
            let updatedTime: number | undefined = 0;
            if (currentDirHandle) {
              updatedTime = await getLastUpdatedTime(encodeLogseqFileName(originalName), currentDirHandle!, preferredFormat);
            } else {
              if (originalName === 'Contents') return; // 不正確なためスキップ
              updatedTime = updatedAt || 0;
            }
            if (!updatedTime) return;
            const blocks = await logseq.Editor.getPageBlocksTree(uuid || originalName).catch(err => {
              console.error(`Failed to get blocks: ${originalName}`);
              console.error(err);
              return null;
            });
            if (!blocks || blocks.length === 0) return;
            const [summary, image] = getSummary(blocks);
            if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
           await db.box.put({
             graph: targetGraph,
                name: originalName,
                uuid: uuid || '',
                time: updatedTime,
                summary,
                image,
              });
            }
          })();
          promises.push(promise);

          if (filtered.length === 0 || promises.length >= 100) {
            await Promise.all(promises).catch(err => { console.error(err); });
            promises.splice(0, promises.length);
            await sleep(300); // 短め
          }
        }

        // 4) 追加: pages フォルダ直読みで未登録ファイルを補完（常に実行）
    if (currentDirHandle) {
          try {
      const existing = await db.box.where('graph').equals(currentGraph).toArray();
            const existingSet = new Set(existing.map(b => b.name));
            // @ts-ignore for-await support
            const processFile = async (dir: FileSystemDirectoryHandle, entryName: string) => {
              try {
                if (!/\.(md|org)$/i.test(entryName)) return;
                const base = entryName.replace(/\.(md|org)$/i, '');
                const pageName = decodeLogseqFileName(base);
                if (!pageName) return;
                // const isJournalLike = /^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/.test(pageName); // 取り込み時には未使用
                if (existingSet.has(pageName)) return;
                const fileHandle = await dir.getFileHandle(entryName).catch(() => null);
                if (!fileHandle) return;
                const file = await fileHandle.getFile();
                let text = '';
                if (file.size > 0) text = await file.text();
                const [summaryRaw, image] = getSummaryFromRawText(text);
                const summary = summaryRaw.length === 0 ? [''] : summaryRaw;
                await db.box.put({ graph: currentGraph, name: pageName, uuid: '', time: file.lastModified, summary, image });
                existingSet.add(pageName);
              } catch (e) {
                console.warn('Failed to import file entry', entryName, e);
              }
            };
            // root entries + journals directory
            // @ts-ignore
            for await (const [entryName, entry] of (currentDirHandle as any).entries()) {
              if (!entryName) continue;
              if (entry.kind === 'file') {
                await processFile(currentDirHandle, entryName);
              } else if (entry.kind === 'directory' && entryName === 'journals') {
                const journalsDir = await currentDirHandle.getDirectoryHandle('journals').catch(() => null);
                if (journalsDir) {
                  // @ts-ignore
                  for await (const [jName, jEntry] of (journalsDir as any).entries()) {
                    if (!jName || jEntry.kind !== 'file') continue;
                    await processFile(journalsDir, jName);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('Directory enumeration failed', e);
          }
        }
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    });
  }, [currentDirHandle, currentGraph, preferredFormat, excludeJournals]);

  // Rebuild automatically when excludeJournals changes
  useEffect(() => {
    if (!currentGraph) return;
    (async () => {
      setLoading(true);
      await db.box.where('graph').equals(currentGraph).delete();
      rebuildDB();
    })();
  }, [excludeJournals, currentGraph, rebuildDB]);

  useEffect(() => rebuildDB(), [rebuildDB]);

  useEffect(() => {
    const onFileChanged = async (changes: FileChanges) => {
      const [operation, originalName] = parseOperation(changes);

      // Ignore create event because the file is not created yet.
      if (operation == 'modified' || operation == 'delete') {
        const updatedTime = new Date().getTime();
        logger.debug(`${operation}, ${originalName}, ${updatedTime}`);

        // A trailing slash in the title cannot be recovered from the file name. 
        // This is because they are removed during encoding.
        if (operation === 'modified') {
          const blocks = await logseq.Editor.getPageBlocksTree(originalName).catch(err => {
            console.error(`Failed to get blocks: ${originalName}`);
            console.error(err);
            return null;
          });
          if (!blocks) return;

          const [summary, image] = getSummary(blocks);

          if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
            const box = await db.box.get([currentGraph, originalName]);
            if (box) {
              await db.box.update([currentGraph, originalName], {
                time: updatedTime,
                summary,
                image,
              });
            } else {
              // create
              const page = await logseq.Editor.getPage(originalName);
              if (page) {
                await db.box.put({
                  graph: currentGraph,
                  name: originalName,
                  uuid: page.uuid,
                  time: updatedTime,
                  summary,
                  image,
                });
              }
            }
          } else {
            // If became empty, remove existing box
            await db.box.delete([currentGraph, originalName]);
          }
        }
      }
    };

    // onChanged returns a function to unsubscribe.
    // Use 'return unsubscribe_function' to call unsubscribe_function
    // when component is unmounted, otherwise a lot of listeners will be left.
    const removeOnChanged = logseq.DB.onChanged(onFileChanged);
    return () => {
      removeOnChanged();
    }
  }, [currentGraph]);

  useEffect(() => {
    const handleKeyDown = (e: { key: string; shiftKey: boolean; altKey?: boolean; }) => {
      if (loading) return;
      // 入力系 (typing) のみ抑止。sidebar での選択やボタンフォーカス時も矢印ナビ有効化
      const activeEl = document.activeElement as HTMLElement | null;
      const isTyping = !!activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (isTyping) return;
      const tile = document.getElementById('tile');
      if (!tile?.hasChildNodes()) {
        return;
      }
      const tileWidth = tile!.clientWidth - 24 * 2; // padding is 24px. clientWidth does not include scrollbar width.
      const tileHeight = tile!.offsetHeight;
      const tileTop = tile!.offsetTop;
      // margin-right is auto
      // margin-left must not be auto to avoid the layout becoming too dense
      const boxMarginRight = parseInt(window.getComputedStyle((tile!.children[0] as HTMLElement)).getPropertyValue('margin-right'));
      const boxWidth = (tile!.children[0] as HTMLElement).offsetWidth + 10 + boxMarginRight; // margin-left is 10px
      const boxHeight = (tile!.children[0] as HTMLElement).offsetHeight + 10 * 2; // margin is 10px

      const cols = Math.floor(tileWidth / boxWidth);
      const rows = Math.floor(tileHeight / boxHeight);
      if (e.key === 'ArrowUp') {
        tileRef.current?.focus(); // To un-focus tag input field.
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox - cols;
          if (newIndex < 0) {
            return selectedBox;
          }

          const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
          if (Math.floor(boxTop / boxHeight) <= 1) {
            tile.scrollBy(0, -boxHeight);
          }
          return newIndex;
        });
      }
      else if (e.key === 'ArrowDown') {
        tileRef.current?.focus(); // To un-focus tag input field.
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox + cols;
          if (newIndex >= tile!.childElementCount) {
            return selectedBox;
          }
          const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
          if (Math.floor(boxTop / boxHeight) >= rows - 1) {
            tile.scrollBy(0, boxHeight);
          }

          return newIndex;
        });
      }
      else if (e.key === 'ArrowRight') {
        tileRef.current?.focus(); // To un-focus tag input field.
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox + 1;
          if (newIndex >= tile!.childElementCount) {
            return selectedBox;
          }
          if (Math.floor(selectedBox / cols) !== Math.floor(newIndex / cols)) {
            const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
            if (Math.floor(boxTop / boxHeight) >= rows - 1) {
              tile.scrollBy(0, boxHeight);
            }
          }
          return newIndex;
        });
      }
      else if (e.key === 'ArrowLeft') {
        tileRef.current?.focus(); // To un-focus tag input field.
        setSelectedBox(selectedBox => {
          const newIndex = selectedBox - 1;
          if (newIndex < 0) {
            return selectedBox;
          }
          if (Math.floor(selectedBox / cols) !== Math.floor(newIndex / cols)) {
            const boxTop = (tile!.children[selectedBox] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop; // margin is 10px;
            if (Math.floor(boxTop / boxHeight) <= 1) {
              tile.scrollBy(0, -boxHeight);
            }
          }
          return newIndex;
        });
      }
      else if (e.key === 'Enter') {
        // Enter: open (or duplicate if already open). Shift+Enter: open directly in Logseq main UI.
        const idx = selectedBoxRef.current;
        if (!cardboxes || idx < 0) return;
        // メイン一覧に表示されている配列から取得 (ジャーナル除外後)
        const card = visibleMainBoxes[idx];
        if (!card) return;
        if (e.shiftKey) {
          logseq.App.pushState('page', { name: card.name });
          logseq.hideMainUI({ restoreEditingCursor: true });
          return;
        }
        if (e.altKey) {
          const dup = { ...card, uuid: (card.uuid || card.name) + ':' + Date.now() } as any;
          void openInSidebar(dup);
        } else {
          void openInSidebar(card);
        }
      }
      else {
        switch (e.key) {
          case "Shift":
          case "Control":
          case "Alt":
          case "Meta":
          case "Tab":
            return;
        }
        // 文字入力中（どこかの入力要素にフォーカスがある）ならフォーカスを奪わない
        const active = document.activeElement as HTMLElement | null;
        const isTyping = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        if (isTyping) {
          return;
        }
  // 旧タグ入力フォーカス削除: 今後は何もしない（将来: 検索フィールドへフォーカス予定）
      }

    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, cardboxes]);

  const openInSidebar = useCallback(async (box: Box) => {
    // Detached モードで別グラフの場合はファイル RAW から生成
    const keyMatch = (p: Preview) => (p.box.uuid && box.uuid)
      ? p.box.uuid === box.uuid
      : (p.box.graph === box.graph && p.box.name === box.name);
    setPreviews(prev => {
      // Already open? just activate
      const existed = prev.findIndex(p => keyMatch(p));
      if (existed >= 0) { setActivePreviewIndex(existed); return prev; }
      // 保存時は fake uuid サフィックス (複製用) を除外
      const normalizedBox = { ...box } as Box;
      if (normalizedBox.uuid && normalizedBox.uuid.includes(':')) {
        normalizedBox.uuid = normalizedBox.uuid.split(':')[0];
      }
      const next: Preview = { box: normalizedBox, blocks: null, loading: true, tab: 'content', pinned: false, createdAt: Date.now() };
      const all = [...prev, next];
      // Selection strategy: keep all pinned first (original order), then newest unpinned until cap
      const pinned = all.filter(p => p.pinned);
      const unpinned = all.filter(p => !p.pinned).sort((a,b)=> b.createdAt - a.createdAt); // newest first
      let limited: Preview[];
      if (pinned.length >= maxPreviewTabs) {
        limited = pinned.slice(0, maxPreviewTabs); // drop excess pinned oldest beyond cap
      } else {
        const slots = maxPreviewTabs - pinned.length;
        limited = [...pinned, ...unpinned.slice(0, slots)].sort((a,b)=> {
          // preserve chronological open order among survivors based on createdAt asc
          return a.createdAt - b.createdAt;
        });
      }
      const ni = limited.indexOf(next);
      if (ni >= 0) setActivePreviewIndex(ni); else {
        // New tab was evicted immediately (cap reached). Activate last tab.
        setActivePreviewIndex(Math.max(0, limited.length - 1));
      }
      return limited;
    });
  // フォルダモード(fs_*) または デタッチ状況ではファイルから直接読み込む
    if (box.graph.startsWith('fs_') || (detachedMode && box.graph !== logseqCurrentGraph)) {
      // ファイルから読み取る (フォルダモード or デタッチ)
      try {
        const pagesHandle = dirHandles[box.graph];
        if (!pagesHandle) throw new Error('No directory handle for graph ' + box.graph);

        const attemptLocate = async (): Promise<{ file: File; picked: string } | null> => {
          const primaryBase = encodeLogseqFileName(box.name);
            // slash variant decode for safety
          const nameVariants = Array.from(new Set([
            box.name,
            primaryBase,
            box.name.replace(/\//g,'___')
          ]));
          const exts = ['.md', '.org'];
          const tryInDir = async (dir: FileSystemDirectoryHandle): Promise<{file: File; picked: string} | null> => {
            // direct filename candidates
            for (const v of nameVariants) {
              for (const ext of exts) {
                const candidate = v + ext;
                const fh = await dir.getFileHandle(candidate).catch(()=>null);
                if (fh) { const f = await fh.getFile(); return { file: f, picked: candidate }; }
              }
            }
            // scan decode fallback
            try {
              // @ts-ignore
              for await (const [entryName, entry] of (dir as any).entries()) {
                if (!entryName || entry.kind !== 'file' || !/\.(md|org)$/i.test(entryName)) continue;
                const base = entryName.replace(/\.(md|org)$/i,'');
                if (decodeLogseqFileName(base) === box.name) {
                  const fh = await dir.getFileHandle(entryName).catch(()=>null);
                  if (fh) { const f = await fh.getFile(); return { file: f, picked: entryName }; }
                }
              }
            } catch {/* ignore */}
            return null;
          };

          // 1) pages 直下
          let located = await tryInDir(pagesHandle);
          if (located) return located;

          // 2) pages/journals サブフォルダ
          const subJournals = await pagesHandle.getDirectoryHandle('journals').catch(()=>null);
          if (subJournals) {
            located = await tryInDir(subJournals);
            if (located) return located;
          }
          // 3) sibling journalsDirHandle (folder root)
          if (journalsDirHandle) {
            located = await tryInDir(journalsDirHandle);
            if (located) return located;
          }
          return null;
        };

        const found = await attemptLocate();
        if (!found) throw new Error('File not found for ' + box.name);
        const { file, picked } = found;
        const text = await file.text();
        console.debug('[openInSidebar][detached] loaded file', picked, 'bytes=', text.length);
        // 箇条書き(md)を階層化する簡易パーサ
        const parseBullets = (src: string) => {
          const bulletRe = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
          const root: any[] = [];
          const stack: { level: number; node: any }[] = [];
          const normIndent = (s: string) => s.replace(/\t/g, '  ').length; // tab -> 2 spaces
          let id = 0;
          for (const rawLine of src.split(/\r?\n/)) {
            const line = rawLine.replace(/\s+$/,'');
            if (!line.trim()) continue;
            const m = line.match(bulletRe);
            if (m) {
              const level = Math.floor(normIndent(m[1]) / 2); // 2 spaces 基準
              const content = m[3];
              const node = { uuid: `fs-${box.name}-${id++}`, content, children: [] as any[] };
              while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
              if (stack.length === 0) root.push(node); else stack[stack.length - 1].node.children.push(node);
              stack.push({ level, node });
            } else {
              // 直前ブロックへの追記 (段落行)
              if (stack.length) {
                const cur = stack[stack.length - 1].node;
                cur.content = cur.content ? cur.content + '\n' + line.trim() : line.trim();
              } else {
                // 単独段落としてトップレベル
                root.push({ uuid: `fs-${box.name}-${id++}`, content: line.trim(), children: [] });
              }
            }
          }
          return root;
        };
        let blocks = parseBullets(text);
        // パース結果が空ならパラグラフ単位でフォールバック
        if (!blocks || blocks.length === 0) {
          const paras = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
          blocks = paras.map((p, i) => ({ uuid: `fs-${box.name}-p${i}`, content: p, children: [] }));
        }
        // 依然として空なら全文を単一ブロックに (スペースのみなら空配列)
        if (blocks.length === 0 && text.trim()) {
          blocks = [{ uuid: `fs-${box.name}-all`, content: text.trim(), children: [] }];
        }
        setPreviews(prev => {
          const idx = prev.findIndex(p => keyMatch(p));
          if (idx < 0) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], blocks, loading: false };
          return updated;
        });
      } catch (e) {
        console.warn('Detached raw preview failed', e);
        setPreviews(prev => {
          const idx = prev.findIndex(p => keyMatch(p));
          if (idx < 0) return prev;
          const updated = [...prev];
          updated[idx] = { ...updated[idx], blocks: [], loading: false };
          return updated;
        });
      }
      return;
    }
    // 通常 (同じ実グラフ) ロード
    try {
      const tried: string[] = [];
      const attemptFetchBlocks = async (nm: string) => {
        tried.push(nm);
        return await logseq.Editor.getPageBlocksTree(nm).catch(() => null);
      };
      let blocks: any = null;
      if (box.uuid) {
        blocks = await attemptFetchBlocks(box.uuid);
      }
      if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
        // try by encoded/original name variations
        blocks = await attemptFetchBlocks(box.name);
      }
      if ((!blocks || blocks.length === 0) && /%2F/i.test(box.name)) {
        const decodedSlash = box.name.replace(/%2F/gi, '/');
        if (decodedSlash !== box.name) {
          blocks = await attemptFetchBlocks(decodedSlash);
        }
      }
      if ((!blocks || blocks.length === 0)) {
        // fetch page to get uuid then retry
        const page = await logseq.Editor.getPage(box.name).catch(async () => {
          if (/%2F/i.test(box.name)) return await logseq.Editor.getPage(box.name.replace(/%2F/gi,'/')).catch(()=>null);
          return null;
        });
        const altUuid = (page as any)?.uuid;
        if (altUuid) {
          blocks = await attemptFetchBlocks(altUuid);
        }
      }
      if (!blocks || !Array.isArray(blocks)) blocks = [];
      if (blocks.length === 0) {
        console.debug('[openInSidebar] empty blocks for', box.name, 'tried=', tried);
      }
      setPreviews(prev => {
        const idx = prev.findIndex(p => keyMatch(p));
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], blocks: Array.isArray(blocks) ? blocks : [], loading: false };
        return updated;
      });
    } catch (e) {
      console.error(e);
      setPreviews(prev => {
        const idx = prev.findIndex(p => keyMatch(p));
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], blocks: [], loading: false };
        return updated;
      });
    }
  }, [detachedMode, logseqCurrentGraph, maxPreviewTabs, journalsDirHandle]);

  // Enforce new maxPreviewTabs immediately when user changes the number
  useEffect(() => {
    setPreviews(prev => {
      // Recompute limit using same strategy as openInSidebar
      if (prev.length <= maxPreviewTabs) return prev;
      const pinned = prev.filter(p => p.pinned);
      const unpinned = prev.filter(p => !p.pinned).sort((a,b)=> b.createdAt - a.createdAt);
      let limited: Preview[];
      if (pinned.length >= maxPreviewTabs) {
        limited = pinned.slice(0, maxPreviewTabs);
      } else {
        const slots = maxPreviewTabs - pinned.length;
        limited = [...pinned, ...unpinned.slice(0, slots)].sort((a,b)=> a.createdAt - b.createdAt);
      }
      setActivePreviewIndex(old => {
        if (limited.length === 0) return -1;
        if (old < 0) return limited.length - 1;
        const prevActive = prev[old];
        const ni = limited.indexOf(prevActive);
        return ni >= 0 ? ni : Math.min(old, limited.length - 1);
      });
      return limited;
    });
  }, [maxPreviewTabs]);

  // Persist pinned tabs per mode (logseq / folder)
  useEffect(() => {
    try {
      const key = 'pinnedTabs_' + graphMode;
      const payload = previews.filter(p => p.pinned).map(p => ({ graph: p.box.graph, name: p.box.name }));
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {/* ignore */}
  }, [previews, graphMode]);

  // Restore pinned tabs when mode changes or when currentGraph changes (only if no previews currently shown)
  useEffect(() => {
    (async () => {
      if (previews.length > 0) return; // only auto-restore when empty
      let list: Array<{ graph: string; name: string }>; let raw: string | null = null;
      try { raw = localStorage.getItem('pinnedTabs_' + graphMode); } catch {/* ignore */}
      if (!raw) return;
      try { list = JSON.parse(raw) || []; } catch { return; }
      if (!Array.isArray(list) || list.length === 0) return;
      const restored: Preview[] = [];
      for (const item of list) {
        if (!item || !item.graph || !item.name) continue;
        try {
          const box = await db.box.get([item.graph, item.name]);
          if (!box) continue;
          restored.push({ box, blocks: null, loading: true, tab: 'content', pinned: true, createdAt: Date.now() });
        } catch {/* ignore */}
      }
      if (restored.length === 0) return;
      setPreviews(prev => {
        if (prev.length > 0) return prev; // race check
        // Apply limit logic (pinned have priority; if overflow, drop oldest pinned beyond cap)
        let arr = restored;
        if (arr.length > maxPreviewTabs) {
          arr = arr.sort((a,b)=> a.createdAt - b.createdAt).slice(arr.length - maxPreviewTabs); // keep newest pinned within cap
        }
        setActivePreviewIndex(arr.length - 1);
        return arr;
      });
    })();
  }, [graphMode, currentGraph]);

  const closeActivePreview = useCallback(() => {
    setPreviews(prev => {
      if (activePreviewIndex < 0 || activePreviewIndex >= prev.length) return prev;
      const arr = [...prev];
      arr.splice(activePreviewIndex, 1);
      // adjust active index
      const newActive = arr.length === 0 ? -1 : Math.min(activePreviewIndex, arr.length - 1);
      setActivePreviewIndex(newActive);
      return arr;
    });
  }, [activePreviewIndex]);

  const setActiveTab = (tab: PreviewTab) => {
    // NO MARKDOWN を開いたときは、Hide properties / Hide refs を自動でONにする
    if (tab === 'nomark') {
      if (!hideProperties) setHideProperties(true);
      // hideRefs は常時 true
    }
    setPreviews(prev => {
      if (activePreviewIndex < 0 || activePreviewIndex >= prev.length) return prev;
      const arr = [...prev];
      arr[activePreviewIndex] = { ...arr[activePreviewIndex], tab };
      return arr;
    });
  };

  const closePreviewAt = useCallback((index: number) => {
    setPreviews(prev => {
      if (index < 0 || index >= prev.length) return prev;
      const arr = [...prev];
      arr.splice(index, 1);
      setActivePreviewIndex(old => {
        if (arr.length === 0) return -1;
        if (old === index) return Math.min(index, arr.length - 1);
        if (old > index) return old - 1;
        return old;
      });
      return arr;
    });
  }, []);

  // Derived active preview values for rendering
  const activePreview = activePreviewIndex >= 0 ? previews[activePreviewIndex] : null;
  const sidebarBox = activePreview?.box || null;
  const sidebarBlocks = activePreview?.blocks || null;
  const sidebarLoading = activePreview?.loading || false;
  const sidebarTab: PreviewTab = activePreview?.tab || 'content';

  // Related pages (simple heuristic): children and siblings of current page
  const [related, setRelated] = useState<Box[]>([]);
  const [subpages, setSubpages] = useState<Box[]>([]);
  const [subpagesDeeper, setSubpagesDeeper] = useState<boolean>(false);
  const [favorites, setFavorites] = useState<Box[]>([]);
  const [leftFavorites, setLeftFavorites] = useState<Box[]>([]);
  useEffect(() => {
    const loadRelated = async () => {
      const name = sidebarBox?.name;
      if (!name || !currentGraph) { setRelated([]); return; }
      try {
        const boxes = await db.box.where('graph').equals(currentGraph).toArray();
        const rel: Box[] = [];
        // children
        const childPrefix = name + '/';
        for (const b of boxes) {
          if (b.name !== name && b.name.startsWith(childPrefix)) rel.push(b);
        }
        // siblings (same parent folder)
        const lastSlash = name.lastIndexOf('/');
        if (lastSlash > 0) {
          const parentPrefix = name.slice(0, lastSlash + 1);
          for (const b of boxes) {
            if (b.name !== name && b.name.startsWith(parentPrefix)) {
              const rest = b.name.slice(parentPrefix.length);
              if (rest.length > 0 && !rest.includes('/')) rel.push(b);
            }
          }
        }
        // dedupe and cap
        const seen = new Set<string>();
        const unique = rel.filter(b => { const k = `${b.graph}::${b.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
        setRelated(unique.slice(0, 30));
      } catch { setRelated([]); }
    };
    loadRelated();
  }, [sidebarBox?.name, currentGraph]);

  // Load sub pages (children under current page path) for fallback view
  useEffect(() => {
    const loadSub = async () => {
      const name = sidebarBox?.name;
      if (!name || !currentGraph) { setSubpages([]); setSubpagesDeeper(false); return; }
      try {
        // Journals: show same-month entries as "sub pages"
        const jMatch = name.match(/^(?:journals\/)?(\d{4})[_-]?(\d{2})[_-]?(\d{2})$/);
        if (jMatch) {
          const y = jMatch[1]; const m = jMatch[2];
          const boxes = await db.box.where('graph').equals(currentGraph).toArray();
          const siblings = boxes
            .filter(b => /^(?:journals\/)?\d{4}[_-]?\d{2}[_-]?\d{2}$/.test(b.name))
            .filter(b => b.name !== name && b.name.startsWith(`${y}_${m}`))
            .sort((a,b)=> b.time - a.time)
            .slice(0, 60);
          setSubpages(siblings);
          setSubpagesDeeper(false);
          return;
        }
        const items = await db.box
          .where('graph').equals(currentGraph)
          .and(b => b.name.startsWith(name + '/'))
          .toArray();
        const prefix = name + '/';
        const oneLevel = items.filter(b => {
          const rest = b.name.slice(prefix.length);
          return rest.length > 0 && !rest.includes('/');
        });
        if (oneLevel.length > 0) {
          setSubpages(oneLevel);
          setSubpagesDeeper(false);
        } else if (items.length > 0) {
          const limited = items.slice(0, 80);
          setSubpages(limited);
          setSubpagesDeeper(true);
        } else {
          setSubpages([]);
          setSubpagesDeeper(false);
        }
      } catch { setSubpages([]); setSubpagesDeeper(false); }
    };
    loadSub();
  }, [sidebarBox?.name, currentGraph]);

  // Load favorites list (for current page scope: children favorites first, then recent other favorites)
  useEffect(() => {
    const loadFav = async () => {
      const name = sidebarBox?.name;
      if (!currentGraph) { setFavorites([]); return; }
      try {
        const allFav = await db.box
          .where('graph').equals(currentGraph)
          .and(b => !!b.favorite)
          .reverse()
          .sortBy('time');
        if (!name) { setFavorites(allFav.slice(0, 50)); return; }
        const prefix = name + '/';
        const children = allFav.filter(b => b.name.startsWith(prefix));
        const others = allFav.filter(b => !b.name.startsWith(prefix));
        setFavorites([ ...children, ...others ].slice(0, 50));
      } catch { setFavorites([]); }
    };
    loadFav();
  }, [sidebarBox?.name, currentGraph]);

  // Load global favorites for left pane
  useEffect(() => {
    const loadLeftFav = async () => {
      if (!currentGraph) { setLeftFavorites([]); return; }
      try {
        const favs = await db.box
          .where('graph').equals(currentGraph)
          .and(b => !!b.favorite)
          .reverse()
          .sortBy('time');
        setLeftFavorites(favs.slice(0, 100));
      } catch { setLeftFavorites([]); }
    };
    loadLeftFav();
  }, [currentGraph, favorites.length]);

  // (Backlinks removed)

  const openDirectoryPicker = useCallback(async () => {
    const handle = await window.showDirectoryPicker();
    let pagesHandle: FileSystemDirectoryHandle | null = null;
    let assetsHandle: FileSystemDirectoryHandle | null = null;
    let journalsHandle: FileSystemDirectoryHandle | null = null;
    if (handle.name === 'pages') {
      // pages フォルダ自身が選ばれた（journals は sibling で到達不可）
      pagesHandle = handle;
    } else {
      // ルートと仮定し pages / journals / assets を探索
      try { pagesHandle = await handle.getDirectoryHandle('pages'); } catch { pagesHandle = null; }
      if (!pagesHandle) { logseq.UI.showMsg(t('please-select-pages')); return; }
      try { journalsHandle = await handle.getDirectoryHandle('journals'); } catch { journalsHandle = null; }
      try { assetsHandle = await handle.getDirectoryHandle('assets'); } catch { assetsHandle = null; }
    }
    setAssetsDirHandle(assetsHandle || null as any);
    setJournalsDirHandle(journalsHandle || undefined);
    const hashSourceHandle = pagesHandle!; // graph id hash は pages から生成
    // 合成グラフID生成（最初の最大40エントリ名ハッシュ）
    let acc = 5381;
    try {
      let count = 0;
      // @ts-ignore
      for await (const [name, entry] of (hashSourceHandle as any).entries()) {
        if (count >= 40) break;
        for (let i = 0; i < name.length; i++) acc = ((acc << 5) + acc) + name.charCodeAt(i);
        count++;
      }
    } catch {/* ignore */}
    const hash = (acc >>> 0).toString(36).slice(0,8);
    const syntheticId = `fs_${hash}`;
    dirHandles[syntheticId] = pagesHandle!;
    await db.box.where('graph').equals(syntheticId).delete();
    setCurrentGraph(syntheticId);
  setCurrentDirHandle(pagesHandle!);
    setGraphMode('folder');
  }, [currentGraph, t]);

  // モード切替ボタンハンドラ
  const handleToggleMode = useCallback(async () => {
    if (graphMode === 'logseq') {
      // フォルダを選択して folder モードへ
      await openDirectoryPicker();
      return;
    }
    // Logseq モードへ戻す
    try {
      const { currentGraph: cg } = await logseq.App.getUserConfigs();
      if (cg) setCurrentGraph(cg);
      setGraphMode('logseq');
      setCurrentDirHandle(dirHandles[cg] || undefined);
    } catch {/* ignore */}
  }, [graphMode, openDirectoryPicker]);

  const boxOnClick = async (box: Box, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.nativeEvent.shiftKey && !detachedMode && box.graph === currentGraph) {
      // Shift-click: open directly in Logseq main page (only when attached)
      logseq.App.pushState('page', { name: box.name });
      logseq.hideMainUI({ restoreEditingCursor: true });
    } else {
      // Normal click: open inside plugin sidebar (only if same graph or attached mode)
      void openInSidebar(box);
    }
  };

  const toggleArchive = useCallback(async (box: Box, next: boolean) => {
    try {
      await db.box.update([box.graph, box.name], { archived: next });
      // reflect in previews state immediately
      setPreviews(prev => prev.map(p => (
        p.box.graph === box.graph && p.box.name === box.name
          ? { ...p, box: { ...p.box, archived: next } }
          : p
      )));
    } catch (e) {
      console.error('Failed to update archived flag', e);
    }
  }, []);

  const toggleFavorite = useCallback(async (box: Box, next: boolean) => {
    try {
      await db.box.update([box.graph, box.name], { favorite: next });
      // reflect in previews state immediately
      setPreviews(prev => prev.map(p => (
        p.box.graph === box.graph && p.box.name === box.name
          ? { ...p, box: { ...p.box, favorite: next } }
          : p
      )));
      // refresh favorites list
  const favs = await db.box.where('graph').equals(currentGraph).and(b => !!b.favorite).reverse().sortBy('time');
  setFavorites(favs.slice(0, 50));
  setLeftFavorites(favs.slice(0, 100));
    } catch (e) {
      console.error('Failed to update favorite flag', e);
    }
  }, [currentGraph]);

  const formatDateByPattern = (dt: Date, pattern: string) => {
    // シンプル置換 (yyyy, MM, dd)
    const yyyy = String(dt.getFullYear());
    const MM = String(dt.getMonth()+1).padStart(2,'0');
    const dd = String(dt.getDate()).padStart(2,'0');
    return pattern.replace(/yyyy/g, yyyy).replace(/MM/g, MM).replace(/dd/g, dd);
  };

  const displayTitle = (name: string) => {
    const decoded = name.replace(/%2F/gi, '/');
    if (graphMode === 'folder') {
      const noExt = decoded.replace(/\.(md|org)$/i, '');
      const journalMatch = noExt.match(/^(?:journals\/)?(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
      if (journalMatch) {
        const [, y, m, d] = journalMatch;
        try {
          const dt = new Date(Number(y), Number(m) - 1, Number(d));
      return formatDateByPattern(dt, journalDatePattern);
        } catch {
          return `${y}/${m}/${d}`;
        }
      }
    }
    return decoded;
  };

  // Journal カード用: 日 + 曜日（ロケール）表示
  const journalDayWeek = (name: string) => {
    const decoded = name.replace(/%2F/gi,'/').replace(/^journals\//,'').replace(/\.(md|org)$/i,'');
    const m = decoded.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
    if (!m) return displayTitle(name);
    const [, y, mo, d] = m;
    try {
      const dt = new Date(Number(y), Number(mo)-1, Number(d));
      const day = new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(dt);
      const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(dt);
      return `${day} ${weekday}`; // 例: 13 Tue (ロケールにより Tue / 火 など)
    } catch { return displayTitle(name); }
  };

  // toJournalPageNameIfDate は BlockList 内で使用するため、関数自体はモジュールスコープ版を下部に定義。

  // フォルダモードでページ名からファイル(File)を特定
  const locateFolderModeFile = useCallback(async (pageName: string): Promise<{ file: File; picked: string } | null> => {
    if (!currentGraph.startsWith('fs_')) return null;
    const pagesHandle = dirHandles[currentGraph];
    if (!pagesHandle) return null;
    const variants: string[] = [pageName, encodeLogseqFileName(pageName), pageName.replace(/\//g,'___')];
    // 日付フォーマット YYYY/MM/DD => YYYY_MM_DD も試す (journals/ プレフィックスも)
    const dateSlash = pageName.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (dateSlash) {
      const underscored = `${dateSlash[1]}_${dateSlash[2]}_${dateSlash[3]}`;
      variants.push(underscored, `journals/${underscored}`);
    }
    const nameVariants = Array.from(new Set(variants));
    const exts = ['.md', '.org'];
    const tryInDir = async (dir: FileSystemDirectoryHandle): Promise<{file: File; picked: string} | null> => {
      for (const v of nameVariants) {
        for (const ext of exts) {
          const candidate = v + ext;
          const fh = await dir.getFileHandle(candidate).catch(()=>null);
          if (fh) { const f = await fh.getFile(); return { file: f, picked: candidate }; }
        }
      }
      try {
        // @ts-ignore
        for await (const [entryName, entry] of (dir as any).entries()) {
          if (!entryName || entry.kind !== 'file' || !/\.(md|org)$/i.test(entryName)) continue;
          const base = entryName.replace(/\.(md|org)$/i,'');
          if (decodeLogseqFileName(base) === pageName) {
            const fh = await dir.getFileHandle(entryName).catch(()=>null);
            if (fh) { const f = await fh.getFile(); return { file: f, picked: entryName }; }
          }
        }
      } catch {/* ignore */}
      return null;
    };
    let located = await tryInDir(pagesHandle);
    if (located) return located;
    const subJournals = await pagesHandle.getDirectoryHandle('journals').catch(()=>null);
    if (subJournals) {
      located = await tryInDir(subJournals);
      if (located) return located;
    }
    if (journalsDirHandle) {
      located = await tryInDir(journalsDirHandle);
      if (located) return located;
    }
    return null;
  }, [currentGraph, journalsDirHandle]);

  // ジャーナル判定ヘルパ
  const isJournalName = (name: string) => /^(?:journals\/)?(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/.test(name.replace(/%2F/gi, '/'));

  // ジャーナル日付 (ファイル名) から比較用数値 YYYYMMDD を取得 (失敗時は 0)
  const journalDateValue = (name: string) => {
    const decoded = name.replace(/%2F/gi, '/').replace(/^journals\//,'').replace(/\.(md|org)$/i,'');
    const m = decoded.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
    if (!m) return 0;
    const [, y, mo, d] = m;
    return parseInt(y + mo + d, 10) || 0;
  };

  // cardboxes から journals と non-journals を分離し journals を日時降順ソート
  const journalBoxes = useMemo(() => {
    if (!cardboxes) return [] as Box[];
    return [...cardboxes.filter(b => isJournalName(b.name))]
      .sort((a,b) => journalDateValue(b.name) - journalDateValue(a.name) || (b.time - a.time)); // 日付降順, 同日は time
  }, [cardboxes]);

  // Journals lazy state
  const [journalLimit, setJournalLimit] = useState(60);
  const visibleJournals = journalBoxes.slice(0, journalLimit);
  const loadMoreJournals = () => { if (journalLimit < journalBoxes.length) setJournalLimit(journalLimit + 60); };
  const [collapseJournals, setCollapseJournals] = useState(false);
  // Hover 中の補助ペイン識別 (sub/rel)
  const [hoveredSidePane, setHoveredSidePane] = useState<null | 'sub' | 'rel'>(null);
  // Journals collapse 永続化
  useEffect(() => { try { localStorage.setItem('collapseJournals', String(collapseJournals)); } catch {} }, [collapseJournals]);
  useEffect(() => { try { const v = localStorage.getItem('collapseJournals'); if (v !== null) setCollapseJournals(v === 'true'); } catch {} }, []);
  const groupedJournals = useMemo(() => {
    const hasNonTrivialSummary = (box?: Box) => !!box && (box.summary || []).some(l => { const t=(l||'').trim(); return t && t !== '-'; });
    type G = { key: string; label: string; items: Box[] };
    const map = new Map<string, G>();
    const fmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long' });
    for (const j of visibleJournals) {
      if (!hasNonTrivialSummary(j)) continue;
      const decoded = j.name.replace(/%2F/gi,'/').replace(/^journals\//,'').replace(/\.(md|org)$/i,'');
      const m = decoded.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
      if (!m) continue;
      const [ , y, mo ] = m;
      const key = `${y}-${mo}`; // stable key
      let g = map.get(key);
      if (!g) {
        const dateObj = new Date(Number(y), Number(mo)-1, 1);
        g = { key, label: fmt.format(dateObj), items: [] };
        map.set(key, g);
      }
      g.items.push(j);
    }
    // sort each group's items (desc by date value / time)
    for (const g of map.values()) {
      g.items.sort((a,b)=> journalDateValue(b.name) - journalDateValue(a.name) || (b.time - a.time));
    }
    // sort groups descending by key (YYYY-MM)
    return Array.from(map.values()).sort((a,b)=> b.key.localeCompare(a.key));
  }, [visibleJournals]);
  const nonJournalBoxes = useMemo(() => {
    if (!cardboxes) return [] as Box[];
    return cardboxes.filter(b => !isJournalName(b.name));
  }, [cardboxes]);

  // excludeJournals が有効なら main list から journals を外す（下部セクション表示は継続）
  // メイン一覧は常に非ジャーナルのみ
  const visibleMainBoxes = useMemo(() => {
    const hasNonTrivialSummary = (box?: Box) => !!box && (box.summary || []).some(l => { const t=(l||'').trim(); return t && t !== '-'; });
    const q = pageName.trim().toLowerCase();
    const matchName = (b: Box) => {
      if (!q) return true;
      // 候補: 元の内部名 / displayTitle (日付やデコード後) / アンダースコア・ハイフンをスペース化
      const raw = (b.name||'');
      const disp = displayTitle(b.name);
      const variants = [raw, disp];
      for (const v of variants) {
        const lower = v.toLowerCase();
        if (lower.includes(q)) return true;
        const spaced = lower.replace(/[_-]+/g,' ');
        if (spaced.includes(q)) return true;
      }
      return false;
    };
    return nonJournalBoxes.filter(b => hasNonTrivialSummary(b) && matchName(b));
  }, [nonJournalBoxes, pageName]);

  // 全体カウント: 空サマリ ('' だけ / '-' だけ) を除外し Journals とその他を分離
  const nonJournalCount = visibleMainBoxes.length;
  const journalCount = useMemo(() => {
    const hasNonTrivialSummary = (box?: Box) => !!box && (box.summary || []).some(l => { const t=(l||'').trim(); return t && t !== '-'; });
    return journalBoxes.filter(b => hasNonTrivialSummary(b)).length;
  }, [journalBoxes]);

  const boxElements = visibleMainBoxes.map((box: Box, index) => (
    <BoxCard
      key={box.uuid || box.name}
      box={box}
      selected={selectedBox === index}
      currentGraph={currentGraph}
      preferredDateFormat={preferredDateFormat}
      onClick={boxOnClick}
      displayName={displayTitle(box.name)}
    />
  ));

  // Open a page by name in a new/activated preview tab
  const openPageInPreviewByName = useCallback(async (name: string) => {
    try {
      const found = await db.box.get([currentGraph, name]);
      if (found) { void openInSidebar(found); return; }
    } catch {/* ignore */}
    if (!currentGraph.startsWith('fs_')) {
      try {
        const page = await logseq.Editor.getPage(name).catch(() => null);
        const box: Box = { graph: currentGraph, name: page?.originalName || name, uuid: page?.uuid || '', time: Date.now(), summary: [], image: '' } as Box;
        void openInSidebar(box);
      } catch {/* ignore */}
      return;
    }
    try {
      const located = await locateFolderModeFile(name);
      if (located) {
        const text = await located.file.text();
        const [summaryRaw, image] = getSummaryFromRawText(text);
        const summary = summaryRaw.length === 0 ? [''] : summaryRaw;
        const box: Box = { graph: currentGraph, name, uuid: '', time: located.file.lastModified, summary, image } as Box;
        try { await db.box.put(box); } catch {/* ignore */}
        void openInSidebar(box);
      } else {
        const box: Box = { graph: currentGraph, name, uuid: '', time: Date.now(), summary: [], image: '' } as Box;
        void openInSidebar(box);
      }
    } catch {/* ignore */}
  }, [currentGraph, openInSidebar, locateFolderModeFile]);

  // (removed duplicate visibleMainBoxes / misplaced toggle)
  return (
    <>
      <div className='control'>
        <div className='control-left'>
          <div className='loading' style={{ display: loading ? 'block' : 'none' }}>{t('loading')}</div>
          <div className='card-number'>Cards: {nonJournalCount}{journalBoxes.length > 0 ? ` (Journals: ${journalCount})` : ''}</div>
          <TextField id='page-input' size='small' label={t('filter-by-page-name')} variant='filled' style={{ marginLeft: 12, marginTop: 1, float: 'left' }} value={pageName} onChange={e => setPageName(e.target.value)} InputProps={{ endAdornment: (<InputAdornment position='end'><IconButton onClick={() => setPageName('')} edge='end'><Clear /></IconButton></InputAdornment>), inputProps: { tabIndex: 1 } }} />
          {/* Advanced 検索ボックス廃止 */}
        </div>
        <div className='control-right'>
          <Tooltip title='Plugin Settings'>
            <IconButton size='small' onClick={()=> setGlobalSettingsOpen(true)} aria-label='open-plugin-settings'>
              <SettingsIcon fontSize='small' />
            </IconButton>
          </Tooltip>
          {(() => {
            const pluginLabel = currentGraph ? (currentGraph.startsWith('fs_') ? currentGraph : currentGraph.replace('logseq_local_', '')) : '-';
            const logseqLabel = logseqCurrentGraph ? logseqCurrentGraph.replace('logseq_local_', '') : '-';
            return (
              <div className='graph-info' title={`Plugin: ${pluginLabel}\nLogseq: ${logseqLabel}`}>
                <span className='g-label'>{t('graph-label')}:</span>
                <span className='g-section plugin'>P:<span className='g-name'>{pluginLabel}</span></span>
                <span className='g-sep'>|</span>
                <span className='g-section logseq'>L:<span className='g-name'>{logseqLabel}</span></span>
                <span className='g-mode-badge' style={{ background: graphMode === 'folder' ? '#2d6' : '#268bd2', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }} title={graphMode === 'folder' ? 'Folder Mode' : 'Logseq Mode'}>{graphMode === 'folder' ? 'FOLDER' : 'LOGSEQ'}</span>
                <Button size='small' variant='outlined' style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, padding: '2px 8px' }} onClick={handleToggleMode} title={graphMode === 'logseq' ? 'Logseq モード → フォルダモードへ切替' : 'フォルダモード → Logseq モードへ切替'}>{graphMode === 'logseq' ? '→ Folder' : '→ Logseq'}</Button>
                {detachedMode && <span className='badge-detached' title='Detached (graphs differ)'>DETACHED</span>}
                {(currentGraph && logseqCurrentGraph && currentGraph !== logseqCurrentGraph) && <span className='g-mismatch' title='Graph mismatch'>&#9888;</span>}
              </div>
            );
          })()}
          {graphMode !== 'folder' && (
            <FormControlLabel style={{ marginLeft: 8, marginTop: 4 }} control={<Switch size='small' checked={excludeJournals} onChange={(_, v) => setExcludeJournals(v)} />} label={t('exclude-journals')} title={t('exclude-journals-hint') || ''} />
          )}
          <Clear className='clear-btn' onClick={() => logseq.hideMainUI({ restoreEditingCursor: true })} style={{ cursor: 'pointer', float: 'right', marginTop: 10, marginRight: 24 }} />
        </div>
  </div>
  <div className={'global-tabs-row' + (previews.length===0 ? ' empty':'')}>
        <div className='tabs-actions'>
          <Tooltip title={t('close-all-tabs') || 'Close all tabs'}>
            <IconButton size='small' onClick={() => { setPreviews([]); setActivePreviewIndex(-1); }} aria-label='close-all-tabs'><ClearAllIcon fontSize='small' /></IconButton>
          </Tooltip>
        </div>
        <div className='tabs-spacer' />
        <div className={'preview-tabs' + (previews.length===0 ? ' empty':'')}>
          {previews.length===0 && <span style={{padding:'2px 4px'}}>No tabs</span>}
          {previews.map((p, idx) => {
            const active = idx === activePreviewIndex;
            return (
              <span key={p.box.uuid || p.box.name + ':' + idx} className={'preview-tab' + (active ? ' active' : '') + (p.pinned ? ' pinned' : '')}
                onMouseEnter={() => setHoverCloseIndex(idx)}
                onMouseLeave={() => setHoverCloseIndex(null)}
              >
                <Button size='small' variant={active ? 'contained' : 'text'} onClick={() => setActivePreviewIndex(idx)} title={displayTitle(p.box.name)} className='preview-tab-btn'>
                  {/* Pin marker */}
                  <span
                    className={'tab-marker pin-marker' + (p.pinned ? ' pinned' : '')}
                    onClick={(e) => { e.stopPropagation(); setPreviews(prev => prev.map((pp, i) => i === idx ? { ...pp, pinned: !pp.pinned } : pp)); }}
                    title={p.pinned ? 'Unpin' : 'Pin'}
                  >
                    {p.pinned ? '📌' : '•'}
                  </span>
                  <span className='tab-title-ellipsis'>{displayTitle(p.box.name)}</span>
                  {/* Close marker (shows only on hover) */}
                  <span
                    className={'tab-marker close-marker' + (hoverCloseIndex === idx ? ' visible' : '')}
                    onClick={(e) => { e.stopPropagation(); closePreviewAt(idx); }}
                    title={t('close')}
                  >
                    ×
                  </span>
                </Button>
              </span>
            );
          })}
          <div className='max-tabs-setting'>
            <TextField size='small' type='number' label='Max' variant='filled' value={maxPreviewTabs} onClick={e => e.stopPropagation()} onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n > 0) setMaxPreviewTabs(n); }} inputProps={{ min: 1, style: { width: 60, padding: 2 } }} style={{ marginLeft: 8 }} />
          </div>
        </div>
  </div>
  <div className='content'>
        <Dialog open={globalSettingsOpen} onClose={()=> setGlobalSettingsOpen(false)} maxWidth='sm' fullWidth>
          <DialogTitle style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
            <span>Plugin Settings</span>
            <Button size='small' variant='outlined' onClick={resetUiFont}>Reset</Button>
          </DialogTitle>
          <DialogContent dividers>
            {/* Date formats */}
            <div style={{display:'flex',flexWrap:'wrap',gap:16,marginBottom:20}}>
              <TextField size='small' label={t('journal-date-format-label') || 'Journal Date Format'} value={journalDatePattern} onChange={e=> { const v = e.target.value.trim() || 'yyyy/MM/dd'; setJournalDatePattern(v); }} helperText={t('journal-date-format-help') || 'Tokens: yyyy MM dd'} style={{width:240}} />
              <TextField size='small' label={t('journal-link-format-label') || 'Journal Link Format'} value={journalLinkPattern} onChange={e=> { const v = e.target.value.trim() || 'yyyy/MM/dd'; setJournalLinkPattern(v); }} helperText={t('journal-link-format-help') || 'For parsing links: yyyy MM dd'} style={{width:260}} />
            </div>
            {/* Font related settings */}
            <div style={{display:'flex',flexWrap:'wrap',gap:16}}>
              <TextField size='small' type='number' label='Font Size' value={uiFontSize} onChange={e=>{const v=parseInt(e.target.value,10); if(!isNaN(v)&&v>=8&&v<=40) setUiFontSize(v);}} style={{width:120}} />
              <TextField size='small' type='number' label='Line Height' value={uiLineHeight} onChange={e=>{const v=parseFloat(e.target.value); if(!isNaN(v)&&v>=1&&v<=3) setUiLineHeight(v);}} style={{width:140}} />
              <TextField size='small' type='number' label='Font Weight' value={uiFontWeight} onChange={e=>{const v=parseInt(e.target.value,10); if(!isNaN(v)&&v>=300&&v<=900) setUiFontWeight(v);}} style={{width:150}} />
              <TextField size='small' label='Google Font Family' value={uiFontFamily} onChange={e=> setUiFontFamily(e.target.value)} helperText='例: Inter / Roboto / Noto Sans JP' style={{flex:'1 1 240px'}} />
            </div>
            <div style={{marginTop:12}}>
              <div style={{fontSize:12,opacity:.75,marginBottom:4}}>Quick Pick</div>
              {['Inter','Roboto','Noto Sans JP','M PLUS Rounded 1c','Source Sans 3','Fira Code','Nunito','Ubuntu','Merriweather'].map(f => (
                <Chip key={f} size='small' label={f} onClick={()=> setUiFontFamily(f)} style={{margin:2}} />
              ))}
            </div>
            <div style={{marginTop:16,padding:10,border:'1px solid #ddd',borderRadius:6,background:'#fafafa'}}>
              <div style={{fontSize:12,opacity:.65,marginBottom:6}}>Preview</div>
              <div style={{fontFamily: uiFontFamily?`'${uiFontFamily}', system-ui, sans-serif`:'system-ui, sans-serif', fontSize:uiFontSize, lineHeight:uiLineHeight, fontWeight:uiFontWeight}}>
                {t('sample-text')}
              </div>
            </div>
            <div style={{marginTop:16,fontSize:11,opacity:.7,lineHeight:1.4}}>{t('note-fonts')}</div>
          </DialogContent>
          <DialogActions>
            <Button onClick={()=> setGlobalSettingsOpen(false)} autoFocus>{t('close')}</Button>
          </DialogActions>
        </Dialog>
        <div className='left-pane'>
          <div id='tile' ref={tileRef} tabIndex={2}>{boxElements}</div>
          <div className='left-favorites'>
            <div className='favorites-header'><div className='favorites-title'>{t('favorites') || 'Favorites'}</div></div>
            {leftFavorites.length === 0 ? <div className='sidebar-empty'>{t('no-content')}</div> : <div className='cards-grid'>{leftFavorites.map(b => (<BoxCard key={`left-fav-${b.graph}-${b.name}`} box={b} selected={false} currentGraph={currentGraph} preferredDateFormat={preferredDateFormat} onClick={boxOnClick} displayName={displayTitle(b.name)} />))}</div>}
          </div>
          {(((graphMode === 'folder') || (!excludeJournals)) && journalBoxes.length > 0) && (
            <div className={'left-journals' + (collapseJournals ? ' collapsed' : '')} onScroll={e => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) loadMoreJournals();
            }}>
              <div className='journals-header'>
                <div className='journals-title'>JOURNALS</div>
                <button style={{ fontSize:11, padding:'2px 6px' }} onClick={() => setCollapseJournals(c => !c)}>{collapseJournals ? 'Expand' : 'Collapse'}</button>
              </div>
              {!collapseJournals && groupedJournals.map(g => (
                <div key={g.key} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize:11, fontWeight:600, letterSpacing:0.5, margin:'6px 0 4px', borderBottom:'1px solid #ddd', paddingBottom:2 }}>{g.label}</div>
                  <div className='journals-grid'>
                    {g.items.map(j => (
                      <BoxCard key={`journal-${j.graph}-${j.name}`} box={j} selected={false} currentGraph={currentGraph} preferredDateFormat={preferredDateFormat} onClick={boxOnClick} displayName={journalDayWeek(j.name)} />
                    ))}
                  </div>
                </div>
              ))}
              {!collapseJournals && journalLimit < journalBoxes.length && (
                <div style={{ textAlign:'center', marginTop:8 }}>
                  <button style={{ fontSize:11, padding:'4px 10px' }} onClick={loadMoreJournals}>Load more ({journalLimit}/{journalBoxes.length})</button>
                </div>
              )}
            </div>
          )}
        </div>
        <aside id='sidebar'>
          {sidebarBox ? (
            <div className={'sidebar-inner' + (sidebarBox.archived ? ' archived' : '')}>
              <div className='sidebar-header'>
                <div className='sidebar-title' title={displayTitle(sidebarBox.name)}>{(() => {
                  const rawName = sidebarBox.name || '';
                  // 展開後スラッシュセグメント (journals は 1 セグメントなのでジャーナル整形後を上書き)
                  let segments = rawName.replace(/%2F/gi,'/').split('/').filter(Boolean);
                  if (segments.length === 1) {
                    const dt = displayTitle(rawName);
                    if (dt !== rawName) {
                      // ジャーナル日付 YYYY/MM/DD を階層分割
                      if (/^\d{4}\/\d{2}\/\d{2}$/.test(dt)) {
                        const [y,m,d] = dt.split('/');
                        segments = [y,m,d];
                      } else {
                        segments[0] = dt;
                      }
                    }
                  } else {
                    // 各セグメント個別に displayTitle を適用（必要なら）
                    for (let i=0;i<segments.length;i++) {
                      const maybe = displayTitle(segments.slice(0,i+1).join('/')); // ネストに応じた判定
                      if (maybe.includes('/') && maybe.split('/').length===3) segments[i] = maybe.split('/').slice(-1)[0];
                    }
                  }
                  // rawSegments: ジャーナルは1セグメントのまま (クリックで元ページ開くため)
                  const rawSegmentsBase = rawName.split('/').filter(Boolean);
                  const isJournalSingle = /^\d{4}_[0-1]\d_[0-3]\d$/.test(rawSegmentsBase[0]) && segments.length===3;
                  const rawSegments = isJournalSingle ? [rawSegmentsBase[0]] : rawSegmentsBase;
                  // 仮想パス: ジャーナル日付 (year, year/month, year/month/day)
                  const journalVirtualPaths = isJournalSingle ? (() => {
                    const [y,m,d] = segments; // segments = [YYYY, MM, DD]
                    return [y, `${y}/${m}`, `${y}/${m}/${d}`];
                  })() : [];
                  const crumbs: React.ReactNode[] = [];
                  for (let i = 0; i < segments.length; i++) {
                    const label = segments[i];
                    const targetName = isJournalSingle ? journalVirtualPaths[i] : rawSegments.slice(0, i + 1).join('/');
                    const displayFull = isJournalSingle ? journalVirtualPaths[i] : segments.slice(0, i + 1).join('/');
                    crumbs.push(<a key={`crumb-${i}`} href='#' className='crumb' onClick={(e) => { e.preventDefault(); (e as React.MouseEvent).shiftKey ? (logseq.App.pushState('page', { name: targetName }), logseq.hideMainUI({ restoreEditingCursor: true })) : void openPageInPreviewByName(targetName); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openPageInPreviewByName(targetName); } }} tabIndex={0} title={displayFull}><span className='crumb-text'>{label}</span></a>);
                    if (i < segments.length - 1) crumbs.push(<span key={`sep-${i}`} className='sep'> / </span>);
                  }
                  return <div className='breadcrumb'>{crumbs}</div>;
                })()}</div>
                <div className='sidebar-controls'>
                  <Tooltip title={sidebarBox.favorite ? (t('unfavorite') || 'Unfavorite') : (t('favorite') || 'Favorite')}><IconButton size='small' onClick={() => toggleFavorite(sidebarBox, !sidebarBox.favorite)} aria-label='favorite-toggle'>{sidebarBox.favorite ? <StarIcon fontSize='small' style={{ color: '#f5b301' }} /> : <StarBorderIcon fontSize='small' />}</IconButton></Tooltip>
                  <Tooltip title={sidebarBox.archived ? 'Unarchive' : 'Archive'}><IconButton size='small' onClick={() => toggleArchive(sidebarBox, !sidebarBox.archived)} aria-label='archive-toggle'>{sidebarBox.archived ? <Inventory2Icon fontSize='small' /> : <Inventory2OutlinedIcon fontSize='small' />}</IconButton></Tooltip>
                </div>
              </div>
              <div className='sidebar-nav'>
                <div className='sidebar-row sidebar-row--tabs'>
                  <div className='sidebar-tabs'>
                    <Button size='small' variant={sidebarTab === 'content' ? 'contained' : 'text'} onClick={() => setActiveTab('content')}>{t('tab-content')}</Button>
                    <Button size='small' variant={sidebarTab === 'nomark' ? 'contained' : 'text'} onClick={() => setActiveTab('nomark')}>{t('tab-no-markdown')}</Button>
                    <Button size='small' variant={sidebarTab === 'outline' ? 'contained' : 'text'} onClick={() => setActiveTab('outline')}>{t('tab-raw')}</Button>
                    {/* rawFullMode トグル削除 */}
                  </div>
                  <div className='spacer' />
                  <Tooltip title={(t('settings') as string) || 'Settings'}><IconButton size='small' onClick={() => setShowSidebarSettings(s => !s)} aria-label='toggle-settings'><SettingsIcon fontSize='small' color={showSidebarSettings ? 'primary' : 'inherit'} /></IconButton></Tooltip>
                </div>
                {showSidebarSettings && <div className='sidebar-row sidebar-row--filters'>
                  {/* NO MARKDOWN では hideProperties 以外を無効化 */}
                  <FormControlLabel className='prop-filter' disabled={false} control={<Switch size='small' checked={hideProperties} onChange={(_, v) => setHideProperties(v)} />} label={t('toggle-hide-properties')} />
                  {/* Hide refs/embeds トグル廃止: 常に非表示 */}
                  <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark'} control={<Switch size='small' checked={stripPageBrackets} onChange={(_, v) => setStripPageBrackets(v)} />} label={t('toggle-strip-page-brackets') || 'Strip [[ ]]'} />
                  <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={!hidePageRefs} onChange={(_, v) => setHidePageRefs(!v)} />} label={t('toggle-page-links') || t('toggle-hide-page-refs') || 'Page links'} />
                  <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={hideQueries} onChange={(_, v) => setHideQueries(v)} />} label={t('toggle-hide-queries') || 'Hide queries'} />
                  <Tooltip title={t('toggle-remove-macros-help') || 'Remove {{macro ...}} constructs (except queries unless hidden)'}><span><FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={removeMacros} onChange={(_, v) => setRemoveMacros(v)} />} label={t('toggle-remove-macros') || 'Remove macros'} /></span></Tooltip>
                  <Tooltip title={t('toggle-normalize-tasks-help') || 'Convert TODO/DONE etc. to Markdown checkboxes'}><span><FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark'} control={<Switch size='small' checked={normalizeTasks} onChange={(_, v) => setNormalizeTasks(v)} />} label={t('toggle-normalize-tasks') || 'Normalize tasks'} /></span></Tooltip>
                </div>}
                {showSidebarSettings && <div className='sidebar-row sidebar-row--options'>
                  <TextField size='small' label={t('always-hide-props')} placeholder={t('always-hide-props-ph')} value={alwaysHidePropKeys} disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} onChange={(e) => { const v = e.target.value; setAlwaysHidePropKeys(v); try { localStorage.setItem('alwaysHideProps', v); } catch {} }} InputProps={{ inputProps: { spellCheck: false } }} style={{ minWidth: '220px' }} />
                  <TextField size='small' label={t('remove-strings')} placeholder={t('remove-strings-ph')} value={removeStringsRaw} disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} onChange={(e) => { setRemoveStringsRaw(e.target.value); }} InputProps={{ inputProps: { spellCheck: false } }} style={{ minWidth: '220px', marginLeft: '8px' }} />
                </div>}
                <div className='sidebar-row sidebar-row--actions'>
                  <div className='sidebar-actions'>
                    <Button size='small' variant='outlined' startIcon={<ContentCopy fontSize='small' />} disabled={(sidebarTab !== 'content' && sidebarTab !== 'nomark' && sidebarTab !== 'outline' && sidebarTab !== 'raw-custom') || sidebarLoading || !(sidebarBlocks && sidebarBlocks.length > 0)} onMouseEnter={() => setCopyHover(true)} onMouseLeave={() => setCopyHover(false)} onFocus={() => setCopyHover(true)} onBlur={() => setCopyHover(false)} onClick={async () => {
                      if (!sidebarBlocks) return;
                      let text: string;
                      if (sidebarTab === 'nomark') {
                        text = blocksToPlainText(sidebarBlocks as BlockNode[], hideProperties, true, 0, alwaysHideKeys, currentGraph.startsWith('fs_'), removeStrings);
                      } else if (sidebarTab === 'outline') {
                        text = outlineTextFromBlocks((sidebarBlocks || []) as BlockNode[], { hideProperties, hideReferences: true, alwaysHideKeys, hideQueries, removeStrings, stripPageBrackets });
                      } else { // content
                        text = flattenBlocksToText(sidebarBlocks as BlockNode[], hideProperties, true, 0, alwaysHideKeys, currentGraph.startsWith('fs_'), removeStrings);
                      }
                      if (sidebarTab !== 'outline') {
                        text = text.split('\n').filter(l => l.trim().length > 0).join('\n');
                        if (stripPageBrackets) {
                          text = text.replace(/\[\[([^\]]+)\]\]/g,'$1')
                            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                            .replace(/\[\[([^\]]+)\]\[([^\]]*)\]\]/g, (_, u, txt) => txt || u);
                        }
                        if (hideQueries) text = text.replace(/\{\{\s*query[^}]*\}\}/ig,'');
                        if (removeMacros) text = removeMacroTokens(text, true, hideQueries);
                        if (removeStrings.length) {
                          for (const rs of removeStrings) if (rs) text = text.split(rs).join('');
                        }
                        if (normalizeTasks) text = normalizeTaskLines(text, true);
                        text = text.replace(/\n{2,}/g,'\n').replace(/ +/g,' ').trim();
                      } else {
                        if (normalizeTasks) text = normalizeTaskLines(text, true);
                        text = text.replace(/\n{2,}/g,'\n').replace(/ +/g,' ').trim();
                      }
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
                        else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
                        logseq.UI.showMsg(t('copied'));
                      } catch (e) { console.error(e); logseq.UI.showMsg(t('copy-failed')); }
                    }}>{t('copy-content')}</Button>
                    {/* Create Page button removed */}
                    {(!detachedMode && sidebarBox && sidebarBox.graph === currentGraph) && <Button size='small' variant='outlined' onClick={() => { if (!sidebarBox) return; logseq.App.pushState('page', { name: sidebarBox.name }); logseq.hideMainUI({ restoreEditingCursor: true }); }}>{t('open-in-logseq')}</Button>}
                    <IconButton size='small' onClick={closeActivePreview} title={t('close')}><Clear fontSize='small' /></IconButton>
                  </div>
                </div>
              </div>
              <div ref={sidebarBodyRef} className='sidebar-body' tabIndex={0}>
                {(() => {
                  // 動的比率計算
                  const isJournalPreview = isJournalName(sidebarBox.name);
                  let subpagesPresent = subpages && subpages.length > 0;
                  const subSet = new Set(subpages.map(s => `${s.graph}::${s.name}`));
                  const filteredRelated = related.filter(r => !subSet.has(`${r.graph}::${r.name}`));
                  let relatedPresent = filteredRelated.length > 0; // Journal の場合は journalRelated も非表示
                  if (isJournalPreview) { subpagesPresent = false; relatedPresent = false; }
                  let mainFlex = 1, subFlex = 0, relFlex = 0;
                  if (!subpagesPresent && !relatedPresent) {
                    mainFlex = 1; // 100%
                  } else if (subpagesPresent && relatedPresent) {
                    mainFlex = 8; subFlex = 1; relFlex = 1; // base
                    if (hoveredSidePane === 'sub') { mainFlex = 6; subFlex = 3; relFlex = 1; }
                    else if (hoveredSidePane === 'rel') { mainFlex = 6; subFlex = 1; relFlex = 3; }
                  } else if (subpagesPresent) {
                    mainFlex = hoveredSidePane === 'sub' ? 6 : 8; subFlex = hoveredSidePane === 'sub' ? 3 : 2;
                  } else if (relatedPresent) {
                    mainFlex = hoveredSidePane === 'rel' ? 6 : 8; relFlex = hoveredSidePane === 'rel' ? 3 : 2;
                  }
                  return (
                    <>
                      <div className={'sidebar-pane sidebar-pane-main'} style={{ flex: mainFlex }}>
                        <div className={'sidebar-main-text' + (copyHover ? ' copy-target-hover' : '')}>
                          {sidebarLoading ? <div className='sidebar-loading'>{t('loading-content')}</div> : sidebarTab === 'content' ? (() => {
                            const has = hasRenderableContent((sidebarBlocks || []) as BlockNode[], hideProperties, true, alwaysHideKeys, hidePageRefs, hideQueries, removeStrings);
                            return (<>{has ? <BlockList blocks={sidebarBlocks || []} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} currentGraph={currentGraph} onOpenPage={openPageInPreviewByName} folderMode={currentGraph.startsWith('fs_')} stripPageBrackets={stripPageBrackets} hidePageRefs={hidePageRefs} hideQueries={hideQueries} assetsDirHandle={assetsDirHandle} removeStrings={removeStrings} normalizeTasks={normalizeTasks} journalLinkPattern={journalLinkPattern} /> : <div className='sidebar-empty'>{t('no-content')}</div>}</>);
                          })() : sidebarTab === 'nomark' ? <PlainTextView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} folderMode={currentGraph.startsWith('fs_')} stripPageBrackets={stripPageBrackets} hideQueries={hideQueries} removeStrings={removeStrings} /> : sidebarTab === 'outline' ? <RawCustomView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} stripPageBrackets={stripPageBrackets} hideQueries={hideQueries} removeStrings={removeStrings} folderMode={currentGraph.startsWith('fs_')} normalizeTasks={normalizeTasks} /> : null}
                        </div>
                      </div>
            {subpagesPresent && <div className='sidebar-pane sidebar-pane-subpages' style={{ flex: subFlex }} onMouseEnter={() => setHoveredSidePane('sub')} onMouseLeave={() => setHoveredSidePane(p => p === 'sub' ? null : p)}>
                        <div className='sidebar-subpages'>
                          <div className='subpages-title'>{t('subpages')}</div>
              {subpagesDeeper && <div className='subpages-notice'>{t('subpages-deeper-notice')}</div>}
                          <div className='cards-grid'>{subpages.map(b => (<BoxCard key={`sub-${b.graph}-${b.name}`} box={b} selected={false} currentGraph={currentGraph} preferredDateFormat={preferredDateFormat} onClick={boxOnClick} displayName={displayTitle(b.name)} />))}</div>
                        </div>
                      </div>}
            {relatedPresent && <div className='sidebar-pane sidebar-pane-related' style={{ flex: relFlex }} onMouseEnter={() => setHoveredSidePane('rel')} onMouseLeave={() => setHoveredSidePane(p => p === 'rel' ? null : p)}>
                        <div className='sidebar-subpages related-subpages'>
                          <div className='subpages-title'>{t('related') || 'Related'}</div>
              {filteredRelated.length === 0 ? <div className='sidebar-empty'>{t('no-content')}</div> : <div className='cards-grid'>{filteredRelated.map(b => (<BoxCard key={`rel-${b.graph}-${b.name}`} box={b} selected={false} currentGraph={currentGraph} preferredDateFormat={preferredDateFormat} onClick={boxOnClick} displayName={displayTitle(b.name)} />))}</div>}
                        </div>
                      </div>}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : <div className='sidebar-placeholder'>{t('sidebar-placeholder')}</div>}
        </aside>
      </div>
      <div className='footer'>{t('footer')}</div>
  {/* (Create Page Dialog removed) */}
      
    </>
  );
}

export default App

// Simple recursive block renderer for sidebar
type BlockNode = {
  content?: string;
  children?: BlockNode[];
};

// Check if any line is renderable under current hide rules
function hasRenderableContent(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, alwaysHideKeys: string[] = [], hidePageRefs: boolean = false, hideQueries: boolean = false, removeStrings: string[] = []): boolean {
  const check = (bs: BlockNode[]): boolean => {
    for (const b of bs) {
  const raw = (b.content ?? '');
      let processed = raw;
      if (removeStrings && removeStrings.length) {
        for (const rs of removeStrings) if (rs) processed = processed.split(rs).join('');
      }
      const lines = processed.split('\n');
      for (const line of lines) {
        let l = line.replace(/\r/g, '');
        if (removeStrings && removeStrings.length) {
          for (const rs of removeStrings) if (rs) l = l.split(rs).join('');
        }
        if (isForcedHiddenPropLine(l, alwaysHideKeys)) continue;
  if (hideProperties && l.includes(':: ')) continue;
  // Apply query hiding first
  if (hideQueries && /\{\{\s*query\b/i.test(l)) continue;
  // Transform page refs if needed (hide => remove brackets keep text already handled later in render; here treat same as strip for emptiness test)
  let transformed = l;
  if (hidePageRefs) transformed = transformed.replace(/\[\[([^\]]+)\]\]/g,'$1');
  // After all transformations, then consider blank line removal
  if (transformed.trim().length === 0) continue;
        const onlyRef = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(l);
        const onlyEmbed = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(l);
        if (hideReferences && (onlyRef || onlyEmbed)) continue;
        // Found at least one visible line
        return true;
      }
      if (b.children && b.children.length && check(b.children)) return true;
    }
    return false;
  };
  return check(blocks);
}

// Detect an id:: property line (to be removed in all modes)
function getPropertyKeyFromLine(line: string): string | null {
  // Matches optional bullet/number + optional checkbox, then key :: value
  const m = line.match(/^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*([^:\n]+?)\s*::\s*/);
  if (!m) return null;
  return m[1].trim();
}
function isForcedHiddenPropLine(line: string, alwaysHideKeys: string[]): boolean {
  const key = getPropertyKeyFromLine(line);
  if (!key) return false;
  const k = key.toLowerCase();
  if (k === 'id' || k === 'collapsed') return true;
  return alwaysHideKeys.includes(k);
}

// ===== ジャーナルリンク判定ユーティリティ =====
function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48));
}
function parseDateByPattern(text: string, pattern: string): { y: number; m: number; d: number } | null {
  if (!text || !pattern) return null;
  const t = normalizeDigits(String(text).trim());
  const p = String(pattern).trim();
  // Escape regex meta chars and replace tokens
  const esc = p.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const order: Array<'yyyy' | 'MM' | 'dd'> = [];
  const reStr = esc.replace(/yyyy|MM|dd/g, (m: any) => {
    order.push(m);
    if (m === 'yyyy') return '(\\d{4})';
    return '(\\d{1,2})';
  });
  const re = new RegExp('^\\s*' + reStr + '\\s*$');
  const m = re.exec(t);
  if (!m) return null;
  let y = 0, M = 0, d = 0;
  for (let i = 0; i < order.length; i++) {
    const v = parseInt(m[i + 1], 10);
    if (order[i] === 'yyyy') y = v; else if (order[i] === 'MM') M = v; else d = v;
  }
  if (!(y && M && d)) return null;
  if (M < 1 || M > 12) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(y, M - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== M - 1 || dt.getDate() !== d) return null;
  return { y, m: M, d };
}
function toJournalPageNameIfDateUsing(pattern: string, s: string): string | null {
  const r = parseDateByPattern(s, pattern);
  if (!r) return null;
  const y = String(r.y).padStart(4, '0');
  const m = String(r.m).padStart(2, '0');
  const d = String(r.d).padStart(2, '0');
  return `${y}_${m}_${d}`;
}

const BlockList: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; currentGraph?: string; onOpenPage?: (name: string) => void; folderMode?: boolean; stripPageBrackets?: boolean; hidePageRefs?: boolean; hideQueries?: boolean; assetsDirHandle?: FileSystemDirectoryHandle; removeStrings?: string[]; normalizeTasks?: boolean; journalLinkPattern?: string }> = ({ blocks, hideProperties, hideReferences, alwaysHideKeys = [], currentGraph, onOpenPage, folderMode, stripPageBrackets, hidePageRefs, hideQueries, assetsDirHandle, removeStrings = [], normalizeTasks = false, journalLinkPattern }) => {
  const { t } = useTranslation();
  const normalizeTaskLinesLocal = (text: string, enable: boolean) => {
    if (!enable) return text;
    const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|HABIT|START|STARTED|DONE|CANCELED|CANCELLED)\s+/i;
    return text.split('\n').map(line => {
      if (/^\s*```/.test(line)) return line;
      const m = line.match(statusRe);
      if (!m) return line;
      if (/^\s*[-*+]\s+\[[ xX-]\]/.test(line)) return line;
      const status = (m[3]||'').toUpperCase();
      const done = /DONE/.test(status);
      const cancel = /CANCEL/.test(status);
      const box = done ? '[x]' : (cancel ? '[-]' : '[ ]');
      return line.replace(statusRe, `${m[1]||''}${m[2]||''}${box} `);
    }).join('\n');
  };
  if (!blocks || blocks.length === 0) return <div className='sidebar-empty'>{t('no-content')}</div>;
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
  const sanitize = (s?: string) => {
  let raw = (s ?? '');
    if (removeStrings && removeStrings.length) {
      for (const rs of removeStrings) if (rs) raw = raw.split(rs).join('');
    }
    const noForced = raw.split('\n').filter(line => !isForcedHiddenPropLine(line, alwaysHideKeys)).join('\n').trimEnd();
    if (!hideProperties) return noForced;
    return noForced.split('\n').filter(line => !line.includes(':: ')).join('\n').trimEnd();
  };
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
    // page refs: [[Page Title]] -> make clickable to open in preview tab
    const withLinks: Array<React.ReactNode> = [];
    let lastIndex = 0;
    const regex = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
  const before = line.slice(lastIndex, m.index);
      if (before) withLinks.push(before);
  let name = m[1];
  // 入力書式が日付ならジャーナルページ名に変換
  const j = journalLinkPattern ? toJournalPageNameIfDateUsing(journalLinkPattern, name) : null;
  if (j) name = j;
      // If content looks like a URL, don't treat as page ref here; keep raw for external link pass
      const looksUrl = /(^|\s)([a-zA-Z]+:\/\/|www\.)/.test(name);
      if (looksUrl) {
        withLinks.push(m[0]);
  } else if (onOpenPage && !hidePageRefs) {
        withLinks.push(
          <a
            key={`ref-${idx}-${m.index}`}
            href='#'
            className='ls-page-ref'
            onClick={(e) => { e.preventDefault(); onOpenPage(name); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPage(name); } }}
            tabIndex={0}
            title={name}
          >
    {stripPageBrackets ? name : `[[${name}]]`}
          </a>
        );
      } else {
        withLinks.push(m[0]);
      }
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < line.length) withLinks.push(line.slice(lastIndex));
    // stripPageBrackets: [[Page]] -> Page
    if (stripPageBrackets) {
      for (let i=0;i<withLinks.length;i++) {
        if (typeof withLinks[i] === 'string') {
          withLinks[i] = (withLinks[i] as string).replace(/\[\[([^\]]+)\]\]/g,'$1');
        }
      }
    }
    if (hideQueries && /\{\{\s*query\b/i.test(line)) return <div key={idx} className='ls-block-line'/>;

    // Convert Markdown [text](url) and Org [[url][text]]/[[url]] links to anchors
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
      // Markdown link excluding images (we already handle images above)
      const mdRe = /\[([^\]]+)\]\(([^)]+)\)/g;
      // Org link [[url][text]] or [[url]]
      const orgRe = /\[\[([^\]]+)\](?:\[([^\]]*)\])?\]/g;
      const isExternal = (u: string) => /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:\/\/|www\.|mailto:|tel:|ftp:|file:|about:|data:|blob:|chrome:|edge:|opera:)/.test(u);
      while (true) {
        mdRe.lastIndex = cursor; orgRe.lastIndex = cursor;
        const m1 = mdRe.exec(chunk);
        const m2 = orgRe.exec(chunk);
        let next: { type: 'md'|'org'; m: RegExpExecArray } | null = null;
        if (m1 && (!m2 || m1.index <= m2.index)) next = { type: 'md', m: m1 };
        else if (m2) next = { type: 'org', m: m2 };
        if (!next) break;
        const start = next.m.index;
        if (start > cursor) withMdLinks.push(chunk.slice(cursor, start));
        if (next.type === 'md') {
          const text = next.m[1];
          let href = next.m[2];
          const j = journalLinkPattern ? toJournalPageNameIfDateUsing(journalLinkPattern, href) : null;
          if (j) href = j;
          // Asset link (relative to ../assets) -> always external style anchor with object URL if available
          if (href.startsWith('../assets/')) {
            const assetHref = getAssetUrl(href) || href;
            withMdLinks.push(
              <a key={`${baseKey}-md-${start}`} href={assetHref} target='_blank' rel='noopener noreferrer' className='ls-asset-link' title={text}>{text}</a>
            );
            cursor = start + next.m[0].length;
            continue;
          }
          // Treat as internal page link if href doesn't look like an external URL
          if (!isExternal(href) && onOpenPage) {
            withMdLinks.push(
              <a
                key={`${baseKey}-md-${start}`}
                href='#'
                className='ls-page-ref'
                onClick={(e) => { e.preventDefault(); onOpenPage(href); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPage(href); } }}
                tabIndex={0}
                title={href}
              >
                {text}
              </a>
            );
          } else {
            // External link
            withMdLinks.push(
              <a key={`${baseKey}-md-${start}`} href={href} target='_blank' rel='noopener noreferrer' className='ls-ext-link' title={text}>{text}</a>
            );
          }
          cursor = start + next.m[0].length;
        } else {
          let url = next.m[1];
          const j2 = journalLinkPattern ? toJournalPageNameIfDateUsing(journalLinkPattern, url) : null;
          if (j2) url = j2;
          const text = next.m[2] || next.m[1];
          if (url.startsWith('../assets/')) {
            const assetHref = getAssetUrl(url) || url;
            withMdLinks.push(
              <a key={`${baseKey}-org-${start}`} href={assetHref} target='_blank' rel='noopener noreferrer' className='ls-asset-link' title={text}>{text}</a>
            );
            cursor = start + next.m[0].length;
            continue;
          }
          // Treat as internal page link if it doesn't look external
          if (!isExternal(url) && onOpenPage) {
            withMdLinks.push(
              <a
                key={`${baseKey}-org-${start}`}
                href='#'
                className='ls-page-ref'
                onClick={(e) => { e.preventDefault(); onOpenPage(url); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenPage(url); } }}
                tabIndex={0}
                title={url}
              >
                {text}
              </a>
            );
          } else {
            // External link
            withMdLinks.push(
              <a key={`${baseKey}-org-${start}`} href={url} target='_blank' rel='noopener noreferrer' className='ls-ext-link' title={text}>{text}</a>
            );
          }
          cursor = start + next.m[0].length;
        }
      }
      if (cursor < chunk.length) withMdLinks.push(chunk.slice(cursor));
    };
    withLinks.forEach((chunk, i) => {
      if (typeof chunk !== 'string') { withMdLinks.push(chunk); return; }
      processMdLinks(chunk, `lnk-${idx}-${i}`);
    });

    // Inline block refs: ((uuid)) appearing anywhere in the line
    const InlineRef: React.FC<{ uuid: string; k: string }> = ({ uuid, k }) => {
      const [preview, setPreview] = useState<string>('');
      useEffect(() => {
        let mounted = true;
        (async () => {
          if (folderMode) return; // Folder mode: no getBlock
          try {
            if ((window as any).__graphSieveDetachedMode) { return; }
            const blk = await logseq.Editor.getBlock(uuid);
            if (blk && mounted) {
              const first = (blk.content || '').split('\n')[0] || '';
              setPreview(first);
            }
          } catch { /* ignore */ }
        })();
        return () => { mounted = false; };
      }, [uuid]);
      if (folderMode) return <span key={k} className='ls-inline-ref ref removed'></span>;
      const detached = (window as any).__graphSieveDetachedMode;
      return <span key={k} className='ls-inline-ref ref faded'>[ref] <span className='ref-text'>{detached ? uuid.slice(0,8) : preview}</span></span>;
    };

  const withRefs: Array<React.ReactNode> = [];
  withMdLinks.forEach((chunk, i) => {
      if (typeof chunk !== 'string') { withRefs.push(chunk); return; }
      let last = 0; let mm: RegExpExecArray | null;
      const r = /\(\(([0-9a-fA-F-]{36})\)\)/g;
      while ((mm = r.exec(chunk)) !== null) {
        const before = chunk.slice(last, mm.index);
        if (before) withRefs.push(before);
        const uuid = mm[1];
        if (!hideReferences) {
          withRefs.push(<InlineRef key={`bref-${idx}-${i}-${mm.index}`} uuid={uuid} k={`bref-${idx}-${i}-${mm.index}`} />);
        }
        last = mm.index + mm[0].length;
      }
      if (last < chunk.length) withRefs.push(chunk.slice(last));
    });

    // Inline embeds: {{embed ((uuid))}} and {{embed [[Page]]}}
    const InlineEmbedBlock: React.FC<{ uuid: string; k: string }> = ({ uuid, k }) => {
      const [preview, setPreview] = useState<string>('');
      useEffect(() => {
        let mounted = true;
        (async () => {
          if (folderMode) return; // Folder mode: skip fetching
          try {
            if ((window as any).__graphSieveDetachedMode) { return; }
            const blk = await logseq.Editor.getBlock(uuid);
            if (blk && mounted) {
              const first = (blk.content || '').split('\n')[0] || '';
              setPreview(first);
            }
          } catch {/* ignore */}
        })();
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
          const before = chunk.slice(cursor, start);
          if (before) withEmbeds.push(before);
          const uuid = m[1];
          if (!hideReferences) withEmbeds.push(<InlineEmbedBlock key={`emb-b-${idx}-${i}-${start}`} uuid={uuid} k={`emb-b-${idx}-${i}-${start}`} />);
          cursor = start + m[0].length;
        } },
        { regex: /\{\{\s*embed\s*\[\[([^\]]+)\]\]\s*\}\}/g, handler: (m, start) => {
          const before = chunk.slice(cursor, start);
          if (before) withEmbeds.push(before);
          const name = m[1];
          if (!hideReferences) withEmbeds.push(<InlineEmbedPage key={`emb-p-${idx}-${i}-${start}`} name={name} k={`emb-p-${idx}-${i}-${start}`} />);
          cursor = start + m[0].length;
        } },
      ];

      // Run both patterns in order of appearance
      while (true) {
        let nextMatch: { which: number; m: RegExpExecArray } | null = null;
        for (let pi = 0; pi < patterns.length; pi++) {
          patterns[pi].regex.lastIndex = cursor;
          const m = patterns[pi].regex.exec(chunk);
          if (m) {
            if (!nextMatch || m.index < nextMatch.m.index) nextMatch = { which: pi, m };
          }
        }
        if (!nextMatch) break;
        patterns[nextMatch.which].handler(nextMatch.m, nextMatch.m.index);
      }
      if (cursor < chunk.length) withEmbeds.push(chunk.slice(cursor));
    });
    let finalNodes = withEmbeds.length ? withEmbeds : (withRefs.length ? withRefs : (withLinks.length ? withLinks : [line]));
    if (hideReferences) {
      // 参照/埋め込み非表示時に embed マクロ残骸を空化
      finalNodes = finalNodes.map(n => typeof n === 'string' ? n.replace(/\{\{\s*embed[^}]*\}\}/gi,'') : n);
    }
    return <div key={idx} className={'ls-block-line' + (line.includes(':: ') && !hideProperties ? ' prop' : '')}>{finalNodes}</div>;
  };
  // Block ref: ((uuid))
  const isRef = (line: string) => /\(\([0-9a-fA-F-]{36}\)\)/.test(line);
  // Embed: {{embed ...}} supports both ((uuid)) and [[Page]] and any content; treat as embed if macro appears
  const isEmbed = (line: string) => /\{\{\s*embed\b[^}]*\}\}/i.test(line);
  const isOnlyRef = (line: string) => /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(line);
  const isOnlyEmbed = (line: string) => /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(line);

    const RefLine: React.FC<{ line: string }> = ({ line }) => {
    const uuidMatch = line.match(/[0-9a-fA-F-]{36}/);
    const [preview, setPreview] = useState<string>('');
    useEffect(() => {
      let mounted = true;
      (async () => {
        if (folderMode) return; // Skip fetching in folder mode
        if (uuidMatch) {
          try {
            if ((window as any).__graphSieveDetachedMode) { return; }
            const blk = await logseq.Editor.getBlock(uuidMatch[0]);
            if (blk && mounted) {
              const first = (blk.content || '').split('\n')[0] || '';
              setPreview(first);
            }
          } catch { /* ignore */ }
        } else {
          const pageMatch = line.match(/\[\[([^\]]+)\]\]/);
          if (pageMatch && mounted) setPreview(pageMatch[1]);
        }
      })();
      return () => { mounted = false; };
    }, []);
      if (folderMode) return <></>; // Entire ref line removed in folder mode
      const isE = isEmbed(line);
      return (
        <div className={'ls-block-line ref ' + (isE ? 'embed' : 'reference')}>
          {isE ? '[embed] ' : '[ref] '}
          <span className='ref-text'>{preview}</span>
        </div>
      );
  };

  return (
    <ul className='ls-block-list'>
  {blocks.map((b, i) => {
  const text = sanitize(b.content);
  let rawLines = (b.content ?? '').split('\n');
  // Always exclude forced hidden property lines
  rawLines = rawLines.filter(line => !isForcedHiddenPropLine(line, alwaysHideKeys));
        // Apply filters to determine if this block has any visible line after hiding props/refs-only and empties
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
                // Skip forced hidden property lines in any case
                if (isForcedHiddenPropLine(ln, alwaysHideKeys)) return null;
                // Remove artifact lines like '- -' (double dash only)
                if (/^\s*-\s*-\s*$/.test(ln)) return null;
                const only = isOnlyRef(ln) || isOnlyEmbed(ln);
                if ((isRef(ln) || isEmbed(ln))) {
                  if (hideReferences && only) return null;
                  if (only) return <RefLine key={idx} line={ln} />
                }
                // Folder mode: drop lines that are just a lone '-'
                if (folderMode && /^\s*-\s*$/.test(ln)) return null;
                let processedLine = ln;
                if (removeStrings && removeStrings.length) {
                  for (const rs of removeStrings) if (rs) processedLine = processedLine.split(rs).join('');
                }
                if (hideQueries && /\{\{\s*query\b/i.test(processedLine)) return null;
                // IMPORTANT: Bracket stripping for [[Page]] is handled inside renderLine after link generation so that links remain clickable even when stripping.
                if (folderMode) {
                  // In folder mode, remove inline ref/embed tokens entirely from the line content
                  let processed = processedLine
                    // Remove inline block refs ((uuid))
                    .replace(/\(\([0-9a-fA-F-]{36}\)\)/g, '')
                    // Remove inline embed block {{embed ((uuid))}}
                    .replace(/\{\{\s*embed\s*\(\([0-9a-fA-F-]{36}\)\)\s*\}\}/gi, '')
                    // Remove inline embed page {{embed [[Page]]}}
                    .replace(/\{\{\s*embed\s*\[\[[^\]]+\]\]\s*\}\}/gi, '')
                    .replace(/\s+/g, ' ') // collapse whitespace
                    .trim();
                  if (normalizeTasks) processed = normalizeTaskLinesLocal(processed, true);
                  if (processed.length === 0) return null; // drop line if becomes empty
                  return renderLine(processed, idx);
                }
                if (processedLine.trim().length === 0) return null;
                const normalized = normalizeTasks ? normalizeTaskLinesLocal(processedLine, true) : processedLine;
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


// 旧インラインのテキスト処理ロジックは utils/blockText へ移動

// InfoView was removed with the Info panel; assets are now surfaced inline when needed.
