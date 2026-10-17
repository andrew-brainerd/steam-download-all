import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

const pem = process.env.UPDATE_SIGNING_KEY;
if (!pem) {
	console.error('UPDATE_SIGNING_KEY is not set');
	process.exit(1);
}

const expectedPublicKey = readFileSync(new URL('../shared/updates.ts', import.meta.url), 'utf8').match(
	/UPDATE_PUBLIC_KEY = '([^']+)'/,
)?.[1];

const privateKey = createPrivateKey(pem);
const publicKey = createPublicKey(privateKey);
const rawPublicKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('base64');
if (rawPublicKey !== expectedPublicKey) {
	console.error('UPDATE_SIGNING_KEY does not match UPDATE_PUBLIC_KEY in shared/updates.ts');
	process.exit(1);
}

const signatures = {};
for (const file of process.argv.slice(2)) {
	const data = readFileSync(file);
	const signature = sign(null, data, privateKey);
	if (!verify(null, data, publicKey, signature)) throw new Error(`verification failed for ${file}`);
	signatures[file] = signature.toString('base64');
}
process.stdout.write(JSON.stringify(signatures));
