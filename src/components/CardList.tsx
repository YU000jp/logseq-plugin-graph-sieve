import React, { memo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import type { Box } from '../db';
import BoxCard from './BoxCard';
import { useCardGridFocus } from '../hooks/useCardGridFocus';

export type CardListProps = {
  items: Box[];
  currentGraph: string;
  preferredDateFormat: string;
  onClick: (box: Box, e: React.MouseEvent<HTMLDivElement>) => void;
  // 箱ごとに表示名を決めたい場合に使用（未指定なら BoxCard 側のデフォルト: box.name）
  displayNameFor?: (box: Box) => string | undefined;
  // key の接頭辞（一覧が複数ある場合の重複回避）
  keyPrefix?: string;
  // グリッドのクラス名（既定: 'cards-grid'）
  gridClassName?: string;
  // 追加クラス
  className?: string;
  // 選択状態（必要な場合のみ）
  isSelected?: (box: Box, index: number) => boolean;
  // ラッパー DIV を出力しない（タイルグリッド内で直下に並べたいとき）
  wrapper?: boolean;
  highlightTitleTerms?: string[];
  // タイトルのハイライト用語（タイトルとスニペットにマーク）
  bodyHighlightTerms?: string[];
  // 該当スニペットを返す（未指定なら要約(summary)を表示）
  getSnippet?: (box: Box) => string | undefined;
  // お気に入り切替（例: Favoritesエリア内での解除）
  onToggleFavorite?: (box: Box, next: boolean) => void;
};

export type CardListHandle = { focusFirst: () => void };

const CardListComp = forwardRef<CardListHandle, CardListProps>(({ 
  items,
  currentGraph,
  preferredDateFormat,
  onClick,
  displayNameFor,
  keyPrefix = 'card',
  gridClassName = 'cards-grid',
  className,
  isSelected,
  wrapper = true,
  highlightTitleTerms,
  getSnippet,
  bodyHighlightTerms,
  onToggleFavorite,
}, ref) => {
  if (!items || items.length === 0) return null;
  const cls = className ? `${gridClassName} ${className}` : gridClassName;

  const gridRef = useRef<HTMLDivElement | null>(null);
  const { containerRef, onContainerClick, ensureCardFocus, focusFirst } = useCardGridFocus();

  useImperativeHandle(ref, () => ({ focusFirst }), [focusFirst]);

  // Move focus by index
  const moveFocus = useCallback((fromIndex: number, delta: number) => {
    const container = gridRef.current; if (!container) return;
    const cards = Array.from(container.querySelectorAll<HTMLDivElement>('.box.card-modern'));
    if (cards.length === 0) return;
    const next = Math.max(0, Math.min(cards.length - 1, fromIndex + delta));
    const el = cards[next]; if (el) (el as HTMLElement).focus();
  }, []);

  // Compute approximate column count by first row positions
  const getColumnCount = useCallback(() => {
    const container = gridRef.current; if (!container) return 1;
    const cards = Array.from(container.querySelectorAll<HTMLDivElement>('.box.card-modern'));
    if (cards.length <= 1) return 1;
    const firstTop = cards[0].offsetTop;
    let count = 0;
    for (const c of cards) { if (Math.abs(c.offsetTop - firstTop) < 2) count++; else break; }
    return Math.max(1, count);
  }, []);

  const onKeyDownGrid = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    ensureCardFocus();
    const target = e.target as HTMLElement;
    if (!target || !target.classList.contains('card-modern')) return;
    const container = gridRef.current; if (!container) return;
    const cards = Array.from(container.querySelectorAll<HTMLDivElement>('.box.card-modern'));
    const idx = cards.indexOf(target as HTMLDivElement); if (idx < 0) return;
    const cols = getColumnCount();
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); moveFocus(idx, 1); break;
      case 'ArrowLeft': e.preventDefault(); moveFocus(idx, -1); break;
      case 'ArrowDown': e.preventDefault(); moveFocus(idx, cols); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(idx, -cols); break;
      case 'Home': e.preventDefault(); moveFocus(idx, -idx); break;
      case 'End': {
        const last = cards.length - 1; e.preventDefault(); moveFocus(idx, last - idx); break;
      }
    }
  }, [getColumnCount, moveFocus]);

  const content = items.map((b, idx) => (
    <div key={`${keyPrefix}-${b.graph}-${b.name}`}>
      <BoxCard
        box={b}
        selected={isSelected ? !!isSelected(b, idx) : false}
        currentGraph={currentGraph}
        preferredDateFormat={preferredDateFormat}
        onClick={onClick}
        displayName={displayNameFor ? displayNameFor(b) : undefined}
        titleHighlightTerms={highlightTitleTerms}
        bodyHighlightTerms={bodyHighlightTerms}
        extraPreview={getSnippet ? getSnippet(b) : undefined}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  ));
  if (!wrapper) return <>{content}</>;
  return <div className={cls} ref={(el) => { gridRef.current = el; (containerRef as any).current = el; }} onKeyDown={onKeyDownGrid} onClick={onContainerClick}>{content}</div>;
});

export const CardList = memo(CardListComp);
export default CardList;
