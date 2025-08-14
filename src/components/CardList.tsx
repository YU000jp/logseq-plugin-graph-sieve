import React, { memo } from 'react';
import type { Box } from '../db';
import BoxCard from './BoxCard';

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
};

const CardListComp: React.FC<CardListProps> = ({
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
}) => {
  if (!items || items.length === 0) return null;
  const cls = className ? `${gridClassName} ${className}` : gridClassName;
  const content = items.map((b, idx) => (
    <BoxCard
      key={`${keyPrefix}-${b.graph}-${b.name}`}
      box={b}
      selected={isSelected ? !!isSelected(b, idx) : false}
      currentGraph={currentGraph}
      preferredDateFormat={preferredDateFormat}
      onClick={onClick}
      displayName={displayNameFor ? displayNameFor(b) : undefined}
    />
  ));
  if (!wrapper) return <>{content}</>;
  return <div className={cls}>{content}</div>;
};

export const CardList = memo(CardListComp);
export default CardList;
