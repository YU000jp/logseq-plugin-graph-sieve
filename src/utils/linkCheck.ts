// file resolution is delegated to pageLocator
import { locatePageFile } from './pageLocator';
import { getPageBlocksTree as lsGetPageBlocksTree, isLogseqAvailable } from '../services/logseqApi';

type Listener = (graph: string | undefined, name: string, value: boolean) => void;

const cache = new Map<string, boolean>();
const pending = new Set<string>();
const listeners = new Set<Listener>();

const keyOf = (graph: string | undefined, name: string) => `${graph || ''}::${name}`;

export const subscribeLinkCheck = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = (graph: string | undefined, name: string, value: boolean) => { for (const l of listeners) try { l(graph, name, value); } catch {} };

export const getCachedHasContent = (graph: string | undefined, name: string): boolean | undefined => cache.get(keyOf(graph, name));

export type CheckEnv = {
  mode: 'folder' | 'api';
  pagesDirHandle?: FileSystemDirectoryHandle | null;
  journalsDirHandle?: FileSystemDirectoryHandle | null;
  // 軽量フィルタ（概ね BlockList のフィルタと同等）
  hideProperties?: boolean;
  hideQueries?: boolean;
  hideRenderers?: boolean;
  alwaysHideKeys?: string[];
};

const textHasRenderable = (text: string, opts: { hideProperties?: boolean; hideQueries?: boolean; hideRenderers?: boolean; alwaysHideKeys?: string[] } = {}) => {
  const { hideProperties, hideQueries, hideRenderers, alwaysHideKeys = [] } = opts;
  const lines = (text || '').split('\n');
  for (const L of lines) {
    const l = (L || '').replace(/\r/g, '');
    if (alwaysHideKeys.some(k => k && new RegExp(`^\\s*${k}:: `).test(l))) continue;
    if (hideProperties && l.includes(':: ')) continue;
    if (hideQueries && /\{\{\s*query\b/i.test(l)) continue;
    if (hideRenderers && /\{\{\s*renderer\b/i.test(l)) continue;
    if (/^\s*$/.test(l)) continue;
    // 純参照/埋め込み
    const onlyRef = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(l);
    const onlyEmbed = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(l);
    if (onlyRef || onlyEmbed) continue;
    return true;
  }
  return false;
};

export const ensureHasContentChecked = async (
  graph: string | undefined,
  name: string,
  env: CheckEnv
): Promise<void> => {
  const k = keyOf(graph, name);
  if (cache.has(k) || pending.has(k)) return;
  pending.add(k);
  try {
  if (env.mode === 'api') {
      try {
    if (!isLogseqAvailable()) return; // skip when Logseq is not available
    const tree: any[] | null = await lsGetPageBlocksTree(name).catch(() => null as any);
        let has = false;
        const walk = (arr: any[]) => {
          for (const b of arr) {
            const content = (b?.content || '').toString();
            if (textHasRenderable(content, env)) { has = true; return; }
            if (has) return; if (b.children && b.children.length) walk(b.children);
            if (has) return;
          }
        };
        if (Array.isArray(tree)) walk(tree);
        cache.set(k, !!has);
        emit(graph, name, !!has);
      } catch {}
      return;
    }
    // folder mode: 共通ロケーターを使用
    try {
      const located = await locatePageFile(name, env.pagesDirHandle || undefined, env.journalsDirHandle || undefined, { scanFallback: false });
      if (!located) { cache.set(k, false); emit(graph, name, false); return; }
      const text = await located.file.text();
      const ok = textHasRenderable(text, env);
      cache.set(k, !!ok);
      emit(graph, name, !!ok);
    } catch {}
  } finally {
    pending.delete(k);
  }
};
