import React from 'react';
import { Button } from '@mui/material';

export type ViewMode = 'cards' | 'list';

interface Props {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  className?: string;
  cardsLabel?: string;
  listLabel?: string;
  size?: 'small' | 'medium' | 'large';
}

const ViewModeToggle: React.FC<Props> = ({ value, onChange, className, cardsLabel = 'Cards', listLabel = 'List', size = 'small' }) => {
  return (
    <span className={className ? className : 'mini-tabs'}>
      <Button size={size} variant={value === 'cards' ? 'contained' : 'text'} onClick={() => onChange('cards')}>{cardsLabel}</Button>
      <Button size={size} variant={value === 'list' ? 'contained' : 'text'} onClick={() => onChange('list')}>{listLabel}</Button>
    </span>
  );
};

export default ViewModeToggle;
