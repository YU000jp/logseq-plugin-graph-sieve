import { format } from 'date-fns';
import React from 'react';
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

const getTimeString = (unixTime: number) => {
  const date = new Date(unixTime);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};

export const BoxCard: React.FC<Props> = ({ box, selected, currentGraph, preferredDateFormat, onClick, displayName }) => {
  return (
    <div className={'box' + (selected ? ' selectedBox' : '') + (box.archived ? ' archived' : '')} onClick={e => onClick(box, e)} id={box.uuid}>
      <div className='box-title'>
  {displayName ?? box.name}
  {box.favorite ? <StarIcon fontSize='inherit' style={{ color: '#f5b301', float: 'right', marginRight: 4 }} /> : null}
      </div>
      <div className='box-summary' style={{ display: box.image === '' ? 'block' : 'none' }}>
        {box.summary.map((item, i) => (<React.Fragment key={i}>{item}<br /></React.Fragment>))}
      </div>
      <div className='box-image' style={{ display: box.image !== '' ? 'block' : 'none' }}>
        <img src={currentGraph.replace('logseq_local_', '') + '/assets/' + box.image} style={{ width: '140px' }} alt='(image)' />
      </div>
      <div className='box-date' style={{ display: 'none' }}>
        {format(box.time, preferredDateFormat)} {getTimeString(box.time)}
      </div>
    </div>
  );
};

export default BoxCard;
