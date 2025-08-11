import { logger } from './logger'; // logger.tsからロガーをインポート
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { db, Box } from './db';
import './App.css'
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, IconButton, InputAdornment, TextField, Dialog, DialogActions, DialogContent, DialogTitle, Switch, FormControlLabel, Tooltip } from '@mui/material';
import { Clear, ContentCopy } from '@mui/icons-material';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { encodeLogseqFileName, getLastUpdatedTime, getSummary, parseOperation, sleep } from './utils';
import type { MarkdownOrOrg, PrimaryKey, SearchResultPage, FileChanges } from './types';
import BoxCard from './components/BoxCard';
import SubpagesSection from './components/SubpagesSection';

const dirHandles: { [graphName: string]: FileSystemDirectoryHandle } = {};

const tileGridHeight = 160; // height of a grid row

function App() {
  const [currentDirHandle, setCurrentDirHandle] = useState<FileSystemDirectoryHandle>();
  const [currentGraph, setCurrentGraph] = useState<string>('');
  const [preferredDateFormat, setPreferredDateFormat] = useState<string>('');
  const [preferredFormat, setPreferredFormat] = useState<MarkdownOrOrg>('markdown');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBox, setSelectedBox] = useState<number>(0);
  const [open, setOpen] = useState<boolean>(false);
  const [filteredPages, setFilteredPages] = useState<PrimaryKey[]>([]);
  const [tag, setTag] = useState<string>('');
  const [pageName, setPageName] = useState<string>('');
  const tileRef = useRef<HTMLDivElement | null>(null);
  const tagInputFieldRef = useRef<HTMLInputElement | null>(null);
  //  const appRef = useRef<HTMLDivElement | null>(null);
  const [tileColumnSize, setTileColumnSize] = useState<number>(0);
  const [tileRowSize, setTileRowSize] = useState<number>(0);
  const [maxBoxNumber, setMaxBoxNumber] = useState<number>(0);
  const [totalCardNumber, setTotalCardNumber] = useState<number>(0);
  // Sidebar preview sessions (multi-preview)
  type PreviewTab = 'content' | 'nomark' | 'outline';
  type Preview = { box: Box; blocks: any[] | null; loading: boolean; tab: PreviewTab };
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number>(-1);
  const [hoverCloseIndex, setHoverCloseIndex] = useState<number | null>(null);
  const [hideProperties, setHideProperties] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('hideProperties');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  const [hideRefs, setHideRefs] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('hideRefs');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
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
  useEffect(() => { try { localStorage.setItem('hideRefs', String(hideRefs)); } catch {} }, [hideRefs]);

  const cardboxes = useLiveQuery(
    () => {
      if (filteredPages.length === 0) {
        return db.box
          .orderBy('time')
          .filter(box => box.graph === currentGraph)
          .reverse()
          .limit(maxBoxNumber)
          .toArray()
      } else {
        return db.box
          .where(':id')
          .anyOf(filteredPages)
          .reverse()
          .sortBy('time')
      }
    }
    , [currentGraph, filteredPages, maxBoxNumber]);
  
  // タイルスクロールに応じてページング上限を広げる
  useEffect(() => {
    const handleScroll = () => {
      // logger.debug('Scrolled to: ' + Math.floor(tileRef.current!.scrollTop / pagenationScrollHeight));

      const loadScreensAhead = 3;
      const loadRowsAhead = loadScreensAhead * tileRowSize;
      const loadRowsByScroll = (Math.floor(Math.floor(tileRef.current!.scrollTop / tileGridHeight) / loadRowsAhead) + 1) * loadRowsAhead;
      const limit = tileColumnSize * (tileRowSize + loadRowsByScroll);

      setMaxBoxNumber(current => current < limit ? limit : current);
    };

    const tileElement = tileRef.current;
    if (tileElement) {
      tileElement.addEventListener('scroll', handleScroll);
    }

    // コンポーネントのアンマウント時にイベントリスナーを削除
    return () => {
      if (tileElement) {
        tileElement.removeEventListener('scroll', handleScroll);
      }
    };
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
  }, [filteredPages]);

  useEffect(() => {
    tileRef.current!.style.gridAutoRows = `${tileGridHeight}px`;

    const handleResize = () => {
      const gridStyles = window.getComputedStyle(tileRef.current!);
      const columnSize = gridStyles.gridTemplateColumns.split(' ').length;
      setTileColumnSize(columnSize);

      // const rowSize = gridStyles.gridTemplateRows.split(' ').length; // This gets all rows in tile grid
      const rowsInAScreen = Math.ceil(tileRef.current!.offsetHeight / tileGridHeight);

      setTileRowSize(rowsInAScreen);

      // logger.debug(columnSize, rowsInAScreen);

      const scrollRow = Math.floor(tileRef.current!.scrollTop / tileGridHeight) + 1;
      const limit = columnSize * (rowsInAScreen + scrollRow);

      setMaxBoxNumber(current => current < limit ? limit : current);
    };
    handleResize(); // call once after render tile
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);



  useEffect(() => {
    // タグ/ページ名フィルタを統合して適用（両方入力時は積集合）
    const filter = async (tagQuery: string, nameQuery: string) => {
      setSelectedBox(0);

      const tagQ = tagQuery.trim();
      const nameQ = nameQuery.trim();

      if (tagQ === '' && nameQ === '') {
        setFilteredPages([]);
        return;
      }

      let tagPages: string[] | null = null;
      if (tagQ !== '') {
        const pageEntries: SearchResultPage[] = await logseq.DB.datascriptQuery(`
        [:find ?name
          :where
          [?t :block/name ?namePattern]
          [(clojure.string/include? ?namePattern "${tagQ}")]
          [?p :block/tags ?t]
          (or
            [?p :block/original-name ?name]
            [?p :block/title ?name])]
        `);
        tagPages = pageEntries.map(entry => entry[0]);
      }

      let namePages: string[] | null = null;
      if (nameQ !== '') {
        // Dexieに登録されているページ名から部分一致（大文字小文字を無視）
        const boxes = await db.box
          .where('graph').equals(currentGraph)
          .toArray();
        const nq = nameQ.toLowerCase();
        namePages = boxes
          .map(b => b.name)
          .filter(n => n.toLowerCase().includes(nq));
      }

      let result: string[] = [];
      if (tagPages && namePages) {
        const nameSet = new Set(namePages);
        result = tagPages.filter(n => nameSet.has(n));
      } else if (tagPages) {
        result = tagPages;
      } else if (namePages) {
        result = namePages;
      }

      if (result.length === 0) {
        setFilteredPages([["", ""]]);
        return;
      }

      setFilteredPages(result.map(name => [currentGraph, name] as PrimaryKey));
    };

    filter(tag, pageName);
  }, [tag, pageName, currentGraph, totalCardNumber]);

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

    db.box.where('graph').equals(currentGraph).count().then(async count => {
      if (count > 0) {
        setLoading(false);
        setTotalCardNumber(count);
      }
      try {
        // Graph の最新ページ情報を取得して Box テーブルを更新
        const { currentGraph: cg } = await logseq.App.getUserConfigs();
        const pages = await logseq.Editor.getAllPages();
        if (!pages) {
          setLoading(false);
          return;
        }

        const promises: Promise<void>[] = [];
        while (pages.length > 0) {
          const page = pages.pop();
          if (page) {
            if (page['journal?']) continue;

            const promise = (async () => {
              let updatedTime: number | undefined = 0;
              if (currentDirHandle) {
                updatedTime = await getLastUpdatedTime(encodeLogseqFileName(page.originalName), currentDirHandle!, preferredFormat);
              } else {
                // Skip Contents because page.updatedAt of Contents is always wrong.
                if (page.originalName === 'Contents') return;
                updatedTime = page.updatedAt;
              }
              if (!updatedTime) return;
              // Load summary asynchronously
              const blocks = await logseq.Editor.getPageBlocksTree(page.uuid).catch(err => {
                console.error(`Failed to get blocks: ${page.originalName}`);
                console.error(err);
                return null;
              });
              // Quick check for empty page
              if (!blocks || blocks.length === 0) return;
              const [summary, image] = getSummary(blocks);
              // Logseq has many meta pages that has no content. Skip them.
              // Detailed check for empty page
              if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
                await db.box.put({
                  graph: cg,
                  name: page.originalName,
                  uuid: page.uuid,
                  time: updatedTime,
                  summary,
                  image,
                });
              }
            })();
            promises.push(promise);
          }

          const loadingCardNumber = promises.length;
          if (pages.length === 0 || loadingCardNumber >= 100) {
            await Promise.all(promises).catch(err => { console.error(err); });
            promises.splice(0, loadingCardNumber);
            setTotalCardNumber(await db.box.where('graph').equals(cg).count());
            // LiveQuery needs some time to update.
            await sleep(500);
          }
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    });
  }, [currentDirHandle, currentGraph, preferredFormat]);

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
              db.box.update([currentGraph, originalName], {
                time: updatedTime,
                summary,
                image,
              });
            }
            else {
              // create
              const page = await logseq.Editor.getPage(originalName);
              if (page) {
                db.box.put({
                  graph: currentGraph,
                  name: originalName,
                  uuid: page.uuid,
                  time: updatedTime,
                  summary,
                  image,
                }).then(() => {
                  setTotalCardNumber(num => num + 1);
                });
              }
            }
          }
          else {
            // Remove empty page
            logger.debug(`Empty page: ${originalName}`);
            db.box.delete([currentGraph, originalName]).then(() => {
              setTotalCardNumber(num => num > 0 ? num - 1 : 0);
            });
          }
        }
        else if (operation === 'delete') {
          db.box.delete([currentGraph, originalName]).then(() => {
            setTotalCardNumber(num => num > 0 ? num - 1 : 0);
          });
        }
        else {
          logger.debug('Unknown operation: ' + operation);
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
    const handleKeyDown = (e: { key: string; shiftKey: boolean; }) => {
      if (loading) return;
      // If the focus or selection is inside the sidebar preview, don't steal keys
      const sidebarEl = document.getElementById('sidebar');
      const activeEl = document.activeElement as HTMLElement | null;
      const selection = window.getSelection();
      const selectionInsideSidebar = !!selection && !!sidebarEl && selection.anchorNode ? sidebarEl.contains(selection.anchorNode) : false;
      const focusInsideSidebar = !!activeEl && !!sidebarEl && sidebarEl.contains(activeEl);
      if (focusInsideSidebar || selectionInsideSidebar) {
        return;
      }
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
        // Enter: open in plugin sidebar. Shift+Enter: open directly in Logseq
        const boxEl = (document.getElementsByClassName('selectedBox')[0] as HTMLElement);
        if (!boxEl) return;
        const uuid = boxEl.id;
        const card = cardboxes?.find(b => b.uuid === uuid) || null;
        if (e.shiftKey) {
          // Open in Logseq main page directly
          const name = (boxEl.getElementsByClassName('box-title')[0] as HTMLElement)?.innerHTML;
          logseq.App.pushState('page', { name });
          logseq.hideMainUI({ restoreEditingCursor: true });
        } else if (card) {
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
        tagInputFieldRef.current?.focus();
      }

    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loading, cardboxes]);

  const openInSidebar = useCallback(async (box: Box) => {
    // If already opened, activate it
    setPreviews(prev => {
      const idx = prev.findIndex(p => p.box.uuid === box.uuid);
      if (idx >= 0) {
        setActivePreviewIndex(idx);
        return prev;
      }
      // else create placeholder preview and activate
      const next: Preview = { box, blocks: null, loading: true, tab: 'content' };
      const arr = [...prev, next];
      setActivePreviewIndex(arr.length - 1);
      return arr;
    });
    // Load blocks for new/empty session
    try {
      const blocks = await logseq.Editor.getPageBlocksTree(box.uuid).catch(async () => {
        return await logseq.Editor.getPageBlocksTree(box.name);
      });
      setPreviews(prev => {
        const idx = prev.findIndex(p => p.box.uuid === box.uuid);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], blocks: Array.isArray(blocks) ? blocks : [], loading: false };
        return updated;
      });
    } catch (e) {
      console.error(e);
      setPreviews(prev => {
        const idx = prev.findIndex(p => p.box.uuid === box.uuid);
        if (idx < 0) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], blocks: [], loading: false };
        return updated;
      });
    }
  }, []);

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
      if (!hideRefs) setHideRefs(true);
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

  // Bottom section: show related and info together (Backlinks removed)
  const [related, setRelated] = useState<Box[]>([]);
  // Sub pages for fallback when CONTENT has no visible lines
  const [subpages, setSubpages] = useState<Box[]>([]);

  useEffect(() => {
    const loadRelated = async () => {
      const name = sidebarBox?.name;
      if (!name || !currentGraph) { setRelated([]); return; }
      try {
        // 基本の関連候補（名前トークン一致）
        const tokens = name.split(/[\s/]+/).map(s => s.toLowerCase()).filter(s => s.length >= 2);
        const boxes = await db.box.where('graph').equals(currentGraph).toArray();
        let rel = boxes.filter(b => b.name !== name && tokens.some(t => b.name.toLowerCase().includes(t)));

        // CONTENTタブを表示中は、本文内に出現する [[Page]] と一致するものを除外
        if (sidebarTab === 'content' && Array.isArray(sidebarBlocks)) {
          const linked = new Set<string>();
          const visit = (bs: any[]) => {
            for (const b of bs) {
              const raw = stripLogbook(b.content ?? '');
              const lines = raw.split('\n');
              for (const line of lines) {
                const regex = /\[\[([^\]]+)\]\]/g;
                let m: RegExpExecArray | null;
                while ((m = regex.exec(line)) !== null) {
                  linked.add((m[1] || '').toLowerCase());
                }
              }
              if (b.children && b.children.length) visit(b.children);
            }
          };
          visit(sidebarBlocks as any[]);
          if (linked.size > 0) {
            rel = rel.filter(b => !linked.has(b.name.toLowerCase()));
          }
        }

        setRelated(rel.slice(0, 30));
      } catch {
        setRelated([]);
      }
    };
    loadRelated();
  }, [sidebarBox?.name, currentGraph, sidebarTab, sidebarBlocks]);

  // Load sub pages (children under current page path) for fallback view
  useEffect(() => {
    const loadSub = async () => {
      const name = sidebarBox?.name;
      if (!name || !currentGraph) { setSubpages([]); return; }
      try {
        const items = await db.box
          .where('graph').equals(currentGraph)
          .and(b => b.name.startsWith(name + '/'))
          .toArray();
        // Keep only immediate children: parent/child (no further '/')
        const prefix = name + '/';
        const oneLevel = items.filter(b => {
          const rest = b.name.slice(prefix.length);
          return rest.length > 0 && !rest.includes('/');
        });
        setSubpages(oneLevel);
      } catch {
        setSubpages([]);
      }
    };
    loadSub();
  }, [sidebarBox?.name, currentGraph]);

  // (Backlinks removed)

  const openDirectoryPicker = useCallback(async () => {
    const handle = await window.showDirectoryPicker();
    // Cannot get full path of the selected directory because of security reason.
    // Check only the directory name
    if (handle.name === 'pages') {
      dirHandles[currentGraph] = handle;
      await db.box.where('graph').equals(currentGraph).delete();
      setCurrentDirHandle(handle);
      setOpen(false);
      // rebuildDB() is called when currentDirHandle is changed.
    }
    else {
      logseq.UI.showMsg(t('please-select-pages'));
    }
  }, [currentGraph, t]);

  const boxOnClick = async (box: Box, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.nativeEvent.shiftKey) {
      // Shift-click: open directly in Logseq main page
      logseq.App.pushState('page', { name: box.name });
      logseq.hideMainUI({ restoreEditingCursor: true });
    } else {
      // Normal click: open inside plugin sidebar
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

  const boxElements = cardboxes?.map((box: Box, index) => (
    <BoxCard
      key={box.uuid}
      box={box}
      selected={selectedBox === index}
      currentGraph={currentGraph}
      preferredDateFormat={preferredDateFormat}
  onClick={boxOnClick}
    />
  ));

  // Open a page by name in a new/activated preview tab
  const openPageInPreviewByName = useCallback(async (name: string) => {
    try {
      const found = await db.box.get([currentGraph, name]);
      if (found) {
        void openInSidebar(found);
        return;
      }
    } catch { /* ignore dexie errors */ }
    try {
      const page = await logseq.Editor.getPage(name).catch(() => null);
      const box: Box = {
        graph: currentGraph,
        name: page?.originalName || name,
        uuid: page?.uuid || '',
        time: Date.now(),
        summary: [],
        image: '',
      };
      void openInSidebar(box);
    } catch {
      const box: Box = { graph: currentGraph, name, uuid: '', time: Date.now(), summary: [], image: '' };
      void openInSidebar(box);
    }
  }, [currentGraph, openInSidebar]);

  return (
    <>
      <div className='control'>
        <div className='control-left'>
          <Button variant="outlined" tabIndex={-1} style={{ display: loading ? 'none' : 'block', color: "black", float: "left", borderColor: "black", marginLeft: "12px", marginTop: "7px" }} className='rebuild-btn' onClick={async () => {
            if (currentDirHandle) {
              await db.box.where('graph').equals(currentGraph).delete();
              rebuildDB();
            }
            else {
              setOpen(true)
            }
          }}>{t("rebuild")}</Button>
          <Dialog open={open} onClose={() => setOpen(false)}>
            <DialogTitle>{t("rebuild")}</DialogTitle>
            <DialogContent>
              {t("open-pages-btn-label")} ({currentGraph.replace('logseq_local_', '')}/pages)
            </DialogContent>
            <DialogActions>
              <Button variant="outlined" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={openDirectoryPicker} color="primary">{t("open-pages-btn")}</Button>
            </DialogActions>
          </Dialog>
          <div className='loading' style={{ display: loading ? 'block' : 'none' }}>
            {t("loading")}
          </div>
          <div className='card-number'>
            {filteredPages.length === 0 ? totalCardNumber : cardboxes?.length} cards
          </div>
          <TextField id="tag-input" size='small' label={t("filter-by-page-tag")} variant="filled"
            style={{ marginLeft: "12px", marginTop: "1px", float: "left" }}
            value={tag} onChange={e => setTag(e.target.value)}
            inputRef={tagInputFieldRef}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setTag('')}
                    edge="end"
                  >
                    <Clear />
                  </IconButton>
                </InputAdornment>
              ),
              inputProps: {
                tabIndex: 1,
              },
            }}
          />
          <TextField id="page-input" size='small' label={t("filter-by-page-name")} variant="filled"
            style={{ marginLeft: "12px", marginTop: "1px", float: "left" }}
            value={pageName} onChange={e => setPageName(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setPageName('')}
                    edge="end"
                  >
                    <Clear />
                  </IconButton>
                </InputAdornment>
              ),
              inputProps: {
                tabIndex: 1,
              },
            }}
          />
        </div>
        <div className='control-right'>
          <div className='graph-info' title={currentGraph}>
            {t('graph-label')}: {currentGraph ? currentGraph.replace('logseq_local_', '') : ''}
          </div>
          <Clear className='clear-btn' onClick={() => logseq.hideMainUI({ restoreEditingCursor: true })}
            style={{
              cursor: "pointer",
              float: "right",
              marginTop: "10px",
              marginRight: "24px",
            }}
          />
        </div>
      </div >
      {previews.length > 0 && (
        <div className='global-tabs-row'>
          <div className='tabs-actions'>
            <Tooltip title={t('close-all-tabs') || 'Close all tabs'}>
              <IconButton size='small' onClick={() => { setPreviews([]); setActivePreviewIndex(-1); }} aria-label='close-all-tabs'>
                <ClearAllIcon fontSize='small' />
              </IconButton>
            </Tooltip>
          </div>
          <div className='tabs-spacer' />
          <div className='preview-tabs'>
            {previews.map((p, idx) => (
              <span
                key={p.box.uuid}
                className={'preview-tab' + (idx === activePreviewIndex ? ' active' : '') + (hoverCloseIndex === idx ? ' closing' : '')}
              >
                <IconButton
                  size='small'
                  className='tab-close'
                  onMouseEnter={() => setHoverCloseIndex(idx)}
                  onMouseLeave={() => setHoverCloseIndex(null)}
                  onClick={(e) => { e.stopPropagation(); closePreviewAt(idx); }}
                  title={t('close')}
                >
                  <Clear fontSize='inherit' />
                </IconButton>
                <Button size='small' variant={idx === activePreviewIndex ? 'contained' : 'text'} onClick={() => setActivePreviewIndex(idx)} title={p.box.name}>
                  <span className='tab-title-ellipsis'>{p.box.name}</span>
                </Button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className='content'>
        <div id='tile' ref={tileRef} tabIndex={2}>
          {boxElements}
        </div>
        <aside id='sidebar'>
          {sidebarBox ? (
            <div className={'sidebar-inner' + (sidebarBox.archived ? ' archived' : '')}>
              <div className='sidebar-header'>
                <div className='sidebar-title' title={sidebarBox.name}>
                  {(() => {
                    const name = sidebarBox.name || '';
                    const parts = name.split('/').filter(Boolean);
                    const crumbs: React.ReactNode[] = [];
                    for (let i = 0; i < parts.length; i++) {
                      const label = parts[i];
                      const full = parts.slice(0, i + 1).join('/');
                      crumbs.push(
                        <a
                          key={`crumb-${i}`}
                          href='#'
                          className='crumb'
                          onClick={(e) => {
                            e.preventDefault();
                            if ((e as React.MouseEvent).shiftKey) {
                              logseq.App.pushState('page', { name: full });
                              logseq.hideMainUI({ restoreEditingCursor: true });
                            } else {
                              void openPageInPreviewByName(full);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void openPageInPreviewByName(full);
                            }
                          }}
                          tabIndex={0}
                          title={full}
                        >
                          <span className='crumb-text'>{label}</span>
                        </a>
                      );
                      if (i < parts.length - 1) {
                        crumbs.push(<span key={`sep-${i}`} className='sep'> / </span>);
                      }
                    }
                    return <div className='breadcrumb'>{crumbs}</div>;
                  })()}
                </div>
                <div className='sidebar-controls'>
                  <Tooltip title={sidebarBox.archived ? 'Unarchive' : 'Archive'}>
                    <IconButton size='small' onClick={() => toggleArchive(sidebarBox, !sidebarBox.archived)} aria-label='archive-toggle'>
                      {sidebarBox.archived ? <Inventory2Icon fontSize='small' /> : <Inventory2OutlinedIcon fontSize='small' />}
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
      <div className='sidebar-nav'>
                <div className='sidebar-row sidebar-row--tabs'>
                  <div className='sidebar-tabs'>
                    <Button size='small' variant={sidebarTab === 'content' ? 'contained' : 'text'} onClick={() => setActiveTab('content')}>{t('tab-content')}</Button>
                    <Button size='small' variant={sidebarTab === 'nomark' ? 'contained' : 'text'} onClick={() => setActiveTab('nomark')}>{t('tab-no-markdown')}</Button>
        <Button size='small' variant={sidebarTab === 'outline' ? 'contained' : 'text'} onClick={() => setActiveTab('outline')}>{t('tab-raw')}</Button>
                  </div>
                </div>
                <div className='sidebar-row sidebar-row--filters'>
                  <FormControlLabel
                    className='prop-filter'
        disabled={sidebarTab === 'outline'}
                    control={<Switch size='small' checked={hideProperties} onChange={(_, v) => setHideProperties(v)} />}
                    label={t('toggle-hide-properties')}
                  />
                  <FormControlLabel
                    className='prop-filter'
        disabled={sidebarTab === 'outline'}
                    control={<Switch size='small' checked={hideRefs} onChange={(_, v) => setHideRefs(v)} />}
                    label={t('toggle-hide-refs')}
                  />
                </div>
                <div className='sidebar-row sidebar-row--options'>
                  <TextField
                    size='small'
                    label={t('always-hide-props')}
                    placeholder={t('always-hide-props-ph')}
                    value={alwaysHidePropKeys}
        disabled={sidebarTab === 'outline'}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAlwaysHidePropKeys(v);
                      try { localStorage.setItem('alwaysHideProps', v); } catch {}
                    }}
                    InputProps={{
                      inputProps: { spellCheck: false },
                    }}
                    style={{ minWidth: '220px' }}
                  />
                </div>
                <div className='sidebar-row sidebar-row--actions'>
                  <div className='sidebar-actions'>
        <Button size='small'
                      variant='outlined'
                      startIcon={<ContentCopy fontSize='small' />}
      disabled={(sidebarTab !== 'content' && sidebarTab !== 'nomark' && sidebarTab !== 'outline') || sidebarLoading || !(sidebarBlocks && sidebarBlocks.length > 0)}
                      onClick={async () => {
                        if (!sidebarBlocks) return;
      const text = sidebarTab === 'nomark'
        ? blocksToPlainText(sidebarBlocks as BlockNode[], hideProperties, hideRefs, 0, alwaysHideKeys)
        : sidebarTab === 'outline'
        ? outlineTextFromBlocks((sidebarBlocks || []) as BlockNode[])
        : flattenBlocksToText(sidebarBlocks as BlockNode[], hideProperties, hideRefs, 0, alwaysHideKeys);
                        try {
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(text);
                          } else {
                            const ta = document.createElement('textarea');
                            ta.value = text;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                          }
                          logseq.UI.showMsg(t('copied'));
                        } catch (e) {
                          console.error(e);
                          logseq.UI.showMsg(t('copy-failed'));
                        }
                      }}
                    >{t('copy-content')}</Button>
                    <Button size='small' variant='outlined' onClick={() => {
                      if (!sidebarBox) return;
                      logseq.App.pushState('page', { name: sidebarBox.name });
                      logseq.hideMainUI({ restoreEditingCursor: true });
                    }}>{t('open-in-logseq')}</Button>
                    <IconButton size='small' onClick={closeActivePreview} title={t('close')}>
                      <Clear fontSize='small' />
                    </IconButton>
                  </div>
                </div>
              </div>
              <div className='sidebar-body' tabIndex={0}>
                {sidebarLoading ? (
                  <div className='sidebar-loading'>{t('loading-content')}</div>
                ) : sidebarTab === 'content' ? (
                  (() => {
                    const has = hasRenderableContent((sidebarBlocks || []) as BlockNode[], hideProperties, hideRefs, alwaysHideKeys);
                    return (
                      <>
                        {has
                          ? (
                            <BlockList
                              blocks={sidebarBlocks || []}
                              hideProperties={hideProperties}
                              hideReferences={hideRefs}
                              alwaysHideKeys={alwaysHideKeys}
                              currentGraph={currentGraph}
                              onOpenPage={openPageInPreviewByName}
                            />
                          )
                          : (
                            <div className='sidebar-empty'>{t('no-content')}</div>
                          )}
                        <SubpagesSection
                          parentName={sidebarBox?.name || ''}
                          items={subpages}
                          currentGraph={currentGraph}
                          preferredDateFormat={preferredDateFormat}
                          onClick={boxOnClick}
                        />
                      </>
                    );
                  })()
                ) : sidebarTab === 'nomark' ? (
                  <PlainTextView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={hideRefs} alwaysHideKeys={alwaysHideKeys} />
                ) : sidebarTab === 'outline' ? (
                  <OutlineView blocks={(sidebarBlocks || []) as BlockNode[]} />
                ) : null}
              </div>
              <div className='sidebar-section'>
                <div className='section-body'>
                  <div className='section-col related'>
                    <div className='section-title'>{t('related') || 'Related'}</div>
                    {(() => {
                      // Remove items already shown in Sub pages (same graph/name)
                      const subSet = new Set(subpages.map(s => `${s.graph}::${s.name}`));
                      const filtered = related.filter(r => !subSet.has(`${r.graph}::${r.name}`));
                      if (filtered.length === 0) {
                        return <div className='sidebar-empty'>{t('no-content')}</div>;
                      }
                      return (
                        <div className='cards-grid'>
                          {filtered.map((b) => (
                            <BoxCard
                              key={`rel-${b.graph}-${b.name}`}
                              box={b}
                              selected={false}
                              currentGraph={currentGraph}
                              preferredDateFormat={preferredDateFormat}
                              onClick={boxOnClick}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className='sidebar-placeholder'>{t('sidebar-placeholder')}</div>
          )}
        </aside>
      </div>
      <div className='footer'>
        {t("footer")}
      </div>
    </>
  )
}

export default App

// Simple recursive block renderer for sidebar
type BlockNode = {
  content?: string;
  children?: BlockNode[];
};

// Check if any line is renderable under current hide rules
function hasRenderableContent(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, alwaysHideKeys: string[] = []): boolean {
  const check = (bs: BlockNode[]): boolean => {
    for (const b of bs) {
      const raw = stripLogbook(b.content ?? '');
      const lines = raw.split('\n');
      for (const line of lines) {
        const l = line.replace(/\r/g, '');
        if (isForcedHiddenPropLine(l, alwaysHideKeys)) continue;
        if (hideProperties && l.includes(':: ')) continue;
        if (l.trim().length === 0) continue;
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

const BlockList: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[]; currentGraph?: string; onOpenPage?: (name: string) => void }> = ({ blocks, hideProperties, hideReferences, alwaysHideKeys = [], currentGraph, onOpenPage }) => {
  const { t } = useTranslation();
  if (!blocks || blocks.length === 0) return <div className='sidebar-empty'>{t('no-content')}</div>;
  const sanitize = (s?: string) => {
    const raw = stripLogbook(s ?? '');
    // Always remove id::, collapsed:: and user-specified property lines
    const noForced = raw
      .split('\n')
      .filter(line => !isForcedHiddenPropLine(line, alwaysHideKeys))
      .join('\n')
      .trimEnd();
    if (!hideProperties) return noForced;
    return noForced
      .split('\n')
      .filter(line => !line.includes(':: '))
      .join('\n')
      .trimEnd();
  };
  const renderLine = (line: string, idx: number) => {
    // image: markdown ![alt](../assets/xxx.ext){:...} or org [[../assets/xxx.ext]] possibly with title
    const mdImg = line.match(/^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*!\[([^\]]*)\]\((\.\.\/assets\/[^)]+)\)(?:\{\:[^}]*\})?/i);
    const orgImg = line.match(/^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\[\[(\.\.\/assets\/[^\]]+)\](?:\[[^\]]*\])?\]/i);
    const assetPath = (mdImg && mdImg[2]) || (orgImg && orgImg[1]);
    if (assetPath && currentGraph) {
      const src = currentGraph.replace('logseq_local_', '') + '/' + assetPath.replace(/^\.\.\//, '');
      const isPdf = /\.pdf(\?|#|$)/i.test(assetPath);
      if (isPdf) {
        const label = (mdImg && mdImg[1]) || assetPath.split('/').pop() || 'PDF';
        return (
          <div key={idx} className='ls-block-line'>
            <a href={src} target='_blank' rel='noopener noreferrer' className='ls-asset-link pdf' title={label}>📄 {label}</a>
          </div>
        );
      }
      return (
        <div key={idx} className='ls-block-line image'>
          <a href={src} target='_blank' rel='noopener noreferrer' className='ls-img-link'>
            <img src={src} alt={(mdImg && mdImg[1]) || ''} className='ls-img' />
          </a>
        </div>
      );
    }
    // page refs: [[Page Title]] -> make clickable to open in preview tab
    const withLinks: Array<React.ReactNode> = [];
    let lastIndex = 0;
    const regex = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const before = line.slice(lastIndex, m.index);
      if (before) withLinks.push(before);
      const name = m[1];
      // If content looks like a URL, don't treat as page ref here; keep raw for external link pass
      const looksUrl = /(^|\s)([a-zA-Z]+:\/\/|www\.)/.test(name);
      if (looksUrl) {
        withLinks.push(m[0]);
      } else if (onOpenPage) {
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
            [[{name}]]
          </a>
        );
      } else {
        withLinks.push(m[0]);
      }
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < line.length) withLinks.push(line.slice(lastIndex));

    // Convert Markdown [text](url) and Org [[url][text]]/[[url]] links to anchors
    const withMdLinks: Array<React.ReactNode> = [];
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
          const href = next.m[2];
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
          const url = next.m[1];
          const text = next.m[2] || next.m[1];
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
          try {
            const blk = await logseq.Editor.getBlock(uuid);
            if (blk && mounted) {
              const first = (blk.content || '').split('\n')[0] || '';
              setPreview(first);
            }
          } catch { /* ignore */ }
        })();
        return () => { mounted = false; };
      }, [uuid]);
      return <span key={k} className='ls-inline-ref ref faded'>[ref] <span className='ref-text'>{preview}</span></span>;
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
          try {
            const blk = await logseq.Editor.getBlock(uuid);
            if (blk && mounted) {
              const first = (blk.content || '').split('\n')[0] || '';
              setPreview(first);
            }
          } catch {/* ignore */}
        })();
        return () => { mounted = false; };
      }, [uuid]);
      return <span key={k} className='ls-inline-embed embed faded'>[embed] <span className='embed-text'>{preview}</span></span>;
    };

    const InlineEmbedPage: React.FC<{ name: string; k: string }> = ({ name, k }) => {
      // Lightweight: just show page name; avoid fetching tree for inline preview
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
    return (
      <div key={idx} className={'ls-block-line' + (line.includes(':: ') && !hideProperties ? ' prop' : '')}>
  {(withEmbeds.length ? withEmbeds : (withRefs.length ? withRefs : (withLinks.length ? withLinks : line)))}
      </div>
    );
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
        if (uuidMatch) {
          try {
            const blk = await logseq.Editor.getBlock(uuidMatch[0]);
            if (blk && mounted) {
              const first = (blk.content || '').split('\n')[0] || '';
              setPreview(first);
            }
          } catch {
            /* ignore */
          }
        } else {
          // Try to extract page name from [[Page]] for page-embed
          const pageMatch = line.match(/\[\[([^\]]+)\]\]/);
          if (pageMatch && mounted) setPreview(pageMatch[1]);
        }
      })();
      return () => { mounted = false; };
    }, []);
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
  let rawLines = stripLogbook(b.content ?? '').split('\n');
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
        const visibleLines = hideProperties ? (text ? text.split('\n') : []) : rawLines;
        return (
          <li key={i} className={'ls-block-item' + (hasRenderable ? '' : ' no-content')}>
            <div className='ls-block-content'>
              {visibleLines.map((line, idx) => {
                const ln = line.replace(/\r/g, '');
                // Skip forced hidden property lines in any case
                if (isForcedHiddenPropLine(ln, alwaysHideKeys)) return null;
                const only = isOnlyRef(ln) || isOnlyEmbed(ln);
                if ((isRef(ln) || isEmbed(ln))) {
                  if (hideReferences && only) return null;
                  if (only) return <RefLine key={idx} line={ln} />
                }
                return renderLine(ln, idx);
              })}
            </div>
            {b.children && b.children.length > 0 && (
              <BlockList blocks={b.children as BlockNode[]} hideProperties={hideProperties} hideReferences={hideReferences} alwaysHideKeys={alwaysHideKeys} currentGraph={currentGraph} onOpenPage={onOpenPage} />
            )}
          </li>
        );
      })}
    </ul>
  );
};


