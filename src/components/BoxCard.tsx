import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import StarIcon from '@mui/icons-material/Star';
import type { Box } from '../db';

interface Props {
  box: Box;
  selected: boolean;
  currentGraph: string;
  preferredDateFormat: string;
  onClick: (box: Box, e: React.MouseEvent<HTMLDivElement>) => void;
  displayName?: string; // optional: override title shown on the card
  titleHighlightTerms?: string[]; // タイトル用ハイライト語
  bodyHighlightTerms?: string[]; // 本文スニペット用ハイライト語
  extraPreview?: string; // 本文スニペット（優先表示）
  onToggleFavorite?: (box: Box, next: boolean) => void; // お気に入りの切替（任意）
}

// 時刻はカード上では使用しないため削除（日時フォーマットは preferredDateFormat 任せ）

const BoxCardComp: React.FC<Props> = ({ box, selected, currentGraph, preferredDateFormat: _preferredDateFormat, onClick, displayName, titleHighlightTerms = [], bodyHighlightTerms = [], extraPreview, onToggleFavorite }) => {
  const rawTitle = displayName ?? box.name;
  const highlightTitle = (title: string, terms: string[]) => {
    const words = (terms || []).map(s => (s||'').trim()).filter(Boolean);
    if (words.length === 0) return title;
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp(`(${words.map(esc).join('|')})`, 'gi');
      const parts: Array<string|JSX.Element> = [];
      let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(title)) !== null) {
        const s = m.index; const e = s + m[0].length;
        if (s > last) parts.push(title.slice(last, s));
        parts.push(<mark key={`thl-${s}`} className='hl'>{m[0]}</mark>);
        last = e;
        if (re.lastIndex === s) re.lastIndex++;
      }
      if (last < title.length) parts.push(title.slice(last));
      return <>{parts}</>;
    } catch { return title; }
  };
  const title = highlightTitle(rawTitle, titleHighlightTerms);
  const totalLines = box.summary?.length || 0;
  const maxPreviewLines = 12; // 表示したい視覚行数（line-clamp 用）
  // clamp 判定は論理行数で近似（折り返しは未計測）
  const truncated = totalLines > maxPreviewLines;
  // テキスト: 多すぎる場合は安全のため上限 (例: 400 行) まで
  const joined = (box.summary || []).slice(0, 400).join('\n');
  // 本文スニペットのハイライト
  const highlightSnippet = (text: string, terms: string[]) => {
    if (!text) return text;
    const words = (terms || []).map(s => (s||'').trim()).filter(Boolean);
    if (words.length === 0) return text;
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const re = new RegExp(`(${words.map(esc).join('|')})`, 'gi');
      const parts: Array<string|JSX.Element> = [];
      let last = 0; let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const s = m.index; const e = s + m[0].length;
        if (s > last) parts.push(text.slice(last, s));
        parts.push(<mark key={`bhl-${s}`} className='hl'>{m[0]}</mark>);
        last = e;
        if (re.lastIndex === s) re.lastIndex++;
      }
      if (last < text.length) parts.push(text.slice(last));
      return <>{parts}</>;
    } catch { return text; }
  };
  // Remove lines that contain unwanted properties: background-color:: or id:: (also tolerate single colon)
  const sanitizeLines = (text: string): string => {
    if (!text) return text;
    const lines = text.split(/\r?\n/);
    const re = /(^|\s)(background-color|id)\s*::?/i;
    return lines.filter(l => !re.test(l)).join('\n');
  };
  const extraPreviewSanitized = extraPreview ? sanitizeLines(extraPreview) : undefined;
  const joinedSanitized = sanitizeLines(joined);
  const previewContent = extraPreviewSanitized ? highlightSnippet(extraPreviewSanitized, bodyHighlightTerms) : joinedSanitized;
  // 文字数カウント (全 summary ベース / 改行含む)
  const { t } = useTranslation();
  return (
    <div
      className={'box card-modern' + (selected ? ' selectedBox' : '') + (box.archived ? ' archived' : '')}
      onClick={e => onClick(box, e)}
      id={box.uuid}
      role='button'
      tabIndex={0}
      onKeyDown={(e) => {
        const k = e.key;
        if (k === 'Enter' || k === ' ') { e.preventDefault(); onClick(box, e as any); return; }
        // Arrow navigation will be handled at parent grid using data-index; allow bubbling
      }}
    >
      <div className='card-head'>
        <div className='card-title' title={typeof title === 'string' ? title : rawTitle}>{title}</div>
        {box.favorite && (
          onToggleFavorite
            ? <span
                className='card-badge fav'
                title='Unfavorite'
                role='button'
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(box, false); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleFavorite(box, false); } }}
              >
                <StarIcon fontSize='inherit' />
              </span>
            : <span className='card-badge fav' title={t('favorite') as string}><StarIcon fontSize='inherit' /></span>
        )}
  {box.archived && <span className='card-badge archived-badge' title={(t('archive') as string) || 'Archived'}>A</span>}
      </div>
      {box.image && (
        <div className='card-media'>
          <img src={currentGraph.replace('logseq_local_', '') + '/assets/' + box.image} alt='(image)' loading='lazy' />
        </div>
      )}
    {(!box.image && (extraPreview || (box.summary && box.summary.length > 0))) && (
        <div className={'card-body' + (truncated ? ' truncated' : '')} data-lines={totalLines} data-max={maxPreviewLines}>
      <div className='card-body-text'>{previewContent}</div>
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
  prev.preferredDateFormat === next.preferredDateFormat &&
  JSON.stringify(prev.titleHighlightTerms || []) === JSON.stringify(next.titleHighlightTerms || []) &&
  (prev.extraPreview || '') === (next.extraPreview || '');
};

export const BoxCard = memo(BoxCardComp, areEqual);
export default BoxCard;
