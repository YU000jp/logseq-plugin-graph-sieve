/**
 * Thin wrappers around Logseq APIs to modularize "Logseq MODE" access.
 * In non-Logseq or detached environments, these return safe fallbacks.
 */

export const isLogseqAvailable = (): boolean => {
  try {
    // @ts-ignore
    if (typeof logseq === 'undefined' || !logseq) return false;
    const detached = (window as any).__graphSieveDetachedMode;
    if (detached) return false;
    return true;
  } catch {
    return false;
  }
};

export async function datascriptQuery(query: string): Promise<any[] | null> {
  if (!isLogseqAvailable()) return null;
  try {
    // @ts-ignore
    return await logseq.DB.datascriptQuery(query);
  } catch {
    return null;
  }
}

export async function getAllPages(): Promise<any[] | null> {
  if (!isLogseqAvailable()) return null;
  try {
    // @ts-ignore
    return await logseq.Editor.getAllPages();
  } catch {
    return null;
  }
}

export async function getPageBlocksTree(idOrName: string): Promise<any[] | null> {
  if (!isLogseqAvailable()) return null;
  try {
    // @ts-ignore
    return await logseq.Editor.getPageBlocksTree(idOrName);
  } catch {
    return null;
  }
}

export async function getPage(idOrName: string): Promise<any | null> {
  if (!isLogseqAvailable()) return null;
  try {
    // @ts-ignore
    return await logseq.Editor.getPage(idOrName);
  } catch {
    return null;
  }
}

export async function getBlock(uuid: string): Promise<any | null> {
  if (!isLogseqAvailable()) return null;
  try {
    // @ts-ignore
    return await logseq.Editor.getBlock(uuid);
  } catch {
    return null;
  }
}

export function onUiVisibleChanged(handler: (e: any) => void): () => void {
  if (!isLogseqAvailable()) return () => {};
  try {
    // @ts-ignore
    logseq.on('ui:visible:changed', handler);
    return () => {
      try {
        // Some Logseq versions expose off()
        // @ts-ignore
        if (typeof logseq.off === 'function') logseq.off('ui:visible:changed', handler);
      } catch {}
    };
  } catch {
    return () => {};
  }
}

export function uiShowMsg(message: string): void {
  if (!isLogseqAvailable()) { try { console.info('[GraphSieve]', message); } catch {} return; }
  try {
    // @ts-ignore
    logseq.UI?.showMsg?.(message);
  } catch {}
}

export function hideMainUI(opts?: { restoreEditingCursor?: boolean }): void {
  if (!isLogseqAvailable()) return;
  try {
    // @ts-ignore
    logseq.hideMainUI?.(opts || { restoreEditingCursor: true });
  } catch {}
}