// Convert blocks tree to plain text respecting hideProperties toggle
function flattenBlocksToText(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, depth = 0, alwaysHideKeys: string[] = []): string {
  const indent = (n: number) => '  '.repeat(n);
  const lines: string[] = [];
  for (const b of blocks) {
    const raw = stripLogbook(b.content ?? '');
    const contentLines = raw.split('\n');
    for (const line of contentLines) {
      const l = line.replace(/\r/g, '');
  if (isForcedHiddenPropLine(l, alwaysHideKeys)) continue; // always drop forced
      if (hideProperties && l.includes(':: ')) continue;
      if (l.trim().length === 0) continue;
      const onlyRef = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(l);
      const onlyEmbed = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(l);
      if (/(\(\([0-9a-fA-F-]{36}\)\))|\{\{\s*embed\b[^}]*\}\}/i.test(l)) {
        if (hideReferences && (onlyRef || onlyEmbed)) continue;
        const uuidMatch = l.match(/[0-9a-fA-F-]{36}/);
        const marker = /embed/i.test(l) ? '[embed]' : '[ref]';
        lines.push(`${indent(depth)}- ${marker} ${(uuidMatch ? uuidMatch[0] : '')}`);
        continue;
      }
      lines.push(`${indent(depth)}- ${l}`);
    }
    if (b.children && b.children.length > 0) {
      const childText = flattenBlocksToText(b.children as BlockNode[], hideProperties, hideReferences, depth + 1, alwaysHideKeys);
      if (childText) lines.push(childText);
    }
  }
  return lines.join('\n');
}

