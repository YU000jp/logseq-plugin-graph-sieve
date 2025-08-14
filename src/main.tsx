import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./main.css";
import "@logseq/libs";
import "./i18n/configs";
// import { SimpleCommandKeybinding } from '@logseq/libs/dist/LSPlugin'

const openCardBox = () => {
	logseq.showMainUI();
};

function main() {
	// Ctrl+Shift+Enter or Command+Shift+Enter
	/*
  logseq.App.registerCommandShortcut(
    { binding: 'mod+shift+enter' },
    () => logseq.showMainUI(),
    );
  */
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
      <a class="button" data-on-click="openCardBox" title="CardBox">
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
		// bind model for toolbar button click
		logseq.provideModel({ openCardBox });
	})
	.catch(console.error);
