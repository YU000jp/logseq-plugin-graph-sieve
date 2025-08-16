import type React from 'react';

export type OpenPageHandler = (name: string) => void | Promise<void>;

export interface OpenLinkOptions {
  stopPropagation?: boolean;
}

/**
 * カードタイルと同様の挙動でプレビューを開くための、リンク用の共通ハンドラ群を返す。
 * - 左クリック: 開く
 * - 中クリック(Aux: button===1): 開く
 * - Enter / Space: 開く（キーボード操作対応）
 */
export function getOpenPageLinkProps(name: string, onOpenPage: OpenPageHandler, opts: OpenLinkOptions = {}) {
  const { stopPropagation } = opts;
  const stop = (e: React.SyntheticEvent) => { if (stopPropagation) e.stopPropagation(); };
  return {
    href: '#',
    tabIndex: 0,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      stop(e);
      void onOpenPage(name);
    },
    onAuxClick: (e: React.MouseEvent<HTMLAnchorElement> & { button?: number }) => {
      const btn = (e as any).button;
      if (btn === 1) { // Middle click
        e.preventDefault();
        stop(e);
        void onOpenPage(name);
      }
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLAnchorElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        stop(e);
        void onOpenPage(name);
      }
    },
  } as const;
}
