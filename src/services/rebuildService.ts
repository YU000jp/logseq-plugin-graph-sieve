import { boxService } from './boxService';
import { queryPagesBasic, getPageBlocksTreeSafe, PageTuple } from './queryService';
import { encodeLogseqFileName, getLastUpdatedTime, getSummary, getSummaryFromRawText, decodeLogseqFileName, sleep } from '../utils';

export interface RebuildOptions {
  currentGraph: string;
  currentDirHandle?: FileSystemDirectoryHandle;
  journalsDirHandle?: FileSystemDirectoryHandle;
  preferredFormat: string;
  setLoading: (on: boolean) => void;
  setCardsUpdating: (on: boolean) => void;
  rebuildTokenRef: { current: number };
  batchSize?: number;
  batchSleepMs?: number;
}

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_SLEEP_MS = 300;

export async function rebuildDatabase(opts: RebuildOptions): Promise<void> {
  const {
    currentGraph,
    currentDirHandle,
    journalsDirHandle,
    preferredFormat,
    setLoading,
    setCardsUpdating,
    rebuildTokenRef,
    batchSize = DEFAULT_BATCH_SIZE,
    batchSleepMs = DEFAULT_SLEEP_MS,
  } = opts;

  if (!currentGraph) return;
  const myToken = ++rebuildTokenRef.current;
  setCardsUpdating(true);
  try {
    const { currentGraph: cg } = await logseq.App.getUserConfigs();
    const isSynthetic = currentGraph.startsWith('fs_');
    const targetGraph = isSynthetic ? currentGraph : cg;
    if (rebuildTokenRef.current !== myToken) return;

    if (isSynthetic) {
      if (!currentDirHandle) { setLoading(false); return; }
      try {
        // synthetic は丸ごと再構築
        await boxService.removeByGraph(currentGraph);
        const existingSet = new Set<string>();
        const processFile = async (dir: FileSystemDirectoryHandle, entryName: string) => {
          try {
            if (rebuildTokenRef.current !== myToken) return;
            if (!/\.(md|org)$/i.test(entryName)) return;
            const base = entryName.replace(/\.(md|org)$/i, '');
            const pageName = decodeLogseqFileName(base);
            if (!pageName || existingSet.has(pageName)) return;
            const fileHandle = await dir.getFileHandle(entryName).catch(() => null as any);
            if (!fileHandle) return;
            const file = await fileHandle.getFile();
            const text = file.size > 0 ? await file.text() : '';
            const [summaryRaw, image] = getSummaryFromRawText(text);
            const summary = summaryRaw.length === 0 ? [''] : summaryRaw;
            if (rebuildTokenRef.current !== myToken) return;
            await boxService.upsert({ graph: currentGraph, name: pageName, uuid: '', time: file.lastModified, summary, image });
            existingSet.add(pageName);
          } catch { /* ignore */ }
        };
        // root entries
        // @ts-ignore
        for await (const [entryName, entry] of (currentDirHandle as any).entries()) {
          if (rebuildTokenRef.current !== myToken) break;
          if (!entryName) continue;
          if (entry.kind === 'file') {
            await processFile(currentDirHandle, entryName);
          } else if (entry.kind === 'directory' && entryName === 'journals') {
            const journalsDir = await currentDirHandle.getDirectoryHandle('journals').catch(() => null as any);
            if (journalsDir) {
              // @ts-ignore
              for await (const [jName, jEntry] of (journalsDir as any).entries()) {
                if (rebuildTokenRef.current !== myToken) break;
                if (!jName || jEntry.kind !== 'file') continue;
                await processFile(journalsDir, jName);
              }
            }
          }
        }
        // sibling root-level journals dir (optional)
        if (journalsDirHandle) {
          try {
            // @ts-ignore
            for await (const [jName, jEntry] of (journalsDirHandle as any).entries()) {
              if (rebuildTokenRef.current !== myToken) break;
              if (!jName || jEntry.kind !== 'file') continue;
              await processFile(journalsDirHandle, jName);
            }
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      setLoading(false);
      return;
    }

    // Logseq DB mode
    let tuples: PageTuple[] = await queryPagesBasic();
    if (!tuples || tuples.length === 0) { setLoading(false); return; }
    const seen = new Set<string>();
    const filtered = tuples.filter(t => {
      const [name] = t;
      if (!name) return false;
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    const promises: Promise<void>[] = [];
    while (filtered.length > 0) {
      if (rebuildTokenRef.current !== myToken) break;
      const tuple = filtered.pop();
      if (!tuple) break;
      const [originalName, uuid, updatedAt] = tuple as PageTuple;
      const p = (async () => {
        if (rebuildTokenRef.current !== myToken) return;
        let updatedTime: number | undefined = 0;
        if (currentDirHandle) {
          updatedTime = await getLastUpdatedTime(encodeLogseqFileName(originalName), currentDirHandle!, preferredFormat as any);
        } else {
          if (originalName === 'Contents') return;
          updatedTime = updatedAt || 0;
        }
        if (!updatedTime) return;
        const blocks = await getPageBlocksTreeSafe(uuid || originalName);
        if (!blocks || blocks.length === 0) return;
        const [summary, image] = getSummary(blocks);
        if (summary.length > 0 && !(summary.length === 1 && summary[0] === '')) {
          if (rebuildTokenRef.current !== myToken) return;
          await boxService.upsert({
            graph: targetGraph,
            name: originalName,
            uuid: uuid || '',
            time: updatedTime,
            summary,
            image,
          });
        }
      })();
      promises.push(p);
      if (filtered.length === 0 || promises.length >= batchSize) {
        await Promise.all(promises).catch(err => { console.error(err); });
        promises.splice(0, promises.length);
        await sleep(batchSleepMs);
      }
    }
  } catch (e) {
    console.warn('rebuildDB failed', e);
  } finally {
    if (rebuildTokenRef.current === myToken) setCardsUpdating(false);
    setLoading(false);
  }
}
