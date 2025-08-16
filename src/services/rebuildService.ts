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
  // 明示的にローディング/ロックを開始
  setCardsUpdating(true);
  setLoading(true);
  try {
    const isSynthetic = currentGraph.startsWith('fs_');
    if (!isSynthetic) {
      // 非 fs_ グラフはサポート対象外（フォルダ専用運用）
      return; // finally で lock は解除される
    }
    if (!currentDirHandle) { return; }
    try {
      // synthetic は丸ごと再構築（まず Pages のみをロック下で処理）
      await boxService.removeByGraph(currentGraph);

      const existingSet = new Set<string>();

      const processFile = async (dir: FileSystemDirectoryHandle, entryName: string) => {
        try {
          if (rebuildTokenRef.current !== myToken) return; // 以降はキャンセル
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

      // Pages: ルート直下のファイルのみ（journals ディレクトリはスキップ）
      // @ts-ignore
      for await (const [entryName, entry] of (currentDirHandle as any).entries()) {
        if (rebuildTokenRef.current !== myToken) break;
        if (!entryName) continue;
        if (entry.kind === 'file') {
          await processFile(currentDirHandle, entryName);
        }
        // ディレクトリはここでは無視（journals は後段で非同期処理）
      }

      // Journals: ロック外で別スレッド的に処理（ロックは解除してから起動）
      const kickJournals = async () => {
        try {
          // currentDirHandle/journals サブディレクトリ
          const journalsDir = await currentDirHandle.getDirectoryHandle('journals').catch(() => null as any);
          if (journalsDir) {
            // @ts-ignore
            for await (const [jName, jEntry] of (journalsDir as any).entries()) {
              if (rebuildTokenRef.current !== myToken) break;
              if (!jName || jEntry.kind !== 'file') continue;
              await processFile(journalsDir, jName);
            }
          }
          // 兄弟階層の journals ディレクトリ（オプション）
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
      };

      // ロック解除後に非同期でキック
      queueMicrotask(() => { void kickJournals(); });
    } catch { /* ignore */ }
  } catch (e) {
    console.warn('rebuildDB failed', e);
  } finally {
    // トークンが変わっていてもロックは確実に解除する
    try { setCardsUpdating(false); } catch { /* ignore */ }
    try { setLoading(false); } catch { /* ignore */ }
  }
}
