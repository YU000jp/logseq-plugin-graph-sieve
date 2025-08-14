import { useEffect } from 'react';

/**
 * UI のフォント/行間/太さを CSS 変数として注入し、Google Fonts の link も必要に応じて追加する。
 */
export function useUiTypography(uiFontFamily: string, uiFontSize: number, uiLineHeight: number, uiFontWeight: number) {
  useEffect(() => {
    const linkId = 'gsv-google-font';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (uiFontFamily && /[A-Za-z]/.test(uiFontFamily)) {
      const fam = uiFontFamily.trim().replace(/\s+/g, '+');
      const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam)}:wght@300;400;500;600;700;800&display=swap`;
      if (!link) {
        link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = href;
    } else if (link) {
      link.remove();
    }

    const styleId = 'gsv-ui-font-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const famDecl = uiFontFamily ? `"${uiFontFamily}", system-ui, sans-serif` : 'system-ui, sans-serif';
    styleEl.textContent = `#app{--gsv-font-size:${uiFontSize}px;--gsv-line-height:${uiLineHeight};--gsv-font-weight:${uiFontWeight};--gsv-font-family:${famDecl};font-size:var(--gsv-font-size);line-height:var(--gsv-line-height);font-family:var(--gsv-font-family);}`+
      `#app .card-title,#app .card-body-text,#app .sidebar-inner,#app .left-pane,#app .box{font-size:inherit;line-height:inherit;font-family:inherit;}`;
  }, [uiFontFamily, uiFontSize, uiLineHeight, uiFontWeight]);
}
