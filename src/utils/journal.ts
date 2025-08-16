// Utilities for journal/date and display titles

export function isJournalName(raw: string): boolean {
  return /^(?:journals\/)?(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/.test(raw.replace(/%2F/gi, '/'));
}

export function journalDateValue(name: string): number {
  const decoded = name.replace(/%2F/gi, '/').replace(/^journals\//, '').replace(/\.(md|org)$/i, '');
  const m = decoded.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
  if (!m) return 0;
  const [, y, mo, d] = m;
  return parseInt(y + mo + d, 10) || 0;
}

export function formatDateByPattern(dt: Date, pattern: string): string {
  const yyyy = String(dt.getFullYear());
  const MM = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return pattern.replace(/yyyy/g, yyyy).replace(/MM/g, MM).replace(/dd/g, dd);
}

export function displayTitle(name: string, _graphMode: 'logseq' | 'folder', journalDatePattern: string): string {
  const decoded = name.replace(/%2F/gi, '/');
  const noExt = decoded.replace(/\.(md|org)$/i, '');
  const journalMatch = noExt.match(/^(?:journals\/)?(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
  if (journalMatch) {
    const [, y, m, d] = journalMatch;
    try {
      const dt = new Date(Number(y), Number(m) - 1, Number(d));
      // 要件: Logseq MODE では表示のみユーザー指定のフォーマット
      // Folder MODE でも同様の見た目整合性のため同一書式を返すが、内部名は不変
      return formatDateByPattern(dt, journalDatePattern);
    } catch {
      return `${y}/${m}/${d}`;
    }
  }
  return decoded;
}

export function journalDayWeek(name: string): string {
  const decoded = name.replace(/%2F/gi, '/').replace(/^journals\//, '').replace(/\.(md|org)$/i, '');
  const m = decoded.match(/^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/);
  if (!m) return decoded;
  const [, y, mo, d] = m;
  try {
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    const day = new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(dt);
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(dt);
    return `${day} ${weekday}`;
  } catch {
    return decoded;
  }
}

// ===== Date parsing helpers for links/titles =====
type ParsedDate = { y: number; m: number; d: number };

export function parseDateByPattern(text: string, pattern: string): ParsedDate | null {
  if (!pattern || !text) return null;
  const t = text.trim();
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export function toJournalPageNameIfDateUsing(pattern: string, s: string): string | null {
  const r = parseDateByPattern(s, pattern);
  if (!r) return null;
  const y = String(r.y).padStart(4, '0');
  const m = String(r.m).padStart(2, '0');
  const d = String(r.d).padStart(2, '0');
  return `${y}_${m}_${d}`;
}

// Flexible detection: find a date substring like YYYY[-_/ .]MM[-_/ .]DD or YYYYMMDD
export function inferJournalFromTextFlexible(s: string): string | null {
  if (!s) return null;
  const decoded = s
    .replace(/%2F/gi, '/')
    .replace(/[／]/g, '/')
    .replace(/[－ー―–—‐]/g, '-')
    .replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '')
    .replace(/\s+/g, ' ');
  // 1) YYYYMMDD contiguous
  const m1 = /\b(\d{4})(\d{2})(\d{2})\b/.exec(decoded);
  if (m1) {
    const y = parseInt(m1[1], 10), M = parseInt(m1[2], 10), d = parseInt(m1[3], 10);
    if (M >= 1 && M <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, M - 1, d);
      if (dt.getFullYear() === y && dt.getMonth() === M - 1 && dt.getDate() === d) {
        return `${String(y).padStart(4, '0')}_${String(M).padStart(2, '0')}_${String(d).padStart(2, '0')}`;
      }
    }
  }
  // 2) With separators -, _, /, ., space
  const m2 = /\b(\d{4})[-_\/.\s](\d{1,2})[-_\/.\s](\d{1,2})\b/.exec(decoded);
  if (m2) {
    const y = parseInt(m2[1], 10), M = parseInt(m2[2], 10), d = parseInt(m2[3], 10);
    if (M >= 1 && M <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, M - 1, d);
      if (dt.getFullYear() === y && dt.getMonth() === M - 1 && dt.getDate() === d) {
        return `${String(y).padStart(4, '0')}_${String(M).padStart(2, '0')}_${String(d).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

// Try pattern first; if not matched, fallback to flexible detection
export function inferJournalPageNameFromText(text: string, pattern?: string): string | null {
  if (pattern) {
    const byPattern = toJournalPageNameIfDateUsing(pattern, text);
    if (byPattern) return byPattern;
  }
  return inferJournalFromTextFlexible(text);
}

// Return a virtual key YYYYMMDD for a given text if it represents a full date
// Accepts: journals/YYYY_MM_DD(.md/.org), YYYY-MM-DD, YYYY/MM/DD, contiguous YYYYMMDD, etc.
export function journalVirtualKeyFromText(text: string): string | null {
  if (!text) return null;
  const decoded = text.replace(/%2F/gi, '/');
  const noExt = decoded.replace(/\.(md|org)$/i, '');
  // direct match (with optional journals/ prefix and separators)
  let m = /^(?:journals\/)?(\d{4})[-_\/]?(\d{2})[-_\/]?(\d{2})$/.exec(noExt);
  if (m) {
    const y = m[1], M = m[2], d = m[3];
    return `${y}${M}${d}`;
  }
  // flexible inference inside the text (must be full date)
  const inferred = inferJournalPageNameFromText(noExt);
  if (inferred) {
    return inferred.replace(/_/g, ''); // YYYYMMDD
  }
  return null;
}
