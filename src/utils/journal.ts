// Utilities for journal/date and display titles

// ===== Internal common helpers (not exported) =====
const RE_JOURNAL_FULL = /^(?:journals\/)?(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/;
const RE_YMD_CORE = /^(\d{4})[-_]?(\d{2})[-_]?(\d{2})$/;
// Allows optional '/' separators for virtual-key extraction use-case only
const RE_JOURNAL_ANYSEP = /^(?:journals\/)?(\d{4})[-_\/]?(\d{2})[-_\/]?(\d{2})$/;

const decodePercentSlash = (s: string) => s.replace(/%2F/gi, '/');
const stripExt = (s: string) => s.replace(/\.(md|org)$/i, '');
const stripJournalsPrefix = (s: string) => s.replace(/^journals\//, '');

const toDateStrict = (y: number, m: number, d: number): Date | null => {
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
};

const pad2 = (n: number | string) => String(n).padStart(2, '0');
const pad4 = (n: number | string) => String(n).padStart(4, '0');

const ymdUnderscore = (y: number, m: number, d: number) => `${pad4(y)}_${pad2(m)}_${pad2(d)}`;

const normalizeForDisplaySource = (name: string) => stripExt(decodePercentSlash(name));
const normalizeForValue = (name: string) => stripJournalsPrefix(stripExt(decodePercentSlash(name)));

// Shared formatters to avoid repeated instantiation
const DTF_DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric' });
const DTF_WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

// ===== Public APIs =====

/**
 * 指定文字列がジャーナル名(YYYY[-|_]MM[-|_]DD、先頭にjournals/可)かを判定
 */
export function isJournalName(raw: string): boolean {
  return RE_JOURNAL_FULL.test(decodePercentSlash(raw));
}

/**
 * ジャーナル名からYYYYMMDDの数値(例: 20250109)を返す。該当しなければ0。
 */
export function journalDateValue(name: string): number {
  const normalized = normalizeForValue(name);
  const m = normalized.match(RE_YMD_CORE);
  if (!m) return 0;
  const [, y, mo, d] = m;
  return parseInt(y + mo + d, 10) || 0;
}

/**
 * 日付をユーザー指定パターン(yyyy|MM|dd)で整形する。
 */
export function formatDateByPattern(dt: Date, pattern: string): string {
  const yyyy = String(dt.getFullYear());
  const MM = pad2(dt.getMonth() + 1);
  const dd = pad2(dt.getDate());
  return pattern.replace(/yyyy/g, yyyy).replace(/MM/g, MM).replace(/dd/g, dd);
}

/**
 * 表示タイトル用に、ジャーナル名なら書式化、そうでなければデコードした元名を返す。
 */
export function displayTitle(name: string, _graphMode: 'logseq' | 'folder', journalDatePattern: string): string {
  const decodedNoExt = normalizeForDisplaySource(name);
  const journalMatch = decodedNoExt.match(RE_JOURNAL_FULL);
  if (journalMatch) {
    const [, y, m, d] = journalMatch;
    const dt = toDateStrict(Number(y), Number(m), Number(d));
    if (dt) return formatDateByPattern(dt, journalDatePattern);
    return `${y}/${m}/${d}`;
  }
  return decodePercentSlash(name);
}

/**
 * ジャーナル名を「日 曜」(例: 9 Mon)に変換。該当しなければ正規化名を返す。
 */
export function journalDayWeek(name: string): string {
  const normalized = normalizeForValue(name);
  const m = normalized.match(RE_YMD_CORE);
  if (!m) return normalized;
  const [, y, mo, d] = m;
  const dt = toDateStrict(Number(y), Number(mo), Number(d));
  if (!dt) return normalized;
  const day = DTF_DAY.format(dt);
  const weekday = DTF_WEEKDAY.format(dt);
  return `${day} ${weekday}`;
}

// ===== Date parsing helpers for links/titles =====
type ParsedDate = { y: number; m: number; d: number };

/**
 * 任意のパターン(yyyy,MM,dd)に従って文字列から厳密な日付を抽出。
 * 有効日付でなければnull。
 */
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
  const dt = toDateStrict(y, M, d);
  return dt ? { y, m: M, d } : null;
}

/**
 * パターンに合致する場合、ジャーナルページ名(YYYY_MM_DD)を返す。
 */
export function toJournalPageNameIfDateUsing(pattern: string, s: string): string | null {
  const r = parseDateByPattern(s, pattern);
  return r ? ymdUnderscore(r.y, r.m, r.d) : null;
}

// Flexible detection: find a date substring like YYYY[-_/ .]MM[-_/ .]DD or YYYYMMDD
/**
 * 柔軟な推論: テキスト内の YYYYMMDD または YYYY[-_/ .]MM[-_/ .]DD を抽出して
 * ジャーナルページ名(YYYY_MM_DD)として返す。
 */
export function inferJournalFromTextFlexible(s: string): string | null {
  if (!s) return null;
  const decoded = decodePercentSlash(s)
    .replace(/[／]/g, '/')
    .replace(/[－ー―–—‐]/g, '-')
    .replace(/年/g, '/')
    .replace(/月/g, '/')
    .replace(/日/g, '')
    .replace(/\s+/g, ' ');

  // 1) YYYYMMDD contiguous
  const m1 = /\b(\d{4})(\d{2})(\d{2})\b/.exec(decoded);
  if (m1) {
    const y = parseInt(m1[1], 10), M = parseInt(m1[2], 10), d = parseInt(m1[3], 10);
    if (toDateStrict(y, M, d)) return ymdUnderscore(y, M, d);
  }
  // 2) With separators -, _, /, ., space
  const m2 = /\b(\d{4})[-_\/.\s](\d{1,2})[-_\/.\s](\d{1,2})\b/.exec(decoded);
  if (m2) {
    const y = parseInt(m2[1], 10), M = parseInt(m2[2], 10), d = parseInt(m2[3], 10);
    if (toDateStrict(y, M, d)) return ymdUnderscore(y, M, d);
  }
  return null;
}

// Try pattern first; if not matched, fallback to flexible detection
/**
 * まずパターンで試し、ダメなら柔軟推論にフォールバックしてページ名(YYYY_MM_DD)を返す。
 */
export function inferJournalPageNameFromText(text: string, pattern?: string): string | null {
  if (pattern) {
    const byPattern = toJournalPageNameIfDateUsing(pattern, text);
    if (byPattern) return byPattern;
  }
  return inferJournalFromTextFlexible(text);
}

// Return a virtual key YYYYMMDD for a given text if it represents a full date
// Accepts: journals/YYYY_MM_DD(.md/.org), YYYY-MM-DD, YYYY/MM/DD, contiguous YYYYMMDD, etc.
/**
 * テキストから仮想キー(YYYYMMDD)を返す。
 * 受理: journals/ 接頭辞, 区切り(- _ /), 拡張子(.md/.org), 連続YYYYMMDDなど。
 */
export function journalVirtualKeyFromText(text: string): string | null {
  if (!text) return null;
  const noExt = stripExt(decodePercentSlash(text));
  // direct match (with optional journals/ prefix and separators)
  const m = RE_JOURNAL_ANYSEP.exec(noExt);
  if (m) {
    const y = m[1], M = m[2], d = m[3];
    return `${y}${M}${d}`;
  }
  // flexible inference inside the text (must be full date)
  const inferred = inferJournalPageNameFromText(noExt);
  return inferred ? inferred.replace(/_/g, '') : null; // YYYYMMDD
}
