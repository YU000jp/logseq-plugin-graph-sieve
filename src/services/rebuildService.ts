import { boxService } from './boxService';
import { getSummaryFromRawText, decodeLogseqFileName } from '../utils';

export interface RebuildOptions {
  currentGraph: string;
  currentDirHandle?: FileSystemDirectoryHandle;
  journalsDirHandle?: FileSystemDirectoryHandle;
  // preferredFormat removed in folder-only mode
  setLoading: (on: boolean) => void;
  setCardsUpdating: (on: boolean) => void;
  rebuildTokenRef: { current: number };
  // batch options are not used in folder-only mode
  batchSize?: number;
  batchSleepMs?: number;
}


export async function rebuildDatabase(opts: RebuildOptions): Promise<void> {
  const {
    currentGraph,
    currentDirHandle,
    journalsDirHandle,
    setLoading,
    setCardsUpdating,
    rebuildTokenRef,
  // batch options are not used in folder-only mode
  } = opts;

  if (!currentGraph) return;
  const myToken = ++rebuildTokenRef.current;
  setCardsUpdating(true);
  try {
    const isSynthetic = currentGraph.startsWith('fs_');
    if (!isSynthetic) {
      // 非 fs_ グラフはサポート対象外（フォルダ専用運用）
      setLoading(false);
      return;
    }
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
  } catch (e) {
    console.warn('rebuildDB failed', e);
  } finally {
    if (rebuildTokenRef.current === myToken) setCardsUpdating(false);
    setLoading(false);
  }
}
