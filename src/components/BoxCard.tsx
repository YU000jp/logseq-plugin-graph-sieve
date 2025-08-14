import React, { memo } from 'react';
import StarIcon from '@mui/icons-material/Star';
import type { Box } from '../db';

interface Props {
  box: Box;
  selected: boolean;
  currentGraph: string;
  preferredDateFormat: string;
  onClick: (box: Box, e: React.MouseEvent<HTMLDivElement>) => void;
  displayName?: string; // optional: override title shown on the card
}

// 時刻はカード上では使用しないため削除（日時フォーマットは preferredDateFormat 任せ）

const BoxCardComp: React.FC<Props> = ({ box, selected, currentGraph, preferredDateFormat: _preferredDateFormat, onClick, displayName }) => {
  const title = displayName ?? box.name;
  const totalLines = box.summary?.length || 0;
  const maxPreviewLines = 12; // 表示したい視覚行数（line-clamp 用）
  // clamp 判定は論理行数で近似（折り返しは未計測）
  const truncated = totalLines > maxPreviewLines;
  // テキスト: 多すぎる場合は安全のため上限 (例: 400 行) まで
  const joined = (box.summary || []).slice(0, 400).join('\n');
  // 文字数カウント (全 summary ベース / 改行含む)
  return (
    <div className={'box card-modern' + (selected ? ' selectedBox' : '') + (box.archived ? ' archived' : '')} onClick={e => onClick(box, e)} id={box.uuid}>
      <div className='card-head'>
        <div className='card-title' title={title}>{title}</div>
        {box.favorite && <span className='card-badge fav' title='Favorite'><StarIcon fontSize='inherit' /></span>}
        {box.archived && <span className='card-badge archived-badge' title='Archived'>A</span>}
      </div>
      {box.image && (
        <div className='card-media'>
          <img src={currentGraph.replace('logseq_local_', '') + '/assets/' + box.image} alt='(image)' loading='lazy' />
        </div>
      )}
      {(!box.image && box.summary && box.summary.length > 0) && (
        <div className={'card-body' + (truncated ? ' truncated' : '')} data-lines={totalLines} data-max={maxPreviewLines}>
          <div className='card-body-text'>{joined}</div>
        </div>
      )}
  <div className='card-meta'></div>
    </div>
  );
};

const areEqual = (prev: Props, next: Props) => {
  const pb = prev.box, nb = next.box;
  const boxEqual = (
    pb.graph === nb.graph &&
    pb.name === nb.name &&
    (pb.uuid || '') === (nb.uuid || '') &&
    (pb.favorite || false) === (nb.favorite || false) &&
    (pb.archived || false) === (nb.archived || false) &&
    (pb.image || '') === (nb.image || '') &&
    (pb.time || 0) === (nb.time || 0) &&
    // summary は参照一致で十分（変更時は新配列が入ることが多い）
    pb.summary === nb.summary
  );
  return boxEqual &&
    prev.selected === next.selected &&
    prev.currentGraph === next.currentGraph &&
    (prev.displayName || '') === (next.displayName || '') &&
    prev.preferredDateFormat === next.preferredDateFormat;
};

export const BoxCard = memo(BoxCardComp, areEqual);
export default BoxCard;
