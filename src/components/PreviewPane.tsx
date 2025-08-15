import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FormControlLabel, IconButton, Switch, TextField, Tooltip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import Clear from '@mui/icons-material/Clear';
import { ContentCopy } from '@mui/icons-material';
import type { Box } from '../db';
import CardList from './CardList';
import { BlockList, hasRenderableContent } from './BlockList';
import { PlainTextView, RawCustomView, blocksToPlainText, outlineTextFromBlocks, flattenBlocksToText, type BlockNode } from '../utils/blockText';
import { normalizeTaskLines as normalizeTaskLinesUtil, removeMacroTokens as removeMacroTokensUtil } from '../utils/text';
import { setString } from '../utils/storage';
import { isJournalName } from '../utils/journal';

export type PreviewTab = 'content' | 'nomark' | 'outline' | 'raw-custom';

export interface PreviewPaneProps {
  box: Box;
  blocks: any[] | null;
  loading: boolean;
  tab: PreviewTab;
  onSetTab: (tab: PreviewTab) => void;
  displayTitle: (name: string) => string;
  onToggleFavorite: (box: Box, fav: boolean) => void;
  onToggleArchive: (box: Box, arch: boolean) => void;
  onOpenPage: (name: string) => void;
  onCloseActive: () => void;

  // Filters and options
  showSettings: boolean;
  onToggleSettings: () => void;
  hideProperties: boolean;
  setHideProperties: (v: boolean) => void;
  stripPageBrackets: boolean;
  setStripPageBrackets: (v: boolean) => void;
  hidePageRefs: boolean;
  setHidePageRefs: (v: boolean) => void;
  hideQueries: boolean;
  setHideQueries: (v: boolean) => void;
  hideRenderers: boolean;
  setHideRenderers: (v: boolean) => void;
  removeMacros: boolean;
  setRemoveMacros: (v: boolean) => void;
  normalizeTasks: boolean;
  setNormalizeTasks: (v: boolean) => void;
  alwaysHidePropKeys: string;
  setAlwaysHidePropKeys: (v: string) => void;
  removeStringsRaw: string;
  setRemoveStringsRaw: (v: string) => void;
  alwaysHideKeys: string[];
  removeStrings: string[];

  // Context
  currentGraph: string;
  preferredDateFormat: string;
  assetsDirHandle?: FileSystemDirectoryHandle;

  // Related content
  subpages: Box[];
  subpagesDeeper: boolean;
  related: Box[];
  onClickBox: (b: Box) => void;

  // Layout hover state
  hoveredSidePane: null | 'sub' | 'rel';
  setHoveredSidePane: (v: null | 'sub' | 'rel' | ((p: null | 'sub' | 'rel') => null | 'sub' | 'rel')) => void;
}

