import { useEffect } from 'react';

/**
 * グローバルタブ（.global-tabs-row .preview-tabs）の中で active タブを見える位置に自動スクロール。
 */
export function useAutoScrollActiveTab(deps: any[]) {
  useEffect(() => {
    try {
      const bar = document.querySelector('.global-tabs-row .preview-tabs');
      if (!bar) return;
      const active = bar.querySelector('.preview-tab.active') as HTMLElement | null;
      if (!active) return;
      const barEl = bar as HTMLElement;
      const aLeft = active.offsetLeft;
      const aRight = aLeft + active.offsetWidth;
      const vLeft = barEl.scrollLeft;
      const vRight = vLeft + barEl.clientWidth;
      if (aLeft < vLeft) {
        barEl.scrollTo({ left: aLeft - 16, behavior: 'smooth' });
      } else if (aRight > vRight) {
        barEl.scrollTo({ left: aRight - barEl.clientWidth + 16, behavior: 'smooth' });
      }
    } catch {/* ignore */}
  }, deps);
}
