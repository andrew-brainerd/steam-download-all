import nacl from 'tweetnacl';
import {
	UPDATE_CHECK_DELAY_MS,
	UPDATE_CHECK_INTERVAL_MS,
	UPDATE_MANIFEST_URL,
	UPDATE_PUBLIC_KEY,
	availableUpdate,
	base64ToBytes,
	hexToBytes,
	type UpdateFile,
} from '../../shared/updates';
import { VERSION } from '../../shared/version';

type Listener = (update: UpdateFile | null) => void;

let current: UpdateFile | null = null;
let started = false;
const listeners = new Set<Listener>();

async function check() {
	try {
		const text = await backend.fetch_manifest(UPDATE_MANIFEST_URL);
		current = text ? availableUpdate(JSON.parse(text), 'millennium', VERSION) : null;
	} catch (err) {
		console.warn('[download-all] Update check failed', err);
	}
	listeners.forEach((listener) => listener(current));
}

export function subscribeUpdate(listener: Listener): () => void {
	listeners.add(listener);
	listener(current);
	if (!started) {
		started = true;
		setTimeout(check, UPDATE_CHECK_DELAY_MS);
		setInterval(check, UPDATE_CHECK_INTERVAL_MS);
	}
	return () => listeners.delete(listener);
}

/** Downloads the new plugin through the Lua backend, verifies its signature, installs it and restarts Steam. */
export async function installUpdate(update: UpdateFile): Promise<void> {
	const hex = await backend.stage_update(update.url);
	if (!hex) throw new Error('download failed');
	const valid = nacl.sign.detached.verify(
		hexToBytes(hex),
		base64ToBytes(update.signature),
		base64ToBytes(UPDATE_PUBLIC_KEY),
	);
	if (!valid) {
		await backend.discard_update();
		throw new Error('signature check failed');
	}
	if (!(await backend.apply_update())) throw new Error('install failed');
	SteamClient.User.StartRestart(false);
}
