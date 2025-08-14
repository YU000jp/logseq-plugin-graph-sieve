import { MutableRefObject, useEffect } from 'react';

/**
 * タイルグリッドの自動行高さ・列数測定を行い、スクロールに応じたロード量計算に反映する。
 */
export function useTileGridMeasure(params: {
  tileRef: MutableRefObject<HTMLDivElement | null>;
  tileGridHeight: number;
  measuredRowHeightRef: { current: number };
  tileColumnSize: number;
  setTileColumnSize: (n: number) => void;
  tileRowSize: number;
  setTileRowSize: (n: number) => void;
  setMaxBoxNumber: (fn: (cur: number) => number) => void;
}) {
  const { tileRef, tileGridHeight, measuredRowHeightRef, tileColumnSize, setTileColumnSize, tileRowSize, setTileRowSize, setMaxBoxNumber } = params;

  useEffect(() => {
    const handleScroll = () => {
      if (!tileRef.current) return;
      const rh = measuredRowHeightRef.current || tileGridHeight;
      const scrollTop = tileRef.current.scrollTop;
      const scrolledRows = Math.floor(scrollTop / rh);
      const columnSize = tileColumnSize || 1;
      const rowsInAScreen = tileRowSize || 1;
      const loadScreensAhead = 3;
      const targetRows = rowsInAScreen + scrolledRows + rowsInAScreen * loadScreensAhead;
      const limit = columnSize * targetRows;
      setMaxBoxNumber((current) => (current < limit ? limit : current));
    };
    const el = tileRef.current;
    if (el) el.addEventListener('scroll', handleScroll);
    return () => {
      if (el) el.removeEventListener('scroll', handleScroll);
    };
  }, [tileRowSize, tileColumnSize, tileRef.current]);

  useEffect(() => {
    if (!tileRef.current) return;
    tileRef.current.style.gridAutoRows = `${tileGridHeight}px`;
    const computeRowHeight = () => {
      if (!tileRef.current) return;
      const first = tileRef.current.querySelector('.box') as HTMLElement | null;
      if (first) {
        const h = first.getBoundingClientRect().height + 16; // include margin
        measuredRowHeightRef.current = h;
        const container = tileRef.current;
        const width = container.clientWidth;
        const boxW = first.getBoundingClientRect().width;
        if (boxW > 0) {
          const cols = Math.max(1, Math.floor(width / boxW));
          if (cols !== tileColumnSize) setTileColumnSize(cols);
          const rows = Math.max(1, Math.floor(container.clientHeight / h));
          if (rows !== tileRowSize) setTileRowSize(rows);
        }
      }
    };
    computeRowHeight();
    const ro = new ResizeObserver(() => computeRowHeight());
    ro.observe(tileRef.current);
    const onResize = () => computeRowHeight();
    window.addEventListener('resize', onResize);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', onResize);
    };
  }, [tileRef.current, tileGridHeight, tileColumnSize, tileRowSize]);
}
