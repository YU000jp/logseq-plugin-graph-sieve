import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Box } from '../db';
import CardList, { CardListHandle } from './CardList';
import HierarchyList from './HierarchyList';
import ViewModeToggle, { ViewMode } from './ViewModeToggle';

interface Props {
  title?: string;
  items: Box[];
  mode: ViewMode;
  onChangeMode: (_m: ViewMode) => void;
  currentGraph: string;
  preferredDateFormat: string;
  onClickCard: (_box: Box, _e: React.MouseEvent<HTMLDivElement>) => void;
  displayTitle: (arg0: string) => string;
  keyPrefix: string;
  highlightTitleTerms?: string[];
  bodyHighlightTerms?: string[];
  listBasePrefix?: string;
  onOpenPageByName?: (_name: string) => void;
  isSelected?: (_box: Box, _index: number) => boolean;
  getSnippet?: (_box: Box) => string | undefined;
  gridClassName?: string;
  // Folder mode: file handles for hover preview
  pagesDirHandle?: FileSystemDirectoryHandle;
  journalsDirHandle?: FileSystemDirectoryHandle;
}

const PagesSection: React.FC<Props> = ({ title = 'Pages', items, mode, onChangeMode, currentGraph, preferredDateFormat, onClickCard, displayTitle, keyPrefix, highlightTitleTerms, bodyHighlightTerms, listBasePrefix, onOpenPageByName, isSelected, getSnippet, gridClassName, pagesDirHandle, journalsDirHandle }) => {
  const { t } = useTranslation();
  const cardRef = React.useRef<CardListHandle | null>(null);
  return (
    <div className='pages-section'>
      <div className='search-header' style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className='search-title'>{title || t('pages')}</div>
        <ViewModeToggle value={mode} onChange={onChangeMode} />
      </div>
      {mode === 'cards' ? (
        <div onMouseDown={(e)=>{ if ((e.target as HTMLElement).closest('.box.card-modern')) return; try { (cardRef.current as any)?.focusFirst?.(); } catch {} }}>
        <CardList
          items={items}
          currentGraph={currentGraph}
          preferredDateFormat={preferredDateFormat}
          onClick={onClickCard}
          displayNameFor={(b) => displayTitle(b.name)}
          keyPrefix={keyPrefix}
          highlightTitleTerms={highlightTitleTerms}
          bodyHighlightTerms={bodyHighlightTerms}
          isSelected={isSelected}
          getSnippet={getSnippet}
          gridClassName={gridClassName}
          ref={cardRef}
        />
        </div>
      ) : (
        <div className='pages-list'>
          <HierarchyList
            items={items}
            displayTitle={displayTitle}
            onOpenPage={(name) => { if (onOpenPageByName) onOpenPageByName(name); }}
            basePrefix={listBasePrefix}
            enableHoverPreview={true}
            currentGraph={currentGraph}
            pagesDirHandle={pagesDirHandle}
            journalsDirHandle={journalsDirHandle}
          />
        </div>
      )}
    </div>
  );
};

export default PagesSection;
