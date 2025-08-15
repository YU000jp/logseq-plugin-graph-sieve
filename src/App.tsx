import { logger } from './logger'; // logger.tsからロガーをインポート
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { Box } from './db';
import './App.css'
import { useUiTypography } from './hooks/useUiTypography';
import { useAutoScrollActiveTab } from './hooks/useAutoScrollActiveTab';
import { useTileGridMeasure } from './hooks/useTileGridMeasure';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
// block text utilities are now used inside PreviewPane; no direct use here
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, IconButton, InputAdornment, TextField, Tooltip, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { Clear } from '@mui/icons-material';
import SettingsIcon from '@mui/icons-material/Settings';
import { encodeLogseqFileName, getSummary, getSummaryFromRawText, parseOperation, decodeLogseqFileName } from './utils';
import { getPageBlocksTreeSafe } from './services/queryService';
import { rebuildDatabase } from './services/rebuildService';
import { boxService } from './services/boxService';
// query services are used within rebuildService
import { getString, setString, getBoolean, setBoolean, getNumber, setNumber, remove as lsRemove } from './utils/storage';
import type { MarkdownOrOrg, FileChanges } from './types';
import CardList from './components/CardList';
import { displayTitle as displayTitleUtil, journalDayWeek as journalDayWeekUtil, isJournalName as isJournalNameUtil } from './utils/journal';
import PreviewTabs from './components/PreviewTabs';
import PreviewPane from './components/PreviewPane';

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
  const [journalDatePattern, setJournalDatePattern] = useState<string>(() => getString('journalDatePattern', 'yyyy/MM/dd'));
  useEffect(()=>{ setString('journalDatePattern', journalDatePattern); }, [journalDatePattern]);
  // ジャーナルリンクのパースは自動判定へ統一（個別フォーマット設定は廃止）
  // グローバル設定（現在はプレースホルダ）
  const [globalSettingsOpen, setGlobalSettingsOpen] = useState(false);
  // ===== UI フォント設定 (再導入) =====
  const [uiFontSize, setUiFontSize] = useState<number>(() => getNumber('uiFontSize', 13));
  const [uiFontFamily, setUiFontFamily] = useState<string>(() => getString('uiFontFamily', ''));
  const [uiLineHeight, setUiLineHeight] = useState<number>(() => Number(getString('uiLineHeight', '1.5')) || 1.5);
  const [uiFontWeight, setUiFontWeight] = useState<number>(() => getNumber('uiFontWeight', 400));
  useEffect(()=>{ setNumber('uiFontSize', uiFontSize); },[uiFontSize]);
  useEffect(()=>{ setString('uiFontFamily', uiFontFamily); },[uiFontFamily]);
  useEffect(()=>{ setString('uiLineHeight', String(uiLineHeight)); },[uiLineHeight]);
  useEffect(()=>{ setNumber('uiFontWeight', uiFontWeight); },[uiFontWeight]);
  // Google Fonts 自動読み込み + 動的スタイル注入
  useUiTypography(uiFontFamily, uiFontSize, uiLineHeight, uiFontWeight);
  const resetUiFont = () => { setUiFontSize(13); setUiFontFamily(''); setUiLineHeight(1.5); setUiFontWeight(400); };
  const [preferredFormat, setPreferredFormat] = useState<MarkdownOrOrg>('markdown');
  const [loading, setLoading] = useState<boolean>(true);
  // カード再構築中ロック用
  const [cardsUpdating, setCardsUpdating] = useState<boolean>(false);
  const rebuildTokenRef = useRef<number>(0);
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
  // 段階的ロード用の上限（スクロール連動なしで徐々に拡張し最終的に全件へ）
  const [maxBoxNumber, setMaxBoxNumber] = useState<number>(100);
  // Exclude journals トグルは廃止
  // 自動デタッチモード: Logseq が現在開いているグラフとプラグインで扱うグラフが異なる場合 true
  const [detachedMode, setDetachedMode] = useState<boolean>(false);
  const [logseqCurrentGraph, setLogseqCurrentGraph] = useState<string>('');
  // 明示的モード: Logseq既存グラフ or フォルダ(fs_)
  const [graphMode, setGraphMode] = useState<'logseq' | 'folder'>(() => (getString('graphMode', 'logseq') === 'folder' ? 'folder' : 'logseq'));
  // モード選択ダイアログは常に最初に表示（保存値があっても再選択させる）
  const [modeChosen, setModeChosen] = useState<boolean>(false);
  // Sidebar preview sessions (multi-preview)
  type PreviewTab = 'content' | 'nomark' | 'outline' | 'raw-custom';
  type Preview = { box: Box; blocks: any[] | null; loading: boolean; tab: PreviewTab; pinned: boolean; createdAt: number };
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(-1);
  const [maxPreviewTabs, setMaxPreviewTabs] = useState<number>(() => getNumber('maxPreviewTabs', 10) || 10);
  useEffect(() => { setNumber('maxPreviewTabs', maxPreviewTabs); }, [maxPreviewTabs]);
  const [hideProperties, setHideProperties] = useState<boolean>(() => getBoolean('hideProperties', true));
  // Refs/embeds は常に非表示 (トグル廃止) - 呼び出し側では true を直接渡す
  // [[Page]] 括弧だけ除去トグル（デフォルトON）
  const [stripPageBrackets, setStripPageBrackets] = useState<boolean>(() => getBoolean('stripPageBrackets', true));
  // Page refs 自体を非表示 (行から除去) （デフォルトOFF）
  const [hidePageRefs, setHidePageRefs] = useState<boolean>(() => {
    const v = getString('hidePageRefs', '');
    if (v !== '') return v === 'true';
    const legacy = getString('removePageRefs', '');
    if (legacy === 'true') {
      lsRemove('removePageRefs');
      return false;
    }
    return false;
  });
  // クエリ ({{query ...) を隠すトグル（デフォルトOFF）
  const [hideQueries, setHideQueries] = useState<boolean>(() => getBoolean('hideQueries', false));
  // RAWタブ: アウトライン(概要)とフルソース切替
  // rawFullMode 廃止: 常に SUMMARY スタイル (旧 RawCustomView)
  // Option: always hide specific property keys (comma-separated), persisted in localStorage
  const [alwaysHidePropKeys, setAlwaysHidePropKeys] = useState<string>(() => getString('alwaysHideProps', ''));
  const alwaysHideKeys = useMemo(() => {
    return alwaysHidePropKeys
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  }, [alwaysHidePropKeys]);
  // 特定文字列を本文から除去 (カンマ区切りそのまま / 大文字小文字区別)
  const [removeStringsRaw, setRemoveStringsRaw] = useState<string>(() => getString('removeStrings', ''));
  const removeStrings = useMemo(() => removeStringsRaw.split(',').filter(s => s.length > 0), [removeStringsRaw]);
  // Logseq マクロ除去トグル
  const [removeMacros, setRemoveMacros] = useState<boolean>(() => getBoolean('removeMacros', false));
  useEffect(()=>{ setBoolean('removeMacros', removeMacros); }, [removeMacros]);
  // タスクステータス正規化トグル
  const [normalizeTasks, setNormalizeTasks] = useState<boolean>(() => getBoolean('normalizeTasks', false));
  useEffect(()=>{ setBoolean('normalizeTasks', normalizeTasks); }, [normalizeTasks]);
  // サイドバー設定表示トグル（Hide properties 等をまとめて隠す）
  const [showSidebarSettings, setShowSidebarSettings] = useState<boolean>(() => getBoolean('showSidebarSettings', false));
  useEffect(() => { setBoolean('showSidebarSettings', showSidebarSettings); }, [showSidebarSettings]);
  // removed copy-hover state: handled inside PreviewPane

  // (Create Page dialog removed)

  // collapsed プロパティ行除去は既に isForcedHiddenPropLine で対応 (key === 'collapsed') されているが、念のため本文再構築時にも除外

  // normalize/copy/macro handling moved into PreviewPane


  // Ensure the active preview tab is visible in the global tabs scroll area
  useAutoScrollActiveTab([previews, activePreviewIndex]);

  const { t } = useTranslation();
  useEffect(() => { setBoolean('hideProperties', hideProperties); }, [hideProperties]);
  // hideRefs: 常時 true なので永続化不要（旧キーは削除してクリーンアップ）
  useEffect(() => { lsRemove('hideRefs'); }, []);
  // removeBlankLines 永続化不要（常に true）
  useEffect(() => { setBoolean('stripPageBrackets', stripPageBrackets); }, [stripPageBrackets]);
  useEffect(() => { setBoolean('hidePageRefs', hidePageRefs); }, [hidePageRefs]);
  useEffect(() => { setBoolean('hideQueries', hideQueries); }, [hideQueries]);
  useEffect(() => { setString('removeStrings', removeStringsRaw); }, [removeStringsRaw]);
  // detachedMode は自動判定なので保存しない
  useEffect(() => { if (modeChosen) setString('graphMode', graphMode); }, [graphMode, modeChosen]);
  useEffect(() => {
    if (!modeChosen) return;
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
  }, [modeChosen, currentGraph, graphMode]);

  // UI 表示時（ツールバーから開かれたとき等）は毎回モード選択から開始する
  useEffect(() => {
    const handler = ({ visible }: any) => {
      if (visible) {
        setModeChosen(false);
      }
    };
    logseq.on('ui:visible:changed', handler);
    return () => {
      try { (logseq as any).off && (logseq as any).off('ui:visible:changed', handler); } catch { /* ignore */ }
    };
  }, []);

  // graphMode が logseq に戻った時 currentGraph を即同期
  useEffect(() => {
    if (!modeChosen) return;
    if (graphMode === 'logseq') {
      (async () => {
        try {
          const { currentGraph: cg } = await logseq.App.getUserConfigs();
          if (cg) setCurrentGraph(cg);
        } catch {/* ignore */}
      })();
    }
  }, [modeChosen, graphMode]);

  // 起動時: folderモード復元だが DirectoryHandle が無い場合は logseq に自動復帰
  useEffect(() => {
    if (!modeChosen) return;
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
          setString('graphMode', 'logseq');
        })();
      }
    }
  }, [modeChosen, graphMode, currentGraph, currentDirHandle]);

  // detachedMode のグローバル共有（App 以外に定義された補助レンダリング関数で参照）
  useEffect(() => {
    try { (window as any).__graphSieveDetachedMode = detachedMode; } catch { /* ignore */ }
  }, [detachedMode]);
  // excludeJournals 永続化は廃止
  // モード切替時にタブ / プレビューを全て閉じる
  useEffect(() => {
    setPreviews([]);
    setActivePreviewIndex(-1);
  }, [graphMode]);

  // フェイルセーフの強制上書きは廃止（段階的拡張で対処）

  const cardboxes = useLiveQuery(
    () => {
      if (!modeChosen) return Promise.resolve([] as Box[]);
      if (graphMode === 'folder') {
        return (async () => {
          const all = await boxService.allByGraph(currentGraph);
          // 時刻降順で並べ、現在の段階的上限で切る（後続エフェクトで自動拡張）
          return all.sort((a,b)=> b.time - a.time).slice(0, maxBoxNumber);
        })();
      }
      // Logseq グラフ: 時刻降順で現在上限まで（後続エフェクトで自動拡張）
      if (detachedMode) return boxService.recentAll(maxBoxNumber);
      return boxService.recent(currentGraph, maxBoxNumber);
    },
    [modeChosen, currentGraph, maxBoxNumber, detachedMode, graphMode]
  );
  
  // モードやグラフ変更時に再構築をトリガー（ロック/キャンセルで競合回避）
  useEffect(() => {
    if (!modeChosen || !currentGraph) return;
    (async () => { try { await rebuildDB(); } catch { /* ignore */ } })();
  }, [modeChosen, graphMode, currentGraph]);
  
  // スクロール連動は廃止済み。ここでは測定のみ。
  useTileGridMeasure({
    tileRef,
    tileGridHeight,
    measuredRowHeightRef,
    tileColumnSize,
    setTileColumnSize,
    tileRowSize,
  setTileRowSize,
  });

  // メインカードを段階的に拡張ロード（UI 負荷を抑えつつ最終的に全件到達）
  const expandScheduledRef = useRef(false);
  useEffect(() => {
    if (!cardboxes) return;
    // 既に全体が上限未満なら（= これ以上増えない）終了
    if (cardboxes.length < maxBoxNumber) return;
    // 多重スケジュール抑止
    if (expandScheduledRef.current) return;
    const perScreen = Math.max(1, tileColumnSize * tileRowSize);
    const chunk = Math.max(100, perScreen * 5); // 画面5枚分 or 最低100件ずつ
    const next = maxBoxNumber + chunk;
    expandScheduledRef.current = true;
    const schedule = (cb: () => void) => {
      const ric = (window as any).requestIdleCallback as (fn: Function, opts?: any) => number;
      if (typeof ric === 'function') {
        return ric(() => cb(), { timeout: 1000 });
      }
      return window.setTimeout(cb, 150);
    };
    const id = schedule(() => {
      setMaxBoxNumber(next);
      expandScheduledRef.current = false;
    });
    return () => {
      // setTimeout のみキャンセル対象
      if (typeof id === 'number') try { clearTimeout(id as unknown as number); } catch {}
    };
  }, [cardboxes?.length, tileColumnSize, tileRowSize, maxBoxNumber]);

  // Global ESC handling is included in keyboard navigation hook

  // computeRowHeight は useTileGridMeasure に含めた

  useEffect(() => {
    if (!modeChosen || graphMode !== 'logseq') return;
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
  }, [modeChosen, graphMode]);

  const rebuildDB = useCallback(async () => {
    await rebuildDatabase({
      currentGraph,
      currentDirHandle,
      journalsDirHandle,
      preferredFormat,
      setLoading,
      setCardsUpdating,
      rebuildTokenRef,
      // 調整可能なバッチ設定（必要に応じて変更可）
      batchSize: 100,
      batchSleepMs: 300,
    });
  }, [currentGraph, currentDirHandle, journalsDirHandle, preferredFormat]);

  // excludeJournals 変更に伴う自動 Rebuild は廃止

  useEffect(() => { void rebuildDB(); }, [rebuildDB]);

  useEffect(() => {
    if (!modeChosen) return;
    const onFileChanged = async (changes: FileChanges) => {
      const [operation, originalName] = parseOperation(changes);

      // Ignore create event because the file is not created yet.
      if (operation == 'modified' || operation == 'delete') {
        const updatedTime = new Date().getTime();
        logger.debug(`${operation}, ${originalName}, ${updatedTime}`);

        // A trailing slash in the title cannot be recovered from the file name. 
        // This is because they are removed during encoding.
        if (operation === 'modified') {
          const blocks = await getPageBlocksTreeSafe(originalName);
          if (!blocks) return;

          const [summary, image] = getSummary(blocks);

          if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
            const box = await boxService.get([currentGraph, originalName]);
            if (box) {
              await boxService.update([currentGraph, originalName], {
                time: updatedTime,
                summary,
                image,
              });
            } else {
              // create
              const page = await logseq.Editor.getPage(originalName);
              if (page) {
        await boxService.upsert({
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
      await boxService.remove([currentGraph, originalName]);
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
  }, [modeChosen, currentGraph]);

  // キーボードナビゲーションのフックは、依存（visibleMainBoxes/openInSidebar）定義以降に呼ぶ

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
  const attemptFetchBlocks = async (nm: string) => { tried.push(nm); return await getPageBlocksTreeSafe(nm); };
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
  setString(key, JSON.stringify(payload));
    } catch {/* ignore */}
  }, [previews, graphMode]);

  // Restore pinned tabs when mode changes or when currentGraph changes (only if no previews currently shown)
  useEffect(() => {
    (async () => {
      if (previews.length > 0) return; // only auto-restore when empty
      let list: Array<{ graph: string; name: string }>; let raw: string | null = null;
  try { raw = getString('pinnedTabs_' + graphMode, ''); } catch {/* ignore */}
      if (!raw) return;
      try { list = JSON.parse(raw) || []; } catch { return; }
      if (!Array.isArray(list) || list.length === 0) return;
      const restored: Preview[] = [];
      for (const item of list) {
        if (!item || !item.graph || !item.name) continue;
        try {
          const box = await boxService.get([item.graph, item.name]);
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
  const boxes = await boxService.allByGraph(currentGraph);
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
          const boxes = await boxService.allByGraph(currentGraph);
          const siblings = boxes
            .filter(b => /^(?:journals\/)?\d{4}[_-]?\d{2}[_-]?\d{2}$/.test(b.name))
            .filter(b => b.name !== name && b.name.startsWith(`${y}_${m}`))
            .sort((a,b)=> b.time - a.time)
            .slice(0, 60);
          setSubpages(siblings);
          setSubpagesDeeper(false);
          return;
        }
  const items = (await boxService.allByGraph(currentGraph)).filter(b => b.name.startsWith(name + '/'));
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
  const allFav = await boxService.favoritesByGraph(currentGraph);
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
  const favs = await boxService.favoritesByGraph(currentGraph);
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
  await boxService.removeByGraph(syntheticId);
    setCurrentGraph(syntheticId);
  setCurrentDirHandle(pagesHandle!);
    setGraphMode('folder');
  }, [currentGraph, t]);

  // 初回モード選択ダイアログのハンドラ
  const chooseLogseqMode = useCallback(async () => {
    setModeChosen(true);
    setGraphMode('logseq');
    try {
      const { currentGraph, preferredDateFormat, preferredLanguage, preferredFormat } = await logseq.App.getUserConfigs();
      setCurrentGraph(currentGraph);
      setPreferredDateFormat(preferredDateFormat);
      setPreferredFormat(preferredFormat);
      i18n.changeLanguage(preferredLanguage);
    } catch {/* ignore */}
  }, []);

  const chooseFolderMode = useCallback(async () => {
    try {
      await openDirectoryPicker();
      setModeChosen(true);
    } catch {/* user cancelled or failed; keep dialog open */}
  }, [openDirectoryPicker]);

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
  await boxService.update([box.graph, box.name], { archived: next });
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
    await boxService.update([box.graph, box.name], { favorite: next });
      // reflect in previews state immediately
      setPreviews(prev => prev.map(p => (
        p.box.graph === box.graph && p.box.name === box.name
          ? { ...p, box: { ...p.box, favorite: next } }
          : p
      )));
      // refresh favorites list
  const favs = await boxService.favoritesByGraph(currentGraph);
  setFavorites(favs.slice(0, 50));
  setLeftFavorites(favs.slice(0, 100));
    } catch (e) {
      console.error('Failed to update favorite flag', e);
    }
  }, [currentGraph]);

  const displayTitle = (name: string) => displayTitleUtil(name, graphMode, journalDatePattern);
  const journalDayWeek = (name: string) => (isJournalName(name) ? journalDayWeekUtil(name) : displayTitle(name));

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
  const isJournalName = (name: string) => isJournalNameUtil(name);

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
  useEffect(() => { setBoolean('collapseJournals', collapseJournals); }, [collapseJournals]);
  useEffect(() => { const v = getString('collapseJournals', ''); if (v !== '') setCollapseJournals(v === 'true'); }, []);
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

  // メイン一覧は常に非ジャーナルのみ（ジャーナルは下部セクションへ）。
  const visibleMainBoxes = useMemo(() => {
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
    // 除外解除: サマリ有無でのフィルタを廃止し、名称一致のみで表示
    return nonJournalBoxes.filter(b => matchName(b));
  }, [nonJournalBoxes, pageName]);

  // 全体カウント: 空サマリ ('' だけ / '-' だけ) を除外し Journals とその他を分離
  const nonJournalCount = visibleMainBoxes.length;
  const journalCount = useMemo(() => {
    const hasNonTrivialSummary = (box?: Box) => !!box && (box.summary || []).some(l => { const t=(l||'').trim(); return t && t !== '-'; });
    return journalBoxes.filter(b => hasNonTrivialSummary(b)).length;
  }, [journalBoxes]);

  const boxElements = (
    <CardList
      items={visibleMainBoxes}
      currentGraph={currentGraph}
      preferredDateFormat={preferredDateFormat}
      onClick={boxOnClick}
      displayNameFor={(b)=>displayTitle(b.name)}
      keyPrefix='main'
      wrapper={false}
      isSelected={(_, idx)=> selectedBox === idx}
    />
  );

  // Keyboard navigation over the tile grid
  useKeyboardNavigation({
    loading: loading || cardsUpdating,
    tileRef,
    selectedBoxRef,
    setSelectedBox,
    visibleMainBoxes: visibleMainBoxes as any,
    openInSidebar: openInSidebar as any,
  });

  // Open a page by name in a new/activated preview tab
  const openPageInPreviewByName = useCallback(async (name: string) => {
    try {
  const found = await boxService.get([currentGraph, name]);
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
  try { await boxService.upsert(box); } catch {/* ignore */}
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
      {/* 初回モード選択ダイアログ */}
      <Dialog open={!modeChosen} onClose={()=>{}} maxWidth='xs' fullWidth>
        <DialogTitle>{t('mode-choose-title')}</DialogTitle>
        <DialogContent dividers>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>{t('mode-choose-desc')}</div>
            <div style={{fontSize:12,opacity:.75}}>{t('mode-choose-logseq-desc')}</div>
            <div style={{fontSize:12,opacity:.75}}>{t('mode-choose-folder-desc')}</div>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={chooseLogseqMode} variant='outlined'>{t('mode-choose-logseq-btn')}</Button>
          <Button onClick={chooseFolderMode} variant='contained'>{t('mode-choose-folder-btn')}</Button>
        </DialogActions>
      </Dialog>
      {modeChosen && cardsUpdating && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.05)', zIndex: 9999, cursor: 'progress' }}>
          <div style={{ position:'absolute', top:'12px', right:'12px', padding:'6px 10px', background:'#fff', border:'1px solid #ddd', borderRadius:6, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', fontSize:12 }}>
            Updating cards...
          </div>
        </div>
      )}
      {modeChosen && (
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
          {/* Exclude journals トグルは廃止 */}
          <Clear className='clear-btn' onClick={() => logseq.hideMainUI({ restoreEditingCursor: true })} style={{ cursor: 'pointer', float: 'right', marginTop: 10, marginRight: 24 }} />
        </div>
  </div>
  )}
  {modeChosen && (
  <PreviewTabs
    previews={previews as any}
    activeIndex={activePreviewIndex}
    onActivate={setActivePreviewIndex}
    onTogglePin={(idx) => setPreviews(prev => prev.map((pp, i) => i === idx ? { ...pp, pinned: !pp.pinned } : pp))}
    onClose={closePreviewAt}
    onCloseAll={() => { setPreviews([]); setActivePreviewIndex(-1); }}
    maxPreviewTabs={maxPreviewTabs}
    onChangeMax={(n) => setMaxPreviewTabs(n)}
    displayTitle={displayTitle}
    t={t}
  />
  )}
  {modeChosen && (
  <>
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
              {/* Journal link format (parse) 設定は廃止（自動判定） */}
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
            {leftFavorites.length === 0 ? (
              <div className='sidebar-empty'>{t('no-content')}</div>
            ) : (
              <CardList
                items={leftFavorites}
                currentGraph={currentGraph}
                preferredDateFormat={preferredDateFormat}
                onClick={boxOnClick}
                displayNameFor={(b) => displayTitle(b.name)}
                keyPrefix='left-fav'
              />
            )}
          </div>
          {(journalBoxes.length > 0) && (
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
                  <CardList
                    items={g.items}
                    currentGraph={currentGraph}
                    preferredDateFormat={preferredDateFormat}
                    onClick={boxOnClick}
                    displayNameFor={(j) => journalDayWeek(j.name)}
                    keyPrefix='journal'
                    gridClassName='journals-grid'
                  />
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
            <PreviewPane
              box={sidebarBox}
              blocks={sidebarBlocks}
              loading={sidebarLoading}
              tab={sidebarTab}
              onSetTab={(tab) => setActiveTab(tab)}
              displayTitle={displayTitle}
              onToggleFavorite={toggleFavorite}
              onToggleArchive={toggleArchive}
              onOpenPage={openPageInPreviewByName}
              onCloseActive={closeActivePreview}

              showSettings={showSidebarSettings}
              onToggleSettings={() => setShowSidebarSettings(s => !s)}
              hideProperties={hideProperties}
              setHideProperties={setHideProperties}
              stripPageBrackets={stripPageBrackets}
              setStripPageBrackets={setStripPageBrackets}
              hidePageRefs={hidePageRefs}
              setHidePageRefs={setHidePageRefs}
              hideQueries={hideQueries}
              setHideQueries={setHideQueries}
              removeMacros={removeMacros}
              setRemoveMacros={setRemoveMacros}
              normalizeTasks={normalizeTasks}
              setNormalizeTasks={setNormalizeTasks}
              alwaysHidePropKeys={alwaysHidePropKeys}
              setAlwaysHidePropKeys={setAlwaysHidePropKeys}
              removeStringsRaw={removeStringsRaw}
              setRemoveStringsRaw={setRemoveStringsRaw}
              alwaysHideKeys={alwaysHideKeys}
              removeStrings={removeStrings}

              currentGraph={currentGraph}
              preferredDateFormat={preferredDateFormat}
              assetsDirHandle={assetsDirHandle}
              detachedMode={detachedMode}

              subpages={subpages}
              subpagesDeeper={subpagesDeeper}
              related={related}
              onClickBox={(b) => boxOnClick(b as any, { nativeEvent: {} } as any)}

              hoveredSidePane={hoveredSidePane}
              setHoveredSidePane={setHoveredSidePane}
            />
          ) : <div className='sidebar-placeholder'>{t('sidebar-placeholder')}</div>}
        </aside>
    </div>
  <div className='footer'>{t('footer')}</div>
  </>
  )}
  {/* (Create Page Dialog removed) */}
      
    </>
  );
}

export default App

