import React, { useState } from 'react';
import { Button, IconButton, TextField, Tooltip } from '@mui/material';
import ClearAllIcon from '@mui/icons-material/ClearAll';

export interface PreviewTabsProps {
  previews: Array<{ box: { uuid?: string; name: string }, pinned: boolean }>;
  activeIndex: number;
  onActivate: (index: number) => void;
  onTogglePin: (index: number) => void;
  onClose: (index: number) => void;
  onCloseAll: () => void;
  maxPreviewTabs: number;
  onChangeMax: (n: number) => void;
  displayTitle: (name: string) => string;
  t: (key: string) => string;
}

const PreviewTabs: React.FC<PreviewTabsProps> = ({ previews, activeIndex, onActivate, onTogglePin, onClose, onCloseAll, maxPreviewTabs, onChangeMax, displayTitle, t }) => {
  const [hoverCloseIndex, setHoverCloseIndex] = useState<number | null>(null);

  return (
    <>
      <div className={'global-tabs-row' + (previews.length === 0 ? ' empty' : '')}>
        <div className='tabs-actions'>
          <Tooltip title={t('close-all-tabs') || 'Close all tabs'}>
            <IconButton size='small' onClick={onCloseAll} aria-label='close-all-tabs'><ClearAllIcon fontSize='small' /></IconButton>
          </Tooltip>
        </div>
        <div className='tabs-spacer' />
        <div className={'preview-tabs' + (previews.length === 0 ? ' empty' : '')}>
          {previews.length === 0 && <span style={{ padding: '2px 4px' }}>No tabs</span>}
          {previews.map((p, idx) => {
            const active = idx === activeIndex;
            return (
              <span key={p.box.uuid || p.box.name + ':' + idx} className={'preview-tab' + (active ? ' active' : '') + (p.pinned ? ' pinned' : '')}
                onMouseEnter={() => setHoverCloseIndex(idx)}
                onMouseLeave={() => setHoverCloseIndex(null)}
              >
                <Button size='small' variant={active ? 'contained' : 'text'} onClick={() => onActivate(idx)} title={displayTitle(p.box.name)} className='preview-tab-btn'>
                  <span
                    className={'tab-marker pin-marker' + (p.pinned ? ' pinned' : '')}
                    onClick={(e) => { e.stopPropagation(); onTogglePin(idx); }}
                    title={p.pinned ? 'Unpin' : 'Pin'}
                  >
                    {p.pinned ? '📌' : '•'}
                  </span>
                  <span className='tab-title-ellipsis'>{displayTitle(p.box.name)}</span>
                  <span
                    className={'tab-marker close-marker' + (hoverCloseIndex === idx ? ' visible' : '')}
                    onClick={(e) => { e.stopPropagation(); onClose(idx); }}
                    title={t('close')}
                  >
                    ×
                  </span>
                </Button>
              </span>
            );
          })}
          <div className='max-tabs-setting'>
            <TextField size='small' type='number' label='Max' variant='filled' value={maxPreviewTabs}
              onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n) && n > 0) onChangeMax(n); }}
              inputProps={{ min: 1, style: { width: 60, padding: 2 } }} style={{ marginLeft: 8 }} />
          </div>
        </div>
      </div>
    </>
  );
};

export default PreviewTabs;
