import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

	const status = await evaluate(target.webSocketDebuggerUrl!, ['window.__downloadAll']);
	if (status === 'loaded') return setState('Download All is active in Steam');

	const result = await evaluate(target.webSocketDebuggerUrl!, [__PAYLOAD__, 'window.__downloadAll']);
	setState(result === 'loaded' ? 'Injected Download All into Steam' : `Steam not ready yet (${result})`);
}

async function main() {
	log('Download All standalone started');
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
