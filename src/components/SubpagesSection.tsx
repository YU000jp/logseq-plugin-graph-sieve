import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Box } from '../db';
import BoxCard from './BoxCard';

type Props = {
  parentName: string;
  items: Box[];
  currentGraph: string;
  preferredDateFormat: string;
  onClick: (box: Box, e: React.MouseEvent<HTMLDivElement>) => void;
};

const SubpagesSection: React.FC<Props> = ({ parentName, items, currentGraph, preferredDateFormat, onClick }) => {
  const { t } = useTranslation();
  if (!items || items.length === 0) return null;
  return (
    <div className='sidebar-subpages'>
  <div className='subpages-title'>{t('subpages')}</div>
      <div className='cards-grid'>
        {items.map((box) => {
          const short = box.name.startsWith(parentName + '/') ? box.name.slice(parentName.length + 1) : box.name;
          return (
            <BoxCard
              key={`sub-${box.graph}-${box.name}`}
              box={box}
              selected={false}
              currentGraph={currentGraph}
              preferredDateFormat={preferredDateFormat}
              onClick={onClick}
              displayName={short}
            />
          );
        })}
      </div>
    </div>
  );
};

export default SubpagesSection;
