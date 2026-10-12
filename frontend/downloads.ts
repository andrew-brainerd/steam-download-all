// Download logic. Reads Steam's own downloads store (the one backing the Downloads
// page) and only calls SteamClient.Downloads, so it can be shared with a Decky
// Loader (SteamOS) port, which runs in the same SharedJSContext.

import { findModuleExport } from 'millennium';

type DownloadItem = { appid: number };

type DownloadsStore = {
	ScheduledTransfers: DownloadItem[];
	UnqueuedTransfers: DownloadItem[];
	CurrentViewingRemoteClientID: string;
	CurrentViewingDownloadOverview?: { paused: boolean };
	RegisterForDownloadItemsUpdate(cb: (changed: boolean) => void): { Unregister(): void };
};

let store: DownloadsStore | undefined;

function getStore(): DownloadsStore | undefined {
	// m_DownloadItems is a MobX observable map, so match on shape rather than instanceof Map.
	store ??= findModuleExport(
		(e: any) =>
			typeof e === 'object' &&
			e !== null &&
			'm_DownloadItems' in e &&
			'ScheduledTransfers' in e &&
			typeof e.RegisterForDownloadItemsUpdate === 'function',
	);
	return store;
}

// The same items Steam lists under "Scheduled" and "Not queued" for this device.
export function getPendingAppIds(): number[] {
	const s = getStore();
	if (!s) return [];
	return [...s.ScheduledTransfers, ...s.UnqueuedTransfers].map((item) => item.appid);
}

export function subscribePending(listener: (pending: number[]) => void): () => void {
	const s = getStore();
	if (!s) {
		console.error('[download-all] Steam downloads store not found');
		listener([]);
		return () => {};
	}
	console.log('[download-all] Found Steam downloads store; pending:', getPendingAppIds());
	// Steam invokes the callback immediately, then on every download list change.
	const registration = s.RegisterForDownloadItemsUpdate(() => listener(getPendingAppIds()));
	return () => registration.Unregister();
}

// The installed typings omit the client ID argument, but Steam's own Downloads page
// always passes it ("0" is this device) and the calls do nothing without it.
type DownloadsApi = {
	ResumeAppUpdate(appId: number, clientId: string): void;
	EnableAllDownloads(enable: boolean, clientId: string): void;
};

// Starts every scheduled or unqueued update. ResumeAppUpdate is the same call Steam
// makes for its per-item "start now" button and for the Library's bulk update action.
export function downloadAll(): number {
	const s = getStore();
	const pending = getPendingAppIds();
	console.log('[download-all] Download All clicked; pending:', pending);
	if (!s || pending.length === 0) return 0;

	const api = SteamClient.Downloads as unknown as DownloadsApi;
	const clientId = s.CurrentViewingRemoteClientID ?? '0';
	for (const appid of pending) {
		try {
			api.ResumeAppUpdate(appid, clientId);
		} catch (err) {
			console.error(`[download-all] ResumeAppUpdate failed for ${appid}:`, err);
		}
	}
	if (s.CurrentViewingDownloadOverview?.paused) {
		api.EnableAllDownloads(true, clientId);
	}
	console.log(`[download-all] Resumed ${pending.length} update(s) on client ${clientId}`);
	return pending.length;
}
