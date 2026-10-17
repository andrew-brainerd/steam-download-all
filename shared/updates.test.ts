import { describe, expect, it } from 'vitest';
import { availableUpdate, base64ToBytes, compareVersions, hexToBytes, parseUpdate } from './updates';

const BASE = 'https://brainerd.s3.us-east-1.amazonaws.com/apps/download-all/1.1.0';

const manifest = (overrides: Record<string, unknown> = {}) => ({
	version: '1.1.0',
	downloads: [] as unknown[],
	updates: {
		millennium: { url: `${BASE}/dev.brainerd.download-all.star`, signature: 'c2ln' },
		standalone: { url: `${BASE}/download-all.exe`, signature: 'c2ln' },
	},
	...overrides,
});

describe('compareVersions', () => {
	it('orders by major, minor, then patch', () => {
		expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
		expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
		expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
		expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
	});

	it('treats unparseable versions as equal so nothing updates', () => {
		expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(0);
	});
});

describe('parseUpdate', () => {
	it('reads the entry for a flavor', () => {
		expect(parseUpdate(manifest(), 'millennium')).toEqual({
			version: '1.1.0',
			url: `${BASE}/dev.brainerd.download-all.star`,
			signature: 'c2ln',
		});
	});

	it('rejects files hosted anywhere but the release bucket', () => {
		const tampered = manifest({
			updates: { standalone: { url: 'https://evil.example/download-all.exe', signature: 'c2ln' } },
		});
		expect(parseUpdate(tampered, 'standalone')).toBeNull();
	});

	it('returns null for manifests without updates or with bad versions', () => {
		expect(parseUpdate(manifest({ updates: undefined }), 'millennium')).toBeNull();
		expect(parseUpdate(manifest({ version: 'latest' }), 'millennium')).toBeNull();
		expect(parseUpdate('nope', 'millennium')).toBeNull();
	});
});

describe('availableUpdate', () => {
	it('offers only newer versions', () => {
		expect(availableUpdate(manifest(), 'standalone', '1.0.0')?.version).toBe('1.1.0');
		expect(availableUpdate(manifest(), 'standalone', '1.1.0')).toBeNull();
		expect(availableUpdate(manifest(), 'standalone', '2.0.0')).toBeNull();
	});
});

describe('byte helpers', () => {
	it('decodes hex and base64', () => {
		expect([...hexToBytes('00ff10')]).toEqual([0, 255, 16]);
		expect([...base64ToBytes('AP8Q')]).toEqual([0, 255, 16]);
		expect(() => hexToBytes('abc')).toThrow();
		expect(() => hexToBytes('zz')).toThrow();
	});
});
