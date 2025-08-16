import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Box } from '../db';
import CardList, { CardListHandle } from './CardList';

type Props = {
  parentName: string;
  items: Box[];
  currentGraph: string;
  preferredDateFormat: string;
  onClick: (box: Box, e: React.MouseEvent<HTMLDivElement>) => void;
};

const SubpagesSection: React.FC<Props> = ({ parentName, items, currentGraph, preferredDateFormat, onClick }) => {
  const { t } = useTranslation();
  const cardRef = React.useRef<CardListHandle | null>(null);
  if (!items || items.length === 0) return null;
  return (
    <div className='sidebar-subpages'>
  <div className='subpages-title'>{t('subpages')}</div>
      <div onMouseDown={(e)=>{ if ((e.target as HTMLElement).closest('.box.card-modern')) return; try { (cardRef.current as any)?.focusFirst?.(); } catch {} }}>
      <CardList
        items={items}
        currentGraph={currentGraph}
        preferredDateFormat={preferredDateFormat}
        onClick={onClick}
        displayNameFor={(b) => (b.name.startsWith(parentName + '/') ? b.name.slice(parentName.length + 1) : b.name)}
        keyPrefix='sub'
        ref={cardRef}
      />
      </div>
    </div>
  );
};

export default SubpagesSection;
