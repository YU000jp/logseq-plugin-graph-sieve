import { logger } from '../logger';

export type PageTuple = [string, string, number | undefined, boolean | undefined];

/**
 * 軽量ページ一覧 (original-name/title, uuid, updatedAt, journal?) を取得
 * datascriptQuery を優先し、失敗時は Editor.getAllPages にフォールバック
 */
export async function queryPagesBasic(): Promise<PageTuple[]> {
  // Datascript での軽量クエリ
  try {
    const q: any[] = await logseq.DB.datascriptQuery(`
      [:find (pull ?p [:block/uuid :block/original-name :block/title :block/updated-at :block/journal?])
       :where [?p :block/uuid ?u]]`);
    const tuples = (Array.isArray(q) ? q : []).map(row => {
      const m = row && row[0] ? row[0] : {};
      const name = m['original-name'] || m['title'] || '';
      const uuid = m['uuid'] || '';
      const updated = m['updated-at'] || 0;
      const journal = m['journal?'];
      return [name, uuid, updated, journal] as PageTuple;
    });
    if (tuples.length > 0) return tuples;
  } catch (e) {
    logger.warn('datascriptQuery failed, falling back to getAllPages()', e);
  }
  // フォールバック: Editor.getAllPages
  const pages = await logseq.Editor.getAllPages();
  if (!pages) return [];
  return pages.map((p: any) => [p.originalName || p.title, p.uuid, p.updatedAt, p['journal?']] as PageTuple);
}

/**
 * ページのブロックツリー取得（uuid でも originalName でもどちらでも可）。
 * エラー時は null を返す。
 */
export async function getPageBlocksTreeSafe(uuidOrName: string): Promise<any[] | null> {
  try {
    // 1st try: as-is (uuid or nameどちらでも試す)
    let blocks = await logseq.Editor.getPageBlocksTree(uuidOrName);
    if (Array.isArray(blocks) && blocks.length > 0) return blocks;
    // UUIDらしければ originalName を解決して再試行
    const looksUuid = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(uuidOrName);
    if (looksUuid) {
      try {
        const page = await logseq.Editor.getPage(uuidOrName);
        const name = (page as any)?.originalName || (page as any)?.name || '';
        if (name) {
          blocks = await logseq.Editor.getPageBlocksTree(name);
          if (Array.isArray(blocks) && blocks.length >= 0) return blocks || [];
        }
      } catch {/* ignore */}
    }
    // 名前の揺れにも対処: %2F をデコード、journals/ を外す
    if (!looksUuid) {
      const candidates = Array.from(new Set([
        uuidOrName,
        uuidOrName.replace(/%2F/gi,'/'),
        uuidOrName.replace(/^journals\//,''),
        uuidOrName.replace(/%2F/gi,'/').replace(/^journals\//,'')
      ].filter(s => !!s)));
      for (const cand of candidates) {
        try {
          blocks = await logseq.Editor.getPageBlocksTree(cand);
          if (Array.isArray(blocks)) return blocks;
        } catch {/* ignore */}
      }
    }
    return Array.isArray(blocks) ? blocks : [];
  } catch (err) {
    logger.debug('getPageBlocksTree failed for', uuidOrName, err);
    return null;
  }
}
