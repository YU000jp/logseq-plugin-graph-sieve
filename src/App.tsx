import { logger } from './logger'; // logger.tsからロガーをインポート
import { useCallback, useEffect, useRef, useState } from 'react'
// import { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { db, Box } from './db';
import './App.css'
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, IconButton, InputAdornment, TextField, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Clear } from '@mui/icons-material';
import { encodeLogseqFileName, getLastUpdatedTime, getSummary, parseOperation, sleep } from './utils';
import type { MarkdownOrOrg, PrimaryKey, SearchResultPage, FileChanges } from './types';
import BoxCard from './components/BoxCard';

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

  const { t } = useTranslation();

  const cardboxes = useLiveQuery(
    () => {
      if (filteredPages.length === 0) {
        return db.box
          .orderBy('time')
          .filter(box => box.graph === currentGraph)
          .reverse()
          .limit(maxBoxNumber)
          .toArray()
      }
      else {
        return db.box
          .where(':id')
          .anyOf(filteredPages)
          .reverse()
          .sortBy('time')
      }
    }
    , [currentGraph, filteredPages, maxBoxNumber]);


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
          [?p :block/original-name ?name]]
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
      else {
        setLoading(true);

        // This currentGraph is not the same as the one in state.
        const { currentGraph } = await logseq.App.getUserConfigs();

        const pages = await logseq.Editor.getAllPages();
        if (!pages) return [];

        const promises = [];
        while (pages.length > 0) {
          const page = pages.shift();
          if (page) {
            if (page['journal?']) continue;

            const promise = (async () => {
              let updatedTime: number | undefined = 0;
              if (currentDirHandle) {
                updatedTime = await getLastUpdatedTime(encodeLogseqFileName(page.originalName), currentDirHandle!, preferredFormat);
              }
              else {
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
              if (!blocks || blocks.length === 0) {
                return;
              }
              const [summary, image] = getSummary(blocks);
              // Logseq has many meta pages that has no content. Skip them.
              // Detailed check for empty page
              if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
                await db.box.put({
                  graph: currentGraph,
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
            await Promise.all(promises).catch(err => {
              console.error(err);
            });
            promises.splice(0, loadingCardNumber);
            setTotalCardNumber(await db.box.where('graph').equals(currentGraph).count());
            // LiveQuery needs some time to update.
            await sleep(500);
          }

        }

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
        const box = (document.getElementsByClassName('selectedBox')[0] as HTMLElement);
        if (e.shiftKey) {
          logseq.Editor.openInRightSidebar(box.id);
        }
        else {
          logseq.App.pushState('page', {
            name: box.getElementsByClassName('box-title')[0].innerHTML,
          });
        }
        logseq.hideMainUI({ restoreEditingCursor: true });
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
  }, [loading]);

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
      logseq.Editor.openInRightSidebar(box.uuid);
    }
    else {
      logseq.App.pushState('page', {
        name: box.name,
      });
    }
    logseq.hideMainUI({ restoreEditingCursor: true });
  };

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
      <div id='tile' ref={tileRef} tabIndex={2}>
        {boxElements}
      </div>
      <div className='footer'>
        {t("footer")}
      </div>
    </>
  )
}

export default App
