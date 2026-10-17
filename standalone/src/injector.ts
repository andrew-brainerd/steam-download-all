import { spawn } from 'node:child_process';
import { createPublicKey, verify } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSea } from 'node:sea';
import {
	UPDATE_CHECK_DELAY_MS,
	UPDATE_CHECK_INTERVAL_MS,
	UPDATE_MANIFEST_URL,
	UPDATE_PUBLIC_KEY,
	availableUpdate,
	type UpdateFile,
} from '../../shared/updates';
import { VERSION } from '../../shared/version';

declare const __PAYLOAD__: string;

const DEVTOOLS = 'http://127.0.0.1:8080';
const POLL_MS = 5000;

const logDir = join(process.env.LOCALAPPDATA ?? '.', 'DownloadAll');
const logFile = join(logDir, 'download-all.log');
mkdirSync(logDir, { recursive: true });
writeFileSync(logFile, '');

function log(message: string) {
	const line = `${new Date().toISOString()} ${message}\n`;
	appendFileSync(logFile, line);
	process.stdout.write(line);
}

type Target = { title: string; type: string; webSocketDebuggerUrl?: string };

async function findSharedJSContext(): Promise<Target | undefined> {
	const res = await fetch(`${DEVTOOLS}/json`);
	const targets = (await res.json()) as Target[];
	return targets.find((t) => t.title === 'SharedJSContext' && t.webSocketDebuggerUrl);
}

function evaluate(wsUrl: string, expressions: string[]): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		let id = 0;
		const send = () =>
			ws.send(JSON.stringify({ id: ++id, method: 'Runtime.evaluate', params: { expression: expressions[id - 1], returnByValue: true } }));

		ws.onopen = send;
		ws.onerror = () => reject(new Error('DevTools WebSocket error'));
		ws.onmessage = (event) => {
			const msg = JSON.parse(String(event.data));
			if (msg.id !== id) return;
			const exception = msg.result?.exceptionDetails;
			if (exception) {
				ws.close();
				return reject(new Error(exception.exception?.description ?? exception.text));
			}
			if (id < expressions.length) return send();
			ws.close();
			resolve(msg.result?.result?.value);
		};
	});
}

const exePath = process.execPath;
const oldExePath = `${exePath}.old`;
const canSelfUpdate = isSea();
let staged: { version: string; path: string } | null = null;

const publicKey = createPublicKey({
	key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(UPDATE_PUBLIC_KEY, 'base64')]),
	format: 'der',
	type: 'spki',
});

async function stageUpdate(update: UpdateFile) {
	const response = await fetch(update.url);
	if (!response.ok) throw new Error(`update download responded ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (!verify(null, bytes, publicKey, Buffer.from(update.signature, 'base64'))) {
		throw new Error(`signature check failed for ${update.version}`);
	}
	const path = `${exePath}.${update.version}.new`;
	writeFileSync(path, bytes);
	staged = { version: update.version, path };
	log(`Staged verified update ${update.version}`);
}

async function checkForUpdate() {
	if (!canSelfUpdate) return;
	try {
		const response = await fetch(UPDATE_MANIFEST_URL);
		if (!response.ok) return;
		const update = availableUpdate(await response.json(), 'standalone', VERSION);
		if (update && staged?.version !== update.version) await stageUpdate(update);
	} catch (err) {
		log(`Update check failed: ${(err as Error).message}`);
	}
}

async function applyUpdate(wsUrl: string) {
	if (!staged) return;
	log(`Installing update ${staged.version}`);
	rmSync(oldExePath, { force: true });
	renameSync(exePath, oldExePath);
	renameSync(staged.path, exePath);
	spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
	await evaluate(wsUrl, ['SteamClient.User.StartRestart(false)']).catch(() => {});
	process.exit(0);
}

let lastState = '';
function setState(state: string) {
	if (state !== lastState) log(state);
	lastState = state;
}

async function tick() {
	let target: Target | undefined;
	try {
		target = await findSharedJSContext();
	} catch {
		return setState('Waiting for Steam (remote debugging port not open)');
	}
	if (!target) return setState('Waiting for Steam UI to load');

	const wsUrl = target.webSocketDebuggerUrl!;
	const offer = staged ? `window.__downloadAllUpdate = ${JSON.stringify(staged.version)};` : '';
	const status = await evaluate(wsUrl, [`${offer} window.__downloadAll`]);
	if (status === 'loaded') {
		if (staged && (await evaluate(wsUrl, ['window.__downloadAllUpdateRequested === true']))) {
			return applyUpdate(wsUrl);
		}
		return setState('Download All is active in Steam');
	}

	const result = await evaluate(target.webSocketDebuggerUrl!, [__PAYLOAD__, 'window.__downloadAll']);
	setState(result === 'loaded' ? 'Injected Download All into Steam' : `Steam not ready yet (${result})`);
}

async function main() {
	log(`Download All standalone ${VERSION} started`);
	if (existsSync(oldExePath)) rmSync(oldExePath, { force: true });
	setTimeout(checkForUpdate, UPDATE_CHECK_DELAY_MS);
	setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
	for (;;) {
		try {
			await tick();
		} catch (err) {
			setState(`Error: ${(err as Error).message}`);
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
}

main();
