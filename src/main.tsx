import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./main.css";
import "@logseq/libs";
import i18n from "./i18n/configs";
import { db } from './db';
// import { SimpleCommandKeybinding } from '@logseq/libs/dist/LSPlugin'

const openCardBox = () => {
	logseq.showMainUI();
};

// Logseq の言語設定と i18n を同期
const syncI18nWithLogseq = async () => {
	try {
		// ユーザー設定から言語タグを取得（preferredLanguage / preferredLocale のいずれか）
		const cfg: any = await logseq.App.getUserConfigs();
		const tagRaw = String(cfg?.preferredLanguage || cfg?.preferredLocale || '').trim();
		const tag = tagRaw.toLowerCase();
		// Logseqの可能性がある言語タグをi18nキーにマップ
		const mapTag = (t: string): string => {
			if (!t) return 'en';
			if (t.startsWith('ja')) return 'ja';
			if (t.startsWith('en')) return 'en';
			if (t.startsWith('de')) return 'de';
			if (t.startsWith('fr')) return 'fr';
			if (t.startsWith('zh-tw') || t === 'zh_hant' || t === 'zh-hant') return 'zh-TW';
			if (t.startsWith('zh') || t === 'zh_cn' || t === 'zh-hans') return 'zh-CN';
			if (t.startsWith('ko')) return 'ko';
			return 'en';
		};
		const lng = mapTag(tag);
		if (i18n.language !== lng) await i18n.changeLanguage(lng);
	} catch {
		// 非Logseq環境などのフォールバック（ブラウザの言語）
		const nav = (navigator.language || '').toLowerCase();
		const lng = nav.startsWith('ja') ? 'ja'
			: nav.startsWith('de') ? 'de'
			: nav.startsWith('fr') ? 'fr'
			: nav.startsWith('zh-tw') ? 'zh-TW'
			: nav.startsWith('zh') ? 'zh-CN'
			: nav.startsWith('ko') ? 'ko'
			: 'en';
		if (i18n.language !== lng) await i18n.changeLanguage(lng);
	}
};

async function main() {
	// Ctrl+Shift+Enter or Command+Shift+Enter
	/*
  logseq.App.registerCommandShortcut(
    { binding: 'mod+shift+enter' },
    () => logseq.showMainUI(),
    );
  */

	// 初回レンダー前に言語を同期してフラッシュを防止
	await syncI18nWithLogseq();
	// It might be more in line with the Logseq way to register it in the command palette.
	// In this case, it's also possible to assign a name to the shortcut."
	// const command: {
	//   key: string;
	//   keybinding: SimpleCommandKeybinding
	//   label: string;
	// } = {
	//   key: 'sieve:open',
	//   keybinding: {
	//     binding: 'mod+shift+enter',
	//     mode: 'global',
	//   },
	//   label: 'Open CardBox',
	// };
	// logseq.App.registerCommandPalette(command, openCardBox);

	logseq.setMainUIInlineStyle({
		position: "fixed",
		zIndex: 20,
	});

		// Register toolbar button (remove side menu entry)
	logseq.App.registerUIItem("toolbar", {
		key: "sieve-open",
		template: `
				<a class="button" data-on-click="openCardBox" title="${i18n.t('toolbar-cardbox-title')}">
        <span class="ui__icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>
          </svg>
        </span>
      </a>
    `,
	});

	document.body.addEventListener("click", (e) => {
		if ((e.target as HTMLElement).classList.length === 0) {
			// stopPropagation on <Dialog> is ignored because click event on body is fired first.
			// So, check if the click event is fired on <Dialog> or not.
			logseq.hideMainUI({ restoreEditingCursor: true });
		}
	});

	document.getElementById("app")!.addEventListener("click", (e) => {
		e.stopPropagation();
	});

	ReactDOM.createRoot(document.getElementById("app")!).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>
	);
}

// bootstrap
logseq
	.ready(
		{
			openCardBox,
		},
		main
	)
	.then(() => {
		// 言語同期（起動時）
		void syncI18nWithLogseq();
		// UI 表示毎に言語再同期（Logseq 側の言語切り替え反映）
		try {
			logseq.on('ui:visible:changed', (e: any) => { if (e?.visible) void syncI18nWithLogseq(); });
		} catch {}
		// Clear synthetic folder-mode caches on plugin load to avoid stale tiles across sessions
		(async () => {
			try {
				await db.box.where('graph').startsWith('fs_').delete();
			} catch (e) {
				console.warn('Failed to clear synthetic cache', e);
			}
		})();
		// bind model for toolbar button click
		logseq.provideModel({ openCardBox });
	})
	.catch(console.error);
