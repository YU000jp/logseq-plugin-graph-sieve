import { useEffect } from 'react';

type BoxLike = { name: string; uuid?: string; graph: string };

export function useKeyboardNavigation(opts: {
  loading: boolean;
  tileRef: React.RefObject<HTMLDivElement | null>;
  selectedBoxRef: React.MutableRefObject<number>;
  setSelectedBox: React.Dispatch<React.SetStateAction<number>>;
  visibleMainBoxes: BoxLike[];
  openInSidebar: (box: any) => Promise<void> | void;
}) {
  const { loading, tileRef, selectedBoxRef, setSelectedBox, visibleMainBoxes, openInSidebar } = opts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      const activeEl = document.activeElement as HTMLElement | null;
      const isTyping = !!activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (isTyping) return;

      const tile = document.getElementById('tile');
      if (!tile?.hasChildNodes()) return;

      const tileWidth = tile.clientWidth - 24 * 2; // horizontal padding
      const tileHeight = tile.offsetHeight;
      const tileTop = tile.offsetTop;
      const first = tile.children[0] as HTMLElement | undefined;
      if (!first) return;
      const boxMarginRight = parseInt(window.getComputedStyle(first).getPropertyValue('margin-right'));
      const boxWidth = first.offsetWidth + 10 + boxMarginRight; // margin-left is 10px
      const boxHeight = first.offsetHeight + 20; // vertical margins total
      const cols = Math.max(1, Math.floor(tileWidth / boxWidth));
      const rows = Math.max(1, Math.floor(tileHeight / boxHeight));

      switch (e.key) {
        case 'ArrowUp': {
          tileRef.current?.focus();
          setSelectedBox((sel) => {
            const ni = sel - cols;
            if (ni < 0) return sel;
            const boxTop = (tile.children[sel] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop;
            if (Math.floor(boxTop / boxHeight) <= 1) (tile as any).scrollBy(0, -boxHeight);
            return ni;
          });
          return;
        }
        case 'ArrowDown': {
          tileRef.current?.focus();
          setSelectedBox((sel) => {
            const ni = sel + cols;
            if (ni >= tile.childElementCount) return sel;
            const boxTop = (tile.children[sel] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop;
            if (Math.floor(boxTop / boxHeight) >= rows - 1) (tile as any).scrollBy(0, boxHeight);
            return ni;
          });
          return;
        }
        case 'ArrowRight': {
          tileRef.current?.focus();
          setSelectedBox((sel) => {
            const ni = sel + 1;
            if (ni >= tile.childElementCount) return sel;
            if (Math.floor(sel / cols) !== Math.floor(ni / cols)) {
              const boxTop = (tile.children[sel] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop;
              if (Math.floor(boxTop / boxHeight) >= rows - 1) (tile as any).scrollBy(0, boxHeight);
            }
            return ni;
          });
          return;
        }
        case 'ArrowLeft': {
          tileRef.current?.focus();
          setSelectedBox((sel) => {
            const ni = sel - 1;
            if (ni < 0) return sel;
            if (Math.floor(sel / cols) !== Math.floor(ni / cols)) {
              const boxTop = (tile.children[sel] as HTMLElement).offsetTop - tileTop - 10 - tile.scrollTop;
              if (Math.floor(boxTop / boxHeight) <= 1) (tile as any).scrollBy(0, -boxHeight);
            }
            return ni;
          });
          return;
        }
        case 'Enter': {
          const idx = selectedBoxRef.current;
          if (idx < 0) return;
          const card = visibleMainBoxes[idx];
          if (!card) return;
          if ((e as any).shiftKey) {
            (window as any).logseq?.App?.pushState?.('page', { name: card.name });
            (window as any).logseq?.hideMainUI?.({ restoreEditingCursor: true });
            return;
          }
          if ((e as any).altKey) {
            const dup: BoxLike = { ...card, uuid: ((card.uuid || card.name) + ':' + Date.now()) } as any;
            void openInSidebar(dup);
          } else {
            void openInSidebar(card);
          }
          return;
        }
        case 'Escape': {
          (window as any).logseq?.hideMainUI?.({ restoreEditingCursor: true });
          return;
        }
        default: {
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, tileRef, selectedBoxRef, setSelectedBox, visibleMainBoxes, openInSidebar]);
}
