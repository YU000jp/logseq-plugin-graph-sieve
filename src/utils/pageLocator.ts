import { buildNameCandidates, resolveFileFromDirs } from './linkResolver';
import { journalVirtualKeyFromText } from './journal';

export interface PageLocatorOptions {
  /**
   * buildNameCandidates に加えて、ジャーナル日付表記からの仮想候補（YYYY_MM_DD / YYYY/MM/DD / journals/...）を優先的に挿入します。
   * 既定: true
   */
  preferJournalVirtuals?: boolean;
  /**
   * resolveFileFromDirs の scanFallback をそのまま渡します。
   * 既定: true（ホバー等で広めに拾いたい場面向け）
   */
  scanFallback?: boolean;
  /** 追加で探索したいディレクトリ */
  extraDirs?: Array<FileSystemDirectoryHandle | null | undefined>;
}

export type LocatedPageFile = { file: File; picked: string };

/**
 * 与えられたページ名から最適なファイル候補を探索して返します。
 * - pagesDirHandle / journalsDirHandle（と pages/journals サブディレクトリ）を対象
 * - ジャーナル日付名は優先候補（2025_01_01 / 2025/01/01 / journals/...）を先頭に追加
 */
export async function locatePageFile(
  name: string,
  pagesDirHandle?: FileSystemDirectoryHandle,
  journalsDirHandle?: FileSystemDirectoryHandle,
  opts: PageLocatorOptions = {}
): Promise<LocatedPageFile | null> {
  const { preferJournalVirtuals = true, scanFallback = true, extraDirs = [] } = opts;

  let candidates = buildNameCandidates(name);

  if (preferJournalVirtuals) {
    try {
      const vkey = journalVirtualKeyFromText(name);
      if (vkey) {
        const y = vkey.slice(0, 4), m = vkey.slice(4, 6), d = vkey.slice(6, 8);
        const jName = `${y}_${m}_${d}`;
        const preferred = [
          `journals/${jName}`,
          jName,
          `${y}/${m}/${d}`,
          `journals/${y}/${m}/${d}`,
        ];
        const seen = new Set<string>();
        const merged: string[] = [];
        for (const s of [...preferred, ...candidates]) { if (!seen.has(s)) { seen.add(s); merged.push(s); } }
        candidates = merged;
      }
    } catch { /* noop */ }
  }

  let subJournals: FileSystemDirectoryHandle | null = null;
  if (pagesDirHandle) {
    try { subJournals = await (pagesDirHandle as any).getDirectoryHandle('journals'); } catch { subJournals = null; }
  }

  const dirs = [pagesDirHandle || null, subJournals, journalsDirHandle || null, ...extraDirs].filter(Boolean) as FileSystemDirectoryHandle[];
  const located = await resolveFileFromDirs(dirs, candidates, { scanFallback });
  return located ? { file: located.file, picked: located.picked } : null;
}