const PreviewPane: React.FC<PreviewPaneProps> = (props) => {
  const { t } = useTranslation();
  const {
    box: sidebarBox,
    blocks: sidebarBlocks,
    loading: sidebarLoading,
    tab: sidebarTab,
    onSetTab,
    displayTitle,
    onToggleFavorite: toggleFavorite,
    onToggleArchive: toggleArchive,
    onOpenPage: openPageInPreviewByName,
    onCloseActive: closeActivePreview,
    showSettings: showSidebarSettings,
  onToggleSettings,
    hideProperties,
    setHideProperties,
    stripPageBrackets,
    setStripPageBrackets,
    hidePageRefs,
    setHidePageRefs,
  hideQueries,
  hideRenderers,
    setHideQueries,
  setHideRenderers,
    removeMacros,
    setRemoveMacros,
    normalizeTasks,
    setNormalizeTasks,
    alwaysHidePropKeys,
    setAlwaysHidePropKeys,
    removeStringsRaw,
    setRemoveStringsRaw,
    alwaysHideKeys,
    removeStrings,
    currentGraph,
    preferredDateFormat,
  assetsDirHandle,
  subpages,
  subpagesDeeper,
  related,
    onClickBox: boxOnClick,
  hoveredSidePane,
  setHoveredSidePane,
  } = props;

  const folderMode = currentGraph.startsWith('fs_');
  const normalizeTaskLines = (text: string, enable: boolean) => normalizeTaskLinesUtil(text, enable);
  const removeMacroTokens = (text: string, enable: boolean, alsoQueries: boolean) => removeMacroTokensUtil(text, enable, alsoQueries);
  const [copyHover, setCopyHover] = useState(false);

  // Breadcrumb builder
  const breadcrumb = useMemo(() => {
    const rawName = sidebarBox.name || '';
    let segments = rawName.replace(/%2F/gi, '/').split('/').filter(Boolean);
    if (segments.length === 1) {
      const dt = displayTitle(rawName);
      if (dt !== rawName) {
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(dt)) {
          const [y, m, d] = dt.split('/');
          segments = [y, m, d];
        } else {
          segments[0] = dt;
        }
      }
    } else {
      for (let i = 0; i < segments.length; i++) {
        const maybe = displayTitle(segments.slice(0, i + 1).join('/'));
        if (maybe.includes('/') && maybe.split('/').length === 3) segments[i] = maybe.split('/').slice(-1)[0];
      }
    }
    const rawSegmentsBase = rawName.split('/').filter(Boolean);
    const isJournalSingle = /^\d{4}_[0-1]\d_[0-3]\d$/.test(rawSegmentsBase[0]) && segments.length === 3;
    const rawSegments = isJournalSingle ? [rawSegmentsBase[0]] : rawSegmentsBase;
    const journalVirtualPaths = isJournalSingle ? (() => {
      const [y, m, d] = segments;
      return [y, `${y}/${m}`, `${y}/${m}/${d}`];
    })() : [];
    const crumbs: React.ReactNode[] = [];
    for (let i = 0; i < segments.length; i++) {
      const label = segments[i];
      const targetName = isJournalSingle ? journalVirtualPaths[i] : rawSegments.slice(0, i + 1).join('/');
      const displayFull = isJournalSingle ? journalVirtualPaths[i] : segments.slice(0, i + 1).join('/');
      crumbs.push(
        <a key={`crumb-${i}`} href='#' className='crumb'
          onClick={(e) => { e.preventDefault(); void openPageInPreviewByName(targetName); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openPageInPreviewByName(targetName); } }}
          tabIndex={0} title={displayFull}><span className='crumb-text'>{label}</span></a>
      );
      if (i < segments.length - 1) crumbs.push(<span key={`sep-${i}`} className='sep'> / </span>);
    }
    return <div className='breadcrumb'>{crumbs}</div>;
  }, [sidebarBox.name, displayTitle, openPageInPreviewByName]);

  const isJournalPreview = isJournalName(sidebarBox.name);

  return (
    <div className={'sidebar-inner' + (sidebarBox.archived ? ' archived' : '')}>
      <div className='sidebar-header'>
        <div className='sidebar-left'>
          <Tooltip title={t('close') as string}>
            <IconButton size='small' onClick={closeActivePreview} title={t('close')} className='header-close-btn'><Clear fontSize='small' /></IconButton>
          </Tooltip>
        </div>
        <div className='sidebar-title' title={displayTitle(sidebarBox.name)}>{breadcrumb}</div>
        <div className='sidebar-controls'>
          <Tooltip title={sidebarBox.favorite ? (t('unfavorite') || 'Unfavorite') : (t('favorite') || 'Favorite')}><IconButton size='small' onClick={() => toggleFavorite(sidebarBox, !sidebarBox.favorite)} aria-label='favorite-toggle'>{sidebarBox.favorite ? <StarIcon fontSize='small' style={{ color: '#f5b301' }} /> : <StarBorderIcon fontSize='small' />}</IconButton></Tooltip>
          <Tooltip title={sidebarBox.archived ? 'Unarchive' : 'Archive'}><IconButton size='small' onClick={() => toggleArchive(sidebarBox, !sidebarBox.archived)} aria-label='archive-toggle'>{sidebarBox.archived ? <Inventory2Icon fontSize='small' /> : <Inventory2OutlinedIcon fontSize='small' />}</IconButton></Tooltip>
        </div>
      </div>
      <div className='sidebar-nav'>
        <div className='sidebar-row sidebar-row--tabs'>
          <div className='sidebar-tabs'>
            <Button size='small' variant={sidebarTab === 'content' ? 'contained' : 'text'} onClick={() => onSetTab('content')}>{t('tab-content')}</Button>
            <Button size='small' variant={sidebarTab === 'nomark' ? 'contained' : 'text'} onClick={() => onSetTab('nomark')}>{t('tab-no-markdown')}</Button>
            <Button size='small' variant={sidebarTab === 'outline' ? 'contained' : 'text'} onClick={() => onSetTab('outline')}>{t('tab-raw')}</Button>
            <span className='tabs-spacer' />
            <Tooltip title={(t('settings') as string) || 'Settings'}><IconButton size='small' onClick={() => onToggleSettings()} aria-label='toggle-settings'><SettingsIcon fontSize='small' color={showSidebarSettings ? 'primary' : 'inherit'} /></IconButton></Tooltip>
          </div>
        </div>
  {showSidebarSettings && <div className='sidebar-row sidebar-row--filters small-text'>
          <FormControlLabel className='prop-filter' disabled={false} control={<Switch size='small' checked={hideProperties} onChange={(_, v) => setHideProperties(v)} />} label={t('toggle-hide-properties')} />
          <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark'} control={<Switch size='small' checked={stripPageBrackets} onChange={(_, v) => setStripPageBrackets(v)} />} label={t('toggle-strip-page-brackets') || 'Strip [[ ]]'} />
          <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={!hidePageRefs} onChange={(_, v) => setHidePageRefs(!v)} />} label={t('toggle-page-links') || t('toggle-hide-page-refs') || 'Page links'} />
          <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={hideQueries} onChange={(_, v) => setHideQueries(v)} />} label={t('toggle-hide-queries') || 'Hide queries'} />
          <FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={hideRenderers} onChange={(_, v) => setHideRenderers(v)} />} label={t('toggle-hide-renderers') || 'Hide renderers'} />
          <Tooltip title={t('toggle-remove-macros-help') || 'Remove {{macro ...}} constructs (except queries unless hidden)'}><span><FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} control={<Switch size='small' checked={removeMacros} onChange={(_, v) => setRemoveMacros(v)} />} label={t('toggle-remove-macros') || 'Remove macros'} /></span></Tooltip>
          <Tooltip title={t('toggle-normalize-tasks-help') || 'Convert TODO/DONE etc. to Markdown checkboxes'}><span><FormControlLabel className='prop-filter' disabled={sidebarTab === 'nomark'} control={<Switch size='small' checked={normalizeTasks} onChange={(_, v) => setNormalizeTasks(v)} />} label={t('toggle-normalize-tasks') || 'Normalize tasks'} /></span></Tooltip>
        </div>}
  {showSidebarSettings && <div className='sidebar-row sidebar-row--options small-text'>
          <TextField size='small' label={t('always-hide-props')} placeholder={t('always-hide-props-ph')} value={alwaysHidePropKeys} disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} onChange={(e) => { const v = e.target.value; setAlwaysHidePropKeys(v); setString('alwaysHideProps', v); }} InputProps={{ inputProps: { spellCheck: false } }} style={{ minWidth: '220px' }} />
          <TextField size='small' label={t('remove-strings')} placeholder={t('remove-strings-ph')} value={removeStringsRaw} disabled={sidebarTab === 'nomark' || sidebarTab === 'outline'} onChange={(e) => { setRemoveStringsRaw(e.target.value); }} InputProps={{ inputProps: { spellCheck: false } }} style={{ minWidth: '220px', marginLeft: '8px' }} />
        </div>}
        <div className='sidebar-row sidebar-row--actions'>
          <div className='sidebar-actions' style={{ marginLeft: 'auto', justifyContent: 'flex-end' }}>
            {(() => { const canCopy = !((sidebarTab !== 'content' && sidebarTab !== 'nomark' && sidebarTab !== 'outline' && sidebarTab !== 'raw-custom') || sidebarLoading || !(sidebarBlocks && sidebarBlocks.length > 0)); return (
            <Button size='small' variant='outlined' startIcon={<ContentCopy fontSize='small' />} disabled={!canCopy} onMouseEnter={() => { if (canCopy) setCopyHover(true); }} onMouseLeave={() => setCopyHover(false)} onFocus={() => { if (canCopy) setCopyHover(true); }} onBlur={() => setCopyHover(false)} onClick={async () => {
              if (!sidebarBlocks) return;
              let text: string;
              if (sidebarTab === 'nomark') {
                text = blocksToPlainText(sidebarBlocks as BlockNode[], hideProperties, true, 0, alwaysHideKeys, folderMode, removeStrings);
              } else if (sidebarTab === 'outline') {
                text = outlineTextFromBlocks((sidebarBlocks || []) as BlockNode[], { hideProperties, hideReferences: true, alwaysHideKeys, hideQueries, removeStrings, stripPageBrackets });
              } else {
                text = flattenBlocksToText(sidebarBlocks as BlockNode[], hideProperties, true, 0, alwaysHideKeys, folderMode, removeStrings);
              }
              if (hideRenderers) text = text.replace(/\{\{\s*renderer\b[^}]*\}\}/ig, '');
              if (sidebarTab !== 'outline') {
                text = text.split('\n').filter(l => l.trim().length > 0).join('\n');
                if (stripPageBrackets) {
                  text = text.replace(/\[\[([^\]]+)\]\]/g, '$1')
                    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                    .replace(/\[\[([^\]]+)\]\[([^\]]*)\]\]/g, (_, u, txt) => txt || u);
                }
                if (hideQueries) text = text.replace(/\{\{\s*query[^}]*\}\}/ig, '');
                if (removeMacros) text = removeMacroTokens(text, true, hideQueries);
                if (removeStrings.length) { for (const rs of removeStrings) if (rs) text = text.split(rs).join(''); }
                if (normalizeTasks) text = normalizeTaskLines(text, true);
                text = text.replace(/\n{2,}/g, '\n').replace(/ +/g, ' ').trim();
              } else {
                if (normalizeTasks) text = normalizeTaskLines(text, true);
                text = text.replace(/\n{2,}/g, '\n').replace(/ +/g, ' ').trim();
              }
              try {
                if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
                else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
                const lg = (window as any).logseq;
                if (lg && lg.UI && typeof lg.UI.showMsg === 'function') lg.UI.showMsg(t('copied'));
              } catch (e) {
                console.error(e);
                const lg = (window as any).logseq;
                if (lg && lg.UI && typeof lg.UI.showMsg === 'function') lg.UI.showMsg(t('copy-failed'));
              }
            }}>{t('copy-content')}</Button> ); })()}
          </div>
        </div>
      </div>
      <div className='sidebar-body' tabIndex={0}>
        {(() => {
          let subpagesPresent = subpages && subpages.length > 0;
          const subSet = new Set(subpages.map(s => `${s.graph}::${s.name}`));
          const filteredRelated = related.filter(r => !subSet.has(`${r.graph}::${r.name}`));
          let relatedPresent = filteredRelated.length > 0;
          if (isJournalPreview) { subpagesPresent = false; relatedPresent = false; }
          let mainFlex = 1, subFlex = 0, relFlex = 0;
          if (!subpagesPresent && !relatedPresent) {
            mainFlex = 1;
          } else if (subpagesPresent && relatedPresent) {
            mainFlex = 8; subFlex = 1; relFlex = 1;
            if (hoveredSidePane === 'sub') { mainFlex = 6; subFlex = 3; relFlex = 1; }
            else if (hoveredSidePane === 'rel') { mainFlex = 6; subFlex = 1; relFlex = 3; }
          } else if (subpagesPresent) {
            mainFlex = hoveredSidePane === 'sub' ? 6 : 8; subFlex = hoveredSidePane === 'sub' ? 3 : 2;
          } else if (relatedPresent) {
            mainFlex = hoveredSidePane === 'rel' ? 6 : 8; relFlex = hoveredSidePane === 'rel' ? 3 : 2;
          }
          return (
            <>
              <div className={'sidebar-pane sidebar-pane-main'} style={{ flex: mainFlex }}>
                <div className={'sidebar-main-text' + (copyHover ? ' copy-target-hover' : '')}>
                  {sidebarLoading ? <div className='sidebar-loading'>{t('loading-content')}</div> : sidebarTab === 'content' ? (() => {
                    const has = hasRenderableContent((sidebarBlocks || []) as BlockNode[], hideProperties, true, alwaysHideKeys, hidePageRefs, hideQueries, removeStrings, hideRenderers);
                    if (has) {
                      return <BlockList blocks={sidebarBlocks || []} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} currentGraph={currentGraph} onOpenPage={openPageInPreviewByName} folderMode={folderMode} stripPageBrackets={stripPageBrackets} hidePageRefs={hidePageRefs} hideQueries={hideQueries} hideRenderers={hideRenderers} assetsDirHandle={assetsDirHandle} removeStrings={removeStrings} normalizeTasks={normalizeTasks} />;
                    }
                    // ジャーナルは refs/queries のみで構成されることがあるためフォールバックで本文表示
                    if (isJournalPreview) {
                      return <PlainTextView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={false} alwaysHideKeys={alwaysHideKeys} folderMode={folderMode} stripPageBrackets={stripPageBrackets} hideQueries={false} removeStrings={removeStrings} />;
                    }
                    // 空配列/nullの時は空表示
                    if (!sidebarBlocks || (Array.isArray(sidebarBlocks) && sidebarBlocks.length === 0)) {
                      return <div className='sidebar-empty'>{t('no-content')}</div>;
                    }
                    return <PlainTextView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} folderMode={folderMode} stripPageBrackets={stripPageBrackets} hideQueries={hideQueries} removeStrings={removeStrings} />;
                  })() : sidebarTab === 'nomark' ? <PlainTextView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} folderMode={folderMode} stripPageBrackets={stripPageBrackets} hideQueries={hideQueries} removeStrings={removeStrings} /> : sidebarTab === 'outline' ? <RawCustomView blocks={(sidebarBlocks || []) as BlockNode[]} hideProperties={hideProperties} hideReferences={true} alwaysHideKeys={alwaysHideKeys} stripPageBrackets={stripPageBrackets} hideQueries={hideQueries} removeStrings={removeStrings} folderMode={folderMode} normalizeTasks={normalizeTasks} /> : null}
                </div>
              </div>
        {subpagesPresent && <div className='sidebar-pane sidebar-pane-subpages' style={{ flex: subFlex }} onMouseEnter={() => setHoveredSidePane('sub')} onMouseLeave={() => setHoveredSidePane(p => p === 'sub' ? null : p)}>
                <div className='sidebar-subpages'>
                  <div className='subpages-title'>{t('subpages')}</div>
          {subpagesDeeper && <div className='subpages-notice'>{t('subpages-deeper-notice')}</div>}
          <CardList
            items={subpages}
            currentGraph={currentGraph}
            preferredDateFormat={preferredDateFormat}
            onClick={boxOnClick}
            displayNameFor={(b) => displayTitle(b.name)}
            keyPrefix='sub'
          />
                </div>
              </div>}
        {relatedPresent && <div className='sidebar-pane sidebar-pane-related' style={{ flex: relFlex }} onMouseEnter={() => setHoveredSidePane('rel')} onMouseLeave={() => setHoveredSidePane(p => p === 'rel' ? null : p)}>
                <div className='sidebar-subpages related-subpages'>
                  <div className='subpages-title'>{t('related') || 'Related'}</div>
                  {filteredRelated.length === 0 ? <div className='sidebar-empty'>{t('no-content')}</div> : (
                    <CardList
                      items={filteredRelated}
                      currentGraph={currentGraph}
                      preferredDateFormat={preferredDateFormat}
                      onClick={boxOnClick}
                      displayNameFor={(b) => displayTitle(b.name)}
                      keyPrefix='rel'
                    />
                  )}
                </div>
              </div>}
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default PreviewPane;
