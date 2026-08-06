import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from '../../src/pwa/register';

const root = process.cwd();

describe('PWA assets', () => {
  it('uses the GitHub Pages subpath for manifest navigation and every icon', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8')) as {
      start_url: string;
      scope: string;
      icons: readonly { src: string }[];
    };
    expect(manifest.start_url).toBe('/master-ten-pwa/');
    expect(manifest.scope).toBe('/master-ten-pwa/');
    expect(manifest.icons.every((icon) => icon.src.startsWith('/master-ten-pwa/'))).toBe(true);
  });

  it.each([
    ['icon-180.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ])('contains a valid generated PNG %s', (fileName, expectedSize) => {
    const png = readFileSync(resolve(root, 'public/icons', fileName));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(expectedSize);
    expect(png.readUInt32BE(20)).toBe(expectedSize);
  });

  it('pre-caches the app shell and removes only old Master Ten caches', () => {
    const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8');
    expect(worker).toContain("const CACHE_PREFIX = 'master-ten-shell-'");
    expect(worker).toContain('cacheApplicationShell');
    expect(worker).toContain("request.mode === 'navigate'");
    expect(worker).toContain('key.startsWith(CACHE_PREFIX)');
  });
});

describe('Service Worker registration', () => {
  it('registers the worker and scope below the configured base path', async () => {
    const register = vi.fn().mockResolvedValue({});
    const status = await registerServiceWorker({
      serviceWorker: { register } as unknown as ServiceWorkerContainer,
      baseUrl: '/master-ten-pwa/',
    });
    expect(status).toBe('REGISTERED');
    expect(register).toHaveBeenCalledWith('/master-ten-pwa/sw.js', { scope: '/master-ten-pwa/' });
  });

  it('returns FAILED without throwing when registration fails', async () => {
    const register = vi.fn().mockRejectedValue(new Error('blocked'));
    await expect(registerServiceWorker({
      serviceWorker: { register } as unknown as ServiceWorkerContainer,
      baseUrl: '/master-ten-pwa/',
    })).resolves.toBe('FAILED');
  });
});
