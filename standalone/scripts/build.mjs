// Builds dist/download-all.exe: bundles the payload, embeds it in the injector, and
// packs the injector into a Node single executable application (SEA).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const dist = 'dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

const payload = await build({
	entryPoints: ['src/payload.ts'],
	bundle: true,
	format: 'iife',
	target: 'chrome120',
	minify: true,
	write: false,
});

await build({
	entryPoints: ['src/injector.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node24',
	outfile: `${dist}/injector.cjs`,
	define: { __PAYLOAD__: JSON.stringify(payload.outputFiles[0].text) },
});

if (process.argv.includes('--no-exe')) process.exit(0);

writeFileSync(
	`${dist}/sea-config.json`,
	JSON.stringify({ main: `${dist}/injector.cjs`, output: `${dist}/sea-prep.blob`, disableExperimentalSEAWarning: true }),
);
execFileSync(process.execPath, ['--experimental-sea-config', `${dist}/sea-config.json`], { stdio: 'inherit' });

const exe = `${dist}/download-all.exe`;
copyFileSync(process.execPath, exe);
execFileSync(
	process.execPath,
	[
		'node_modules/postject/dist/cli.js',
		exe,
		'NODE_SEA_BLOB',
		`${dist}/sea-prep.blob`,
		'--sentinel-fuse',
		'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
	],
	{ stdio: 'inherit' },
);

// Switch the PE subsystem from console (3) to GUI (2) so it runs without a window.
const bin = readFileSync(exe);
const peOffset = bin.readUInt32LE(0x3c);
const subsystemOffset = peOffset + 4 + 20 + 68;
bin.writeUInt16LE(2, subsystemOffset);
writeFileSync(exe, bin);

rmSync(`${dist}/sea-config.json`);
rmSync(`${dist}/sea-prep.blob`);
console.log(`Built ${exe}`);
