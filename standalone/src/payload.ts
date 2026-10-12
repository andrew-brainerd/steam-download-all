// Runs inside Steam's SharedJSContext, injected over the DevTools protocol by
// injector.ts. Replaces what Millennium provides (webpack lookups, React button)
// with a small self-contained equivalent.

import { configureDownloads, downloadAll, subscribePending } from '../../shared/downloads';
import { DownloadsClasses, isDownloadsClassModule, watchDownloadsHeader } from '../../shared/downloads-header';

declare global {
	interface Window {
		__downloadAll?: 'loaded' | 'steam-ui-not-ready';
	}
}

// Grabs webpack's require function from Steam's chunk loader, the same way Decky's
// and Millennium's webpack helpers do.
function getModuleExports(): any[] {
	let webpackRequire: any;
	(window as any).webpackChunksteamui.push([[Symbol('download-all')], {}, (r: any) => (webpackRequire = r)]);
	return Object.values(webpackRequire?.c ?? {})
		.map((m: any) => m?.exports)
		.filter(Boolean);
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

function mountButton(container: HTMLElement, cls: DownloadsClasses) {
	const button = container.ownerDocument.createElement('button');
	button.type = 'button';
	button.className = `DialogButton ${cls.RemoveAllButton}`;
	Object.assign(button.style, { minWidth: '0', margin: '0' });
	button.addEventListener('click', () => downloadAll());
	container.appendChild(button);

	let unsubscribe: (() => void) | undefined;
	unsubscribe = subscribePending((pending) => {
		// The Downloads page unmounted and took the button with it.
		if (!container.isConnected) return void unsubscribe?.();
		button.disabled = pending.length === 0;
		button.textContent = pending.length > 0 ? `Download All (${pending.length})` : 'All Up to Date';
	});
}

// The injector reads window.__downloadAll afterwards. It only becomes 'loaded' once
// Steam's UI is ready, so the injector keeps retrying until then.
if (window.__downloadAll !== 'loaded') {
	if ((window as any).g_PopupManager && (window as any).webpackChunksteamui) {
		configureDownloads(findModuleExport);
		watchDownloadsHeader(getClasses, mountButton);
		window.__downloadAll = 'loaded';
	} else {
		window.__downloadAll = 'steam-ui-not-ready';
	}
}
