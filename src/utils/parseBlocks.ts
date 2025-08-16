import type { BlockNode } from './blockText';
import { stripLogbook as stripLogbookUtil } from './content';

/**
 * 生テキストを BlockNode 配列へざっくり変換する簡易パーサ。
 * - 先頭のフロントマター(--- ... ---)を除去
 * - LOGBOOK を除去
 * - インデント幅で階層化（箇条書きの有無に関わらず先頭インデントで推定）
 * - 行頭の箇条書きトークン(-,*,+,1.) は視認用に除去
 */
export function parseBlocksFromText(text: string): BlockNode[] {
  if (!text) return [];
  let src = text;
  src = src.replace(/^---[\s\S]*?---\s*/m, '');
  src = stripLogbookUtil(src);
  const lines = src.split(/\r?\n/);

  type T = { indent: number; content: string; children: T[] };
  const root: T = { indent: -1, content: '', children: [] };
  const stack: T[] = [root];
  const indentOf = (s: string) => (s.match(/^\s*/)?.[0].length || 0);
  const asContent = (s: string) => s.replace(/^\s*([-*+]\s+|\d+\.\s+)?/, '');

  for (const raw of lines) {
    const line = raw.replace(/\r/g, '');
    if (!line.trim()) continue;
    const indent = indentOf(line);
    const node: T = { indent, content: asContent(line), children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack[stack.length - 1].children as T[]).push(node);
    stack.push(node);
  }

  const toBlock = (n: T): BlockNode => ({ content: n.content, children: n.children.map(toBlock) });
  return root.children.map(toBlock);
}
