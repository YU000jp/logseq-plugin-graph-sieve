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
      [:find ?name ?uuid ?updated ?journal
        :where
        (or
          [?p :block/original-name ?name]
          [?p :block/title ?name])
        [?p :block/uuid ?uuid]
        (or
          [?p :block/updated-at ?updated]
          [(identity 0) ?updated])
        (or
          [?p :block/journal? ?journal]
          (not [?p :block/journal? true]))]`);
    const tuples = (Array.isArray(q) ? q : []).map(r => [r[0], r[1], r[2], r[3]] as PageTuple);
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
    const blocks = await logseq.Editor.getPageBlocksTree(uuidOrName);
    return Array.isArray(blocks) ? blocks : [];
  } catch (err) {
    logger.debug('getPageBlocksTree failed for', uuidOrName, err);
    return null;
  }
}
