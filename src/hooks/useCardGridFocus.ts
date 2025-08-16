import { useCallback, useRef } from 'react';

/**
 * カードグリッド（.box.card-modern）向けの共通フォーカス/初期化フック。
 * - コンテナクリック時に、カード以外をクリックしたら先頭カードへフォーカス
 * - 矢印キー開始時に現在フォーカスがなければ先頭カードを選択
 */
export function useCardGridFocus() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const getCards = useCallback((): HTMLDivElement[] => {
    const c = containerRef.current; if (!c) return [];
    return Array.from(c.querySelectorAll<HTMLDivElement>('.box.card-modern'));
  }, []);

  const focusFirst = useCallback(() => {
    const cards = getCards();
    if (cards.length > 0) (cards[0] as HTMLElement).focus();
  }, [getCards]);

  const onContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const hitCard = target.closest('.box.card-modern');
    if (!hitCard) focusFirst();
  }, [focusFirst]);

  const ensureCardFocus = useCallback(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !el.closest('.box.card-modern')) focusFirst();
  }, [focusFirst]);

  return { containerRef, onContainerClick, ensureCardFocus, getCards, focusFirst } as const;
}
