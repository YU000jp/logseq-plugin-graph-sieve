// 共通のテキスト整形ユーティリティ

/**
 * タスク状態トークンをチェックボックス表記へ正規化
 * 例: TODO -> [ ] / DONE -> [x] / CANCELED -> [-]
 */
export function normalizeTaskLines(text: string, enable: boolean): string {
  if (!enable) return text;
  const statusRe = /^(\s*)([-*+]\s+)?(TODO|DOING|NOW|LATER|WAITING|IN-PROGRESS|HABIT|START|STARTED|DONE|CANCELED|CANCELLED)\s+/i;
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) return line; // コードブロックはそのまま
      const m = line.match(statusRe);
      if (!m) return line;
      // 既にチェックボックスがある場合は変更しない
      if (/^\s*[-*+]\s+\[[ xX-]\]/.test(line)) return line;
      const status = (m[3] || '').toUpperCase();
      const done = /DONE/.test(status);
      const cancel = /CANCEL/.test(status);
      const box = done ? '[x]' : cancel ? '[-]' : '[ ]';
      return line.replace(statusRe, `${m[1] || ''}${m[2] || ''}${box} `);
    })
    .join('\n');
}

/**
 * Logseq マクロ {{...}} を除去（alsoQueries=true の場合は {{query ...}} も除去）
 */
export function removeMacroTokens(text: string, enable: boolean, alsoQueries: boolean): string {
  if (!enable) return text;
  let t = text;
  const macroRe = alsoQueries ? /\{\{[^}]*\}\}/g : /\{\{(?!\s*query)[^}]*\}\}/ig;
  t = t.replace(macroRe, '');
  return t.replace(/\n{2,}/g, '\n');
}

/**
 * [[Page]] の括弧を外す（単純置換）
 */
export function stripPageBrackets(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, '$1');
}

/**
 * 連続空行の圧縮や末尾空白の除去など軽い後処理
 */
export function tidyPlainText(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
