import { definePlugin, DialogButton, Field, findClassModule } from 'millennium';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { downloadAll, subscribePending } from './downloads';

const MAIN_WINDOW_NAME = 'SP Desktop_uid0';
const MARKER_ATTR = 'data-download-all';

// Steam's CSS class names are hashed per build, so look them up by key.
const downloadsClasses = () => findClassModule((m) => m.DownloadsPage && m.TopSection && m.RemoveAllButton) as any;

const DownloadIcon = () => (
	<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
		<path d="M11 3h2v10.17l3.59-3.58L18 11l-6 6-6-6 1.41-1.41L11 13.17V3zM4 19h16v2H4z" />
	</svg>
);

const DownloadAllButton = () => {
	const [pending, setPending] = useState<number[]>([]);

	useEffect(() => subscribePending(setPending), []);

	const classes = downloadsClasses();
	const count = pending.length;

	return (
		<DialogButton
			className={classes?.RemoveAllButton}
			style={{ minWidth: 0, margin: 0 }}
			disabled={count === 0}
			onClick={() => downloadAll()}
		>
			{count > 0 ? `Download All (${count})` : 'All Up to Date'}
		</DialogButton>
	);
};

function injectInto(doc: Document) {
	const classes = downloadsClasses();
	if (!classes) return;

	const topSection = doc.querySelector(`.${classes.DownloadsPage} .${classes.TopSection}`);
	if (!topSection || topSection.querySelector(`[${MARKER_ATTR}]`)) return;

	const container = doc.createElement('div');
	container.setAttribute(MARKER_ATTR, '');
	Object.assign(container.style, { position: 'absolute', right: '16px', bottom: '16px', zIndex: '5' });
	topSection.appendChild(container);
	createRoot(container).render(<DownloadAllButton />);
}

// The Downloads page is mounted and unmounted as the user navigates, so watch the
// main window and re-inject whenever the header appears without our button.
function watchWindow(win: Window) {
	const doc = win?.document;
	if (!doc?.body || (doc.body as any).__downloadAllWatched) return;
	(doc.body as any).__downloadAllWatched = true;

	let scheduled = false;
	new MutationObserver(() => {
		if (scheduled) return;
		scheduled = true;
		win.requestAnimationFrame(() => {
			scheduled = false;
			injectInto(doc);
		});
	}).observe(doc.body, { childList: true, subtree: true });
	injectInto(doc);
}

function onPopup(popup: any) {
	if (popup?.m_strName !== MAIN_WINDOW_NAME) return;
	const win = popup.window ?? popup.m_popup;
	if (win?.document?.body) {
		watchWindow(win);
	} else {
		win?.addEventListener?.('load', () => watchWindow(win), { once: true });
	}
}

export default definePlugin(() => {
	const popupManager = (window as any).g_PopupManager;
	const existing = popupManager?.GetExistingPopup?.(MAIN_WINDOW_NAME);
	if (existing) onPopup(existing);
	popupManager?.AddPopupCreatedCallback?.(onPopup);

	return {
		title: 'Download All',
		icon: <DownloadIcon />,
		content: <Field label="Adds a Download All button to the Downloads page header." />,
	};
});
