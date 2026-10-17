export const UPDATE_PUBLIC_KEY = '/x3ot7vA0Bk0We9o81AK5psBbFszgvdrWq10XNLijdg=';
export const UPDATE_MANIFEST_URL = 'https://brainerd.s3.us-east-1.amazonaws.com/apps/download-all/latest.json';
const ALLOWED_URL_PREFIX = 'https://brainerd.s3.us-east-1.amazonaws.com/apps/download-all/';

export const UPDATE_CHECK_DELAY_MS = 30 * 1000;
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdateFlavor = 'millennium' | 'standalone';

export type UpdateFile = { version: string; url: string; signature: string };

const parseVersion = (version: string): number[] | null => {
	const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
	return match ? match.slice(1).map(Number) : null;
};

export function compareVersions(a: string, b: string): number {
	const left = parseVersion(a);
	const right = parseVersion(b);
	if (!left || !right) return 0;
	for (let i = 0; i < 3; i++) {
		if (left[i] !== right[i]) return left[i] - right[i];
	}
	return 0;
}

export function parseUpdate(raw: unknown, flavor: UpdateFlavor): UpdateFile | null {
	if (typeof raw !== 'object' || raw === null) return null;
	const { version, updates } = raw as { version?: unknown; updates?: Record<string, unknown> };
	if (typeof version !== 'string' || !parseVersion(version)) return null;
	const entry = updates?.[flavor] as { url?: unknown; signature?: unknown } | undefined;
	if (!entry || typeof entry.url !== 'string' || typeof entry.signature !== 'string') return null;
	if (!entry.url.startsWith(ALLOWED_URL_PREFIX)) return null;
	return { version: version.trim(), url: entry.url, signature: entry.signature };
}

export function availableUpdate(raw: unknown, flavor: UpdateFlavor, current: string): UpdateFile | null {
	const update = parseUpdate(raw, flavor);
	return update && compareVersions(update.version, current) > 0 ? update : null;
}

export function hexToBytes(hex: string): Uint8Array {
	if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new Error('invalid hex');
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
}

export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
