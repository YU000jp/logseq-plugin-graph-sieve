// Common helpers for content/body processing

/** Extract property key from a line like: key:: value (tolerates bullets/checkbox) */
export function getPropertyKeyFromLine(line: string): string | null {
  // Matches optional bullet/number + optional checkbox, then key :: value
  const m = line.match(/^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*([^:\n]+?)\s*::\s*/);
  if (!m) return null;
  return m[1].trim();
}

/** Force-hide property lines for id/collapsed and user-specified keys (case-insensitive) */
export function isForcedHiddenPropLine(line: string, alwaysHideKeys: string[] = []): boolean {
  const key = getPropertyKeyFromLine(line);
  if (!key) return false;
  const k = key.toLowerCase();
  if (k === 'id' || k === 'collapsed') return true;
  return alwaysHideKeys.map((s) => s.toLowerCase()).includes(k);
}

/** Remove :LOGBOOK: ... :END: sections */
export function stripLogbook(s: string): string {
  const lines = (s || '').split('\n');
  const out: string[] = [];
  let skip = false;
  for (const line of lines) {
    if (!skip && /^\s*:LOGBOOK:\s*$/i.test(line)) { skip = true; continue; }
    if (skip) { if (/^\s*:END:\s*$/i.test(line)) skip = false; continue; }
    out.push(line);
  }
  return out.join('\n');
}

/** Simple sanitize pipeline shared by views */
export function sanitizePlain(text: string | undefined, opts: { removeStrings?: string[]; hideProperties?: boolean; alwaysHideKeys?: string[] } = {}): string {
  const { removeStrings = [], hideProperties = false, alwaysHideKeys = [] } = opts;
  let raw = String(text ?? '');
  if (removeStrings && removeStrings.length) {
    for (const rs of removeStrings) if (rs) raw = raw.split(rs).join('');
  }
  const noForced = raw.split('\n').filter((line) => !isForcedHiddenPropLine(line, alwaysHideKeys)).join('\n').trimEnd();
  if (!hideProperties) return noForced;
  return noForced.split('\n').filter((line) => !line.includes(':: ')).join('\n').trimEnd();
}

/** Only a block ref token present? */
export function isOnlyRef(line: string): boolean {
  return /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(line);
}

/** Only an embed macro present? */
export function isOnlyEmbed(line: string): boolean {
  return /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(line);
}
