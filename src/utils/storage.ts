// localStorage の安全な薄いラッパー

export function getString(key: string, def = ''): string {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v;
  } catch {
    return def;
  }
}

export function setString(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}

export function getBoolean(key: string, def = false): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? def : v === 'true';
  } catch {
    return def;
  }
}

export function setBoolean(key: string, val: boolean): void {
  try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
}

export function getNumber(key: string, def = 0): number {
  try {
    const s = localStorage.getItem(key);
    if (s === null || s === '') return def;
    const n = Number(s);
    return Number.isFinite(n) ? n : def;
  } catch {
    return def;
  }
}

export function setNumber(key: string, val: number): void {
  try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
}

export function getJSON<T>(key: string, def: T): T {
  try {
    const s = localStorage.getItem(key);
    if (!s) return def;
    return JSON.parse(s) as T;
  } catch {
    return def;
  }
}

export function setJSON<T>(key: string, val: T): void {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}

export function remove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
