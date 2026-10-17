import { configureDownloads, downloadAll, subscribePending } from '../../shared/downloads';
import { BUTTON_STYLE, DownloadsClasses, isDownloadsClassModule, watchDownloadsHeader } from '../../shared/downloads-header';

declare global {
	interface Window {
		__downloadAll?: 'loaded' | 'steam-ui-not-ready';
		__downloadAllUpdate?: string;
		__downloadAllUpdateRequested?: boolean;
	}
}

let webpackRequire: any;
const moduleExports = new Map<string, any>();

function getModuleExports(): any[] {
	if (!webpackRequire) {
		(window as any).webpackChunksteamui.push([[Symbol('download-all')], {}, (r: any) => (webpackRequire = r)]);
	}
	for (const id of Object.keys(webpackRequire?.m ?? {})) {
		if (moduleExports.has(id)) continue;
		try {
			moduleExports.set(id, webpackRequire(id));
		} catch {
			moduleExports.set(id, undefined);
		}
	}
	return [...moduleExports.values()].filter(Boolean);
}

function findModuleExport(filter: (e: any) => boolean): any {
	for (const exports of getModuleExports()) {
		if (typeof exports !== 'object') continue;
		try {
			if (filter(exports)) return exports;
		} catch {}
		for (const key of Object.keys(exports)) {
			try {
				const value = exports[key];
				if (value && filter(value)) return value;
			} catch {}
		}
	}
	return undefined;
}

let classes: DownloadsClasses | undefined;
const getClasses = () => (classes ??= findModuleExport(isDownloadsClassModule));

function mountUpdateButton(container: HTMLElement, cls: DownloadsClasses) {
	const button = container.ownerDocument.createElement('button');
	button.type = 'button';
	button.className = `DialogButton ${cls.RemoveAllButton}`;
	Object.assign(button.style, BUTTON_STYLE, { display: 'none' });
	button.addEventListener('click', () => {
		window.__downloadAllUpdateRequested = true;
		button.disabled = true;
		button.textContent = 'Updating…';
	});
	container.appendChild(button);

	const refresh = () => {
		if (!container.isConnected) return clearInterval(timer);
		const version = window.__downloadAllUpdate;
		if (!version || window.__downloadAllUpdateRequested) return;
		button.textContent = `Update to ${version}`;
		button.style.display = '';
	};
	const timer = setInterval(refresh, 2000);
	refresh();
}

function mountButton(container: HTMLElement, cls: DownloadsClasses) {
	mountUpdateButton(container, cls);
	const button = container.ownerDocument.createElement('button');
	button.type = 'button';
	button.className = `DialogButton ${cls.RemoveAllButton}`;
	Object.assign(button.style, BUTTON_STYLE);
	button.addEventListener('click', () => downloadAll());
	container.appendChild(button);

	let unsubscribe: (() => void) | undefined;
	unsubscribe = subscribePending((pending) => {
		if (!container.isConnected) return void unsubscribe?.();
		button.disabled = pending.length === 0;
		button.textContent = pending.length > 0 ? `Download All (${pending.length})` : 'All Up to Date';
	});
}

if (window.__downloadAll !== 'loaded') {
	if ((window as any).g_PopupManager && (window as any).webpackChunksteamui) {
		configureDownloads(findModuleExport);
		watchDownloadsHeader(getClasses, mountButton);
		window.__downloadAll = 'loaded';
	} else {
		window.__downloadAll = 'steam-ui-not-ready';
	}
}
