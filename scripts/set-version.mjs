import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
	console.error('Usage: pnpm set-version <major.minor.patch>');
	process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const edits = [
	['installer/package.json', /("version":\s*")\d+\.\d+\.\d+(")/],
	['installer/src-tauri/tauri.conf.json', /("version":\s*")\d+\.\d+\.\d+(")/],
	['installer/src-tauri/Cargo.toml', /^(version = ")\d+\.\d+\.\d+(")/m],
	['installer/src-tauri/Cargo.lock', /(name = "download-all-installer"\r?\nversion = ")\d+\.\d+\.\d+(")/],
	['millennium/millennium.toml', /^(version = ")\d+\.\d+\.\d+(")/m],
	['decky/package.json', /("version":\s*")\d+\.\d+\.\d+(")/],
	['standalone/package.json', /("version":\s*")\d+\.\d+\.\d+(")/],
	['shared/version.ts', /(VERSION = ')\d+\.\d+\.\d+(')/],
];

for (const [file, pattern] of edits) {
	const path = join(root, file);
	const text = readFileSync(path, 'utf8');
	if (!pattern.test(text)) throw new Error(`No version found in ${file}`);
	writeFileSync(path, text.replace(pattern, `$1${version}$2`));
	console.log(`${file} → ${version}`);
}
