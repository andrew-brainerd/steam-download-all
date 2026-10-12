const MAIN_WINDOW_NAME = 'SP Desktop_uid0';
const MARKER_ATTR = 'data-download-all';

export type DownloadsClasses = { DownloadsPage: string; TopSection: string; RemoveAllButton: string };

export const isDownloadsClassModule = (m: any): boolean =>
	!!m && typeof m === 'object' && 'DownloadsPage' in m && 'TopSection' in m && 'RemoveAllButton' in m;

export const BUTTON_STYLE = {
	width: 'auto',
	whiteSpace: 'nowrap',
	minWidth: '0',
	margin: '0',
	padding: '10px 24px',
	fontSize: '16px',
	lineHeight: '20px',
	textTransform: 'none',
} as const;

type Mount = (container: HTMLElement, classes: DownloadsClasses) => void;

function injectInto(doc: Document, getClasses: () => DownloadsClasses | undefined, mount: Mount) {
	const classes = getClasses();
	if (!classes) return;

	const selector = (value: string) => `.${value.split(' ')[0]}`;
	const topSection = doc.querySelector(`${selector(classes.DownloadsPage)} ${selector(classes.TopSection)}`);
	if (!topSection || topSection.querySelector(`[${MARKER_ATTR}]`)) return;

	const container = doc.createElement('div');
	container.setAttribute(MARKER_ATTR, '');
	Object.assign(container.style, { position: 'absolute', right: '16px', bottom: '16px', zIndex: '5' });
	topSection.appendChild(container);
	mount(container, classes);
}

function watchWindow(win: Window, getClasses: () => DownloadsClasses | undefined, mount: Mount) {
	const doc = win?.document;
	if (!doc?.body || (doc.body as any).__downloadAllWatched) return;
	(doc.body as any).__downloadAllWatched = true;

	let scheduled = false;
	new MutationObserver(() => {
		if (scheduled) return;
		scheduled = true;
		win.requestAnimationFrame(() => {
			scheduled = false;
			injectInto(doc, getClasses, mount);
		});
	}).observe(doc.body, { childList: true, subtree: true });
	injectInto(doc, getClasses, mount);
}

export function watchDownloadsHeader(getClasses: () => DownloadsClasses | undefined, mount: Mount) {
	const onPopup = (popup: any) => {
		if (popup?.m_strName !== MAIN_WINDOW_NAME) return;
		const win = popup.window ?? popup.m_popup;
		if (win?.document?.body) {
			watchWindow(win, getClasses, mount);
		} else {
			win?.addEventListener?.('load', () => watchWindow(win, getClasses, mount), { once: true });
		}
	};

	const popupManager = (window as any).g_PopupManager;
	const existing = popupManager?.GetExistingPopup?.(MAIN_WINDOW_NAME);
	if (existing) onPopup(existing);
	popupManager?.AddPopupCreatedCallback?.(onPopup);
}
