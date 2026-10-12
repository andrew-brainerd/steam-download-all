export type ExportFinder = (filter: (e: any) => boolean) => any;

type DownloadItem = { appid: number };

type DownloadsStore = {
	ScheduledTransfers: DownloadItem[];
	UnqueuedTransfers: DownloadItem[];
	CurrentViewingRemoteClientID: string;
	CurrentViewingDownloadOverview?: { paused: boolean };
	RegisterForDownloadItemsUpdate(cb: (changed: boolean) => void): { Unregister(): void };
};

let store: DownloadsStore | undefined;
let findExport: ExportFinder | undefined;

export function configureDownloads(finder: ExportFinder) {
	findExport = finder;
}

function getStore(): DownloadsStore | undefined {
	if (!findExport) throw new Error('[download-all] configureDownloads() was not called');
	store ??= findExport(
		(e: any) =>
			typeof e === 'object' &&
			e !== null &&
			'm_DownloadItems' in e &&
			'ScheduledTransfers' in e &&
			typeof e.RegisterForDownloadItemsUpdate === 'function',
	);
	return store;
}

export function getPendingAppIds(): number[] {
	const s = getStore();
	if (!s) return [];
	return [...s.ScheduledTransfers, ...s.UnqueuedTransfers].map((item) => item.appid);
}

export function getAppName(appid: number): string {
	return (window as any).appStore?.GetAppOverviewByAppID?.(appid)?.display_name ?? `App ${appid}`;
}

export function subscribePending(listener: (pending: number[]) => void): () => void {
	const s = getStore();
	if (!s) {
		console.error('[download-all] Steam downloads store not found');
		listener([]);
		return () => {};
	}
	console.log('[download-all] Found Steam downloads store; pending:', getPendingAppIds());
	const registration = s.RegisterForDownloadItemsUpdate(() => listener(getPendingAppIds()));
	return () => registration.Unregister();
}

type DownloadsApi = {
	ResumeAppUpdate(appId: number, clientId: string): void;
	EnableAllDownloads(enable: boolean, clientId: string): void;
};

export function downloadAll(): number {
	const s = getStore();
	const pending = getPendingAppIds();
	console.log('[download-all] Download All clicked; pending:', pending);
	if (!s || pending.length === 0) return 0;

	const api = (globalThis as any).SteamClient.Downloads as DownloadsApi;
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
