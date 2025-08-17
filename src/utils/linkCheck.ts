// file resolution is delegated to pageLocator
import { locatePageFile } from './pageLocator';
import { buildNameCandidates } from './linkResolver';
import { getPageBlocksTree as lsGetPageBlocksTree, isLogseqAvailable } from '../services/logseqApi';

type Listener = (graph: string | undefined, name: string, value: boolean) => void;

const cache = new Map<string, boolean>();
const pending = new Set<string>();
const listeners = new Set<Listener>();

// 遅延チェック管理用
const delayedChecks = new Map<string, NodeJS.Timeout>();
const elementToCheckMap = new WeakMap<Element, Set<string>>();
const DELAY_MS = 500; // 0.5秒の遅延

const keyOf = (graph: string | undefined, name: string) => `${graph || ''}::${name}`;

export const subscribeLinkCheck = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = (graph: string | undefined, name: string, value: boolean) => { for (const l of listeners) try { l(graph, name, value); } catch {} };

export const getCachedHasContent = (graph: string | undefined, name: string): boolean | undefined => cache.get(keyOf(graph, name));

// キャッシュクリア機能を追加
export const clearLinkCheckCache = () => {
  cache.clear();
  // 遅延中のチェックもすべてキャンセル
  for (const [, timer] of delayedChecks) {
    clearTimeout(timer);
  }
  delayedChecks.clear();
  console.debug(`[linkCheck] Cache and pending checks cleared`);
};

// 特定のページのキャッシュをクリア
export const clearPageCache = (graph: string | undefined, name: string) => {
  const k = keyOf(graph, name);
  cache.delete(k);
  // 対応する遅延チェックもキャンセル
  const timer = delayedChecks.get(k);
  if (timer) {
    clearTimeout(timer);
    delayedChecks.delete(k);
  }
  console.debug(`[linkCheck] Cache cleared for ${name}`);
};

// 要素が DOM に存在するかチェック
const isElementConnected = (element: Element): boolean => {
  return element.isConnected;
};

// ページが非表示になった場合のクリーンアップ
const handleVisibilityChange = () => {
  if (document.hidden) {
    console.debug(`[linkCheck] Page became hidden, cancelling ${delayedChecks.size} pending checks`);
    for (const [, timer] of delayedChecks) {
      clearTimeout(timer);
    }
    delayedChecks.clear();
  }
};

// 可視性変更イベントを追加（初回のみ）
if (typeof document !== 'undefined') {
  const docAny = document as any;
  if (!docAny.__linkCheckListenerAdded) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    docAny.__linkCheckListenerAdded = true;
  }
}

// 遅延チェックをキャンセル
const cancelDelayedCheck = (key: string) => {
  const timer = delayedChecks.get(key);
  if (timer) {
    clearTimeout(timer);
    delayedChecks.delete(key);
    console.debug(`[linkCheck] Cancelled delayed check for ${key}`);
    return true;
  }
  return false;
};

// Intersection Observer で要素の可視性を監視（オプション機能）
let intersectionObserver: IntersectionObserver | null = null;

const initIntersectionObserver = () => {
  if (typeof window === 'undefined' || intersectionObserver) return;
  
  try {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            // 要素が画面から消えた場合、関連するチェックをキャンセル
            const checks = elementToCheckMap.get(entry.target);
            if (checks) {
              console.debug(`[linkCheck] Element left viewport, cancelling ${checks.size} checks`);
              for (const checkKey of checks) {
                cancelDelayedCheck(checkKey);
              }
              checks.clear();
              elementToCheckMap.delete(entry.target);
            }
            // 監視を停止
            intersectionObserver?.unobserve(entry.target);
          }
        }
      },
      {
        // 要素が完全に画面から消えた時のみ反応
        threshold: 0,
        // 少し余裕を持たせる
        rootMargin: '-10px'
      }
    );
  } catch (error) {
    console.debug('[linkCheck] Failed to create IntersectionObserver:', error);
    intersectionObserver = null;
  }
};

