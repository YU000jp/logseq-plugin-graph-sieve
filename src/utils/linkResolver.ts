import { encodeLogseqFileName, decodeLogseqFileName } from '../utils';
import { inferJournalPageNameFromText } from './journal';

export const buildNameCandidates = (rawName: string): string[] => {
  const out: string[] = [];
  const add = (s?: string) => { if (s && (s = s.trim()).length) out.push(s); };
  let n0 = (rawName || '').trim();
  // strip extension
  n0 = n0.replace(/\.(md|org)$/i, '');
  // strip anchor / query
  n0 = n0.replace(/[?#].*$/, '');
  add(n0);
  // decodeURIComponent if possible
  try { const dec = decodeURIComponent(n0); if (dec !== n0) add(dec); } catch {}
  // %2F -> '/'
  const n1 = n0.replace(/%2F/gi, '/'); if (n1 !== n0) add(n1);
  // slash <-> ___ variants
  add(n0.replace(/\//g, '___'));
  add(n1.replace(/\//g, '___'));
  // journals/ prefix variants
  if (/^journals\//i.test(n0)) add(n0.replace(/^journals\//i, ''));
  else add('journals/' + n0);
  if (/^journals\//i.test(n1)) add(n1.replace(/^journals\//i, ''));
  else add('journals/' + n1);
  // journals with underscore replacements too
  const ju = n0.replace(/^journals\//i,'').replace(/\//g,'___');
  add('journals/' + ju);
  // ---- Journal virtual-key support from date-like titles or embedded dates ----
  // If text can be parsed as a full date (not just year or year/month),
  // map to journals/YYYY_MM_DD and related variants. Accepts contiguous YYYYMMDD or with separators.
  const j0 = inferJournalPageNameFromText(n0) || undefined;
  const j1 = inferJournalPageNameFromText(n1) || undefined;
  const jPick = j0 || j1;
  if (jPick) {
    // jPick is like YYYY_MM_DD
    const js = jPick.replace(/_/g, '/'); // YYYY/MM/DD (virtual path)
    const jk = jPick.replace(/_/g, '');  // virtual key YYYYMMDD (for labeling/debug)
    add(jPick);
    add('journals/' + jPick);
    add(js);
    add('journals/' + js);
    // also add encoded/underscored forms will be handled later via encodeLogseqFileName
    // Keep the virtual key as a candidate too (some higher layers may use it as a lookup key)
    add(jk);
  }
  // date variants YYYY[-_\/]MM[-_\/]DD
  const dn = (s: string) => {
    const m = s.match(/^(\d{4})[-_\/]?(\d{2})[-_\/]?(\d{2})$/);
    if (m) { add(`${m[1]}_${m[2]}_${m[3]}`); add(`${m[1]}/${m[2]}/${m[3]}`); add(`journals/${m[1]}_${m[2]}_${m[3]}`); }
  };
  dn(n0); dn(n1);
  // encoded filename variant
  out.slice(0).forEach(v => add(encodeLogseqFileName(v)));
  // unique + cap
  return Array.from(new Set(out)).slice(0, 48);
};

export const resolveFileFromDirs = async (
  dirs: Array<FileSystemDirectoryHandle | null | undefined>,
  candidates: string[],
  opts?: { scanFallback?: boolean }
): Promise<{ file: File; picked: string } | null> => {
  const exts = ['.md', '.org'];
  const tryExact = async (dir: FileSystemDirectoryHandle): Promise<{ file: File; picked: string } | null> => {
    for (const base of candidates) {
      for (const ext of exts) {
        const name = base + ext;
        const fh = await dir.getFileHandle(name).catch(()=>null);
        if (fh) { try { const file = await fh.getFile(); return { file, picked: name }; } catch {} }
      }
    }
    return null;
  };
  for (const d of dirs) {
    if (!d) continue;
    const hit = await tryExact(d);
    if (hit) return hit;
  }
  if (opts?.scanFallback) {
    for (const d of dirs) {
      if (!d) continue;
      try {
        for await (const [entryName, entry] of (d as any).entries()) {
          if (!entryName || entry.kind !== 'file' || !/\.(md|org)$/i.test(entryName)) continue;
          const base = entryName.replace(/\.(md|org)$/i,'');
          // match against all candidate plain forms
          if (candidates.some(c => decodeLogseqFileName(base) === c || base === c)) {
            const fh = await d.getFileHandle(entryName).catch(()=>null);
            if (fh) { try { const file = await fh.getFile(); return { file, picked: entryName }; } catch {} }
          }
        }
      } catch {}
    }
  }
  return null;
};