// Render plain text by stripping markdown/org markup tokens
const PlainTextView: React.FC<{ blocks: BlockNode[]; hideProperties?: boolean; hideReferences?: boolean; alwaysHideKeys?: string[] }> = ({ blocks, hideProperties, hideReferences, alwaysHideKeys = [] }) => {
  const text = blocksToPlainText(blocks, !!hideProperties, !!hideReferences, 0, alwaysHideKeys);
  if (!text || text.trim().length === 0) {
    const { t } = useTranslation();
    return <div className='sidebar-empty'>{t('no-content')}</div>;
  }
  return <pre className='ls-plain-text'>{text}</pre>;
};

function blocksToPlainText(blocks: BlockNode[], hideProperties: boolean, hideReferences: boolean, depth = 0, alwaysHideKeys: string[] = []): string {
  const lines: string[] = [];
  const indent = '  ';
  for (const b of blocks) {
    const raw = stripLogbook(b.content ?? '');
    const contentLines = raw.split('\n');
    for (const line of contentLines) {
      const l = line.replace(/\r/g, '');
  if (isForcedHiddenPropLine(l, alwaysHideKeys)) continue; // always drop forced
      if (hideProperties && l.includes(':: ')) continue;
      const onlyRef = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(l);
      const onlyEmbed = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(l);
  // Drop image-only lines (Markdown image with optional attribute list, or Org link image), possibly prefixed by bullet/checkbox
  const onlyMdImg = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*!\[[^\]]*\]\(\.\.\/assets\/[^)]+\)(?:\{\:[^}]*\})?\s*$/.test(l);
  const onlyOrgImg = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\[\[\.\.\/assets\/[^\]]+\](?:\[[^\]]*\])?\]\s*$/.test(l);
  if (onlyMdImg || onlyOrgImg) continue;
      if (/(\(\([0-9a-fA-F-]{36}\)\))|\{\{\s*embed\b[^}]*\}\}/i.test(l)) {
        if (hideReferences && (onlyRef || onlyEmbed)) continue;
        const uuidMatch = l.match(/[0-9a-fA-F-]{36}/);
        const marker = /embed/i.test(l) ? '[embed]' : '[ref]';
        lines.push(`${indent.repeat(depth)}${marker} ${(uuidMatch ? uuidMatch[0] : '')}`);
        continue;
      }
      const stripped = stripMarkdown(l);
      if (stripped.trim().length === 0) continue;
      lines.push(`${indent.repeat(depth)}${stripped}`);
    }
    if (b.children && b.children.length > 0) {
      const child = blocksToPlainText(b.children as BlockNode[], hideProperties, hideReferences, depth + 1, alwaysHideKeys);
      if (child) lines.push(child);
    }
  }
  return lines.join('\n');
}