// 要素の監視を開始
const observeElement = (element: Element) => {
  if (!intersectionObserver) {
    initIntersectionObserver();
  }
  if (intersectionObserver) {
    intersectionObserver.observe(element);
  }
};

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
  let hasRenderableContent = false;
  
  for (const L of lines) {
    const l = (L || '').replace(/\r/g, '');
    
    // Always hide keys check
    if (alwaysHideKeys.some(k => k && new RegExp(`^\\s*${k}:: `).test(l))) continue;
    
    // Properties check - but be more lenient
    if (hideProperties && /^\s*\w+\s*::\s*/.test(l)) continue;
    
    // Queries check
    if (hideQueries && /\{\{\s*query\b/i.test(l)) continue;
    
    // Renderers check
    if (hideRenderers && /\{\{\s*renderer\b/i.test(l)) continue;
    
    // Skip empty lines
    if (/^\s*$/.test(l)) continue;
    
    // Skip pure reference blocks
    const onlyRef = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\(\([0-9a-fA-F-]{36}\)\)\s*$/.test(l);
    if (onlyRef) continue;
    
    // Skip pure embed blocks
    const onlyEmbed = /^(?:\s*(?:[-*+]\s+|\d+\.\s+)?)?(?:\s*\[(?:x|X| )\]\s*)?\s*\{\{\s*embed\b[^}]*\}\}\s*$/i.test(l);
    if (onlyEmbed) continue;
    
    // Skip front-matter delimiters
    if (l.trim() === '---') continue;
    
    // Skip common metadata lines that might not be properties
    if (/^\s*(title|tags|alias|aliases|created|updated|id|public)\s*::\s*/i.test(l)) {
      if (!hideProperties) {
        hasRenderableContent = true;
        break;
      }
      continue;
    }
    
    // If we reach here, it's likely renderable content
    const trimmed = l.trim();
    if (trimmed.length > 0) {
      console.debug(`[linkCheck] Found renderable line: "${trimmed.substring(0, 50)}..."`);
      hasRenderableContent = true;
      break;
    }
  }
  
  console.debug(`[linkCheck] textHasRenderable result: ${hasRenderableContent}, total lines: ${lines.length}`);
  return hasRenderableContent;
};

const performHasContentCheck = async (
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
        if (!isLogseqAvailable()) {
          console.debug(`[linkCheck] Logseq not available for: ${name}`);
          return; // skip when Logseq is not available
        }
        
        // APIモードでも候補名を生成して複数の名前で試す
        const candidates = buildNameCandidates(name);
        console.debug(`[linkCheck] Checking page via API: ${name}, candidates: ${candidates.length}`);
        
        let tree: any[] | null = null;
        let foundCandidate = '';
        
        // 候補を順番に試す
        for (const candidate of candidates) {
          try {
            tree = await lsGetPageBlocksTree(candidate);
            if (tree && Array.isArray(tree) && tree.length > 0) {
              foundCandidate = candidate;
              console.debug(`[linkCheck] API success with candidate: ${candidate}`);
              break;
            }
          } catch (err) {
            console.debug(`[linkCheck] API failed for candidate ${candidate}:`, err);
            continue;
          }
        }
        
        let has = false;
        const walk = (arr: any[]) => {
          for (const b of arr) {
            const content = (b?.content || '').toString();
            if (textHasRenderable(content, env)) { 
              has = true; 
              return; 
            }
            if (has) return; 
            if (b.children && b.children.length) walk(b.children);
            if (has) return;
          }
        };
        
        if (Array.isArray(tree)) {
          walk(tree);
          console.debug(`[linkCheck] API result for ${name} (${foundCandidate}): tree length=${tree.length}, hasContent=${has}`);
        } else {
          console.debug(`[linkCheck] API returned no valid tree for ${name} with any candidate`);
        }
        
        cache.set(k, !!has);
        emit(graph, name, !!has);
      } catch (error) {
        console.debug(`[linkCheck] API error for ${name}:`, error);
        // APIでエラーの場合、存在しないとみなす
        cache.set(k, false);
        emit(graph, name, false);
      }
      return;
    }
    
    // folder mode: 共通ロケーターを使用
    try {
      console.debug(`[linkCheck] Checking page via folder: ${name}`);
      // scanFallback: trueに変更して、より広くファイルを検索
      const located = await locatePageFile(name, env.pagesDirHandle || undefined, env.journalsDirHandle || undefined, { scanFallback: true });
      if (!located) { 
        console.debug(`[linkCheck] File not found for: ${name}`);
        cache.set(k, false); 
        emit(graph, name, false); 
        return; 
      }
      console.debug(`[linkCheck] Found file for ${name}: ${located.picked}`);
      const text = await located.file.text();
      const ok = textHasRenderable(text, env);
      console.debug(`[linkCheck] Content check for ${name}: hasRenderable=${ok}, textLength=${text.length}`);
      cache.set(k, !!ok);
      emit(graph, name, !!ok);
    } catch (error) {
      console.debug(`[linkCheck] Folder error for ${name}:`, error);
    }
  } finally {
    pending.delete(k);
  }
};

export const ensureHasContentChecked = (
  graph: string | undefined,
  name: string,
  env: CheckEnv,
  element?: Element
): void => {
  const k = keyOf(graph, name);
  
  // 既にキャッシュされているかチェック中の場合は何もしない
  if (cache.has(k) || pending.has(k)) return;
  
  // 既に遅延チェックが予定されている場合はキャンセル
  cancelDelayedCheck(k);
  
  // 要素が提供されている場合は追跡する
  if (element) {
    let checks = elementToCheckMap.get(element);
    if (!checks) {
      checks = new Set();
      elementToCheckMap.set(element, checks);
    }
    checks.add(k);
    
    // Intersection Observer で要素を監視開始
    observeElement(element);
  }
  
  console.debug(`[linkCheck] Scheduling delayed check for: ${name} in ${DELAY_MS}ms`);
  
  // 遅延タイマーを設定
  const timer = setTimeout(async () => {
    // タイマーマップから削除
    delayedChecks.delete(k);
    
    // 要素が提供されている場合、まだDOMに存在するかチェック
    if (element && !isElementConnected(element)) {
      console.debug(`[linkCheck] Element no longer connected, cancelling check for: ${name}`);
      // 要素の追跡も削除
      const checks = elementToCheckMap.get(element);
      if (checks) {
        checks.delete(k);
        if (checks.size === 0) {
          elementToCheckMap.delete(element);
        }
      }
      return;
    }
    
    console.debug(`[linkCheck] Executing delayed check for: ${name}`);
    await performHasContentCheck(graph, name, env);
    
    // チェック完了後に要素の追跡を削除
    if (element) {
      const checks = elementToCheckMap.get(element);
      if (checks) {
        checks.delete(k);
        if (checks.size === 0) {
          elementToCheckMap.delete(element);
        }
      }
    }
  }, DELAY_MS);
  
  // タイマーを記録
  delayedChecks.set(k, timer);
};

// モジュールクリーンアップ用の関数をエクスポート
export const cleanupLinkCheck = () => {
  // すべての遅延チェックをキャンセル
  for (const [, timer] of delayedChecks) {
    clearTimeout(timer);
  }
  delayedChecks.clear();
  
  // Intersection Observer を停止
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  
  // WeakMapは自動ガベージコレクションに任せる
  
  console.debug('[linkCheck] Cleanup completed');
};
