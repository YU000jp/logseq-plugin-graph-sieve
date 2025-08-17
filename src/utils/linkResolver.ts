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
  
  // 元の名前をそのまま追加
  add(n0);
  
  // decodeURIComponent if possible
  try { 
    const dec = decodeURIComponent(n0); 
    if (dec !== n0) add(dec); 
  } catch {}
  
  // %2F -> '/'
  const n1 = n0.replace(/%2F/gi, '/'); 
  if (n1 !== n0) add(n1);
  
  // slash <-> ___ variants
  add(n0.replace(/\//g, '___'));
  add(n1.replace(/\//g, '___'));
  
  // URL エンコードされた名前の処理
  try {
    const fullDecoded = decodeURIComponent(n0.replace(/\+/g, ' '));
    if (fullDecoded !== n0 && fullDecoded !== n1) {
      add(fullDecoded);
      add(fullDecoded.replace(/\//g, '___'));
    }
  } catch {}
  
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
    if (m) { 
      add(`${m[1]}_${m[2]}_${m[3]}`); 
      add(`${m[1]}/${m[2]}/${m[3]}`); 
      add(`journals/${m[1]}_${m[2]}_${m[3]}`);
      add(`journals/${m[1]}/${m[2]}/${m[3]}`);
    }
  };
  dn(n0); 
  dn(n1);
  
  // spaces to underscores and vice versa
  if (n0.includes(' ')) {
    const spaceToUnderscore = n0.replace(/\s+/g, '_');
    add(spaceToUnderscore);
    add('journals/' + spaceToUnderscore);
  }
  if (n0.includes('_')) {
    const underscoreToSpace = n0.replace(/_/g, ' ');
    add(underscoreToSpace);
    add('journals/' + underscoreToSpace);
  }
  
  // encoded filename variant (should be done at the end)
  const currentCandidates = out.slice();
  currentCandidates.forEach(v => add(encodeLogseqFileName(v)));
  
  // unique + cap (増加)
  const uniqueCandidates = Array.from(new Set(out));
  console.debug(`[linkResolver] Generated ${uniqueCandidates.length} candidates for "${rawName}":`, uniqueCandidates.slice(0, 10));
  
  return uniqueCandidates.slice(0, 64); // 上限を増やす
};

export const resolveFileFromDirs = async (
  dirs: Array<FileSystemDirectoryHandle | null | undefined>,
  candidates: string[],
  opts?: { scanFallback?: boolean }
): Promise<{ file: File; picked: string } | null> => {
  const exts = ['.md', '.org'];
  const { scanFallback = false } = opts || {};
  
  console.debug(`[resolveFileFromDirs] Searching in ${dirs.length} directories for ${candidates.length} candidates`);
  
  const tryExact = async (dir: FileSystemDirectoryHandle): Promise<{ file: File; picked: string } | null> => {
    for (const base of candidates) {
      for (const ext of exts) {
        const name = base + ext;
        try {
          const fh = await dir.getFileHandle(name);
          const file = await fh.getFile();
          console.debug(`[resolveFileFromDirs] Found exact match: ${name}`);
          return { file, picked: name };
        } catch {
          // continue to next candidate
        }
      }
    }
    return null;
  };
  
  // First try exact matches
  for (const d of dirs) {
    if (!d) continue;
    const hit = await tryExact(d);
    if (hit) return hit;
  }
  
  if (scanFallback) {
    console.debug(`[resolveFileFromDirs] Falling back to directory scan`);
    for (const d of dirs) {
      if (!d) continue;
      try {
        const entries: Array<[string, FileSystemFileHandle]> = [];
        for await (const [entryName, entry] of (d as any).entries()) {
          if (!entryName || entry.kind !== 'file' || !/\.(md|org)$/i.test(entryName)) continue;
          entries.push([entryName, entry]);
        }
        
        console.debug(`[resolveFileFromDirs] Scanning ${entries.length} files in directory`);
        
        for (const [entryName, entry] of entries) {
          const base = entryName.replace(/\.(md|org)$/i,'');
          
          // 候補との複数の比較方法を試す
          const matchFound = candidates.some(c => {
            const decoded = decodeLogseqFileName(base);
            const encodedCandidate = encodeLogseqFileName(c);
            
            // 直接比較
            if (base === c || decoded === c) return true;
            
            // エンコード候補との比較
            if (base === encodedCandidate) return true;
            
            // 大文字小文字を無視した比較
            if (base.toLowerCase() === c.toLowerCase() || decoded.toLowerCase() === c.toLowerCase()) return true;
            
            // スペース・アンダースコア変換での比較
            const baseSpaced = base.replace(/_/g, ' ');
            const decodedSpaced = decoded.replace(/_/g, ' ');
            const candidateSpaced = c.replace(/_/g, ' ');
            if (baseSpaced === candidateSpaced || decodedSpaced === candidateSpaced) return true;
            
            return false;
          });
          
          if (matchFound) {
            try {
              const file = await entry.getFile();
              console.debug(`[resolveFileFromDirs] Found fallback match: ${entryName}`);
              return { file, picked: entryName };
            } catch (error) {
              console.debug(`[resolveFileFromDirs] Error reading file ${entryName}:`, error);
            }
          }
        }
      } catch (error) {
        console.debug(`[resolveFileFromDirs] Error scanning directory:`, error);
      }
    }
  }
  
  console.debug(`[resolveFileFromDirs] No matches found for candidates:`, candidates.slice(0, 5));
  return null;
};