function stripMarkdown(s: string): string {
  let out = s;
  // remove code fences indicators
  out = out.replace(/^\s*```.*$/g, '');
  // headings (markdown/org)
  out = out.replace(/^\s*#{1,6}\s+/g, '');
  out = out.replace(/^\s*\*{1,6}\s+/g, '');
  // list bullets and checkboxes
  out = out.replace(/^\s*[-*+]\s+/g, '');
  out = out.replace(/^\s*\d+\.\s+/g, '');
  out = out.replace(/\s*\[(?:x|X| )\]\s*/g, ' ');
  // bold/italic/strikethrough
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/__([^_]+)__/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/~~([^~]+)~~/g, '$1');
  // inline code
  out = out.replace(/`([^`]+)`/g, '$1');
  // markdown links and images
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // logseq page refs [[Page]]
  out = out.replace(/\[\[([^\]]+)\]\]/g, '$1');
  // tags #tag -> tag
  out = out.replace(/(^|\s)#(\S+)/g, '$1$2');
  return out;
}

// Remove org-mode drawer like LOGBOOK blocks from text
function stripLogbook(s: string): string {
  // Handles multi-line drawers: :LOGBOOK: ... :END:
  // Use a global, dotall-like approach by splitting to lines and skipping ranges
  const lines = s.split('\n');
  const out: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (!skip && /^\s*:LOGBOOK:\s*$/i.test(line)) {
      skip = true;
      continue;
    }
    if (skip) {
      if (/^\s*:END:\s*$/i.test(line)) {
        skip = false;
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// (MetaView removed)

// Build RAW text (first lines outline) for copy and view
function outlineTextFromBlocks(blocks: BlockNode[]): string {
  const walk = (bs: BlockNode[], depth = 0, out: string[] = []) => {
    for (const b of bs) {
      const first = (b.content || '').split('\n')[0] || '';
      const trimmed = first.replace(/\r/g, '').trim();
      if (trimmed) out.push(`${'  '.repeat(depth)}- ${trimmed}`);
      if (b.children && b.children.length) walk(b.children, depth + 1, out);
    }
    return out;
  };
  return walk(blocks).join('\n');
}

// Outline view: show only first lines of each block as a compact list
const OutlineView: React.FC<{ blocks: BlockNode[] }> = ({ blocks }) => {
  const lines = outlineTextFromBlocks(blocks).split('\n').filter(Boolean);
  if (lines.length === 0) {
    const { t } = useTranslation();
    return <div className='sidebar-empty'>{t('no-content')}</div>;
  }
  return <pre className='ls-plain-text'>{lines.join('\n')}</pre>;
};

// InfoView was removed with the Info panel; assets are now surfaced inline when needed.
