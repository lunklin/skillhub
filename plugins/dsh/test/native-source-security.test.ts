import { expect, spyOn, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { NativeCore } from '../src/host/generated/native-contract.js';

const { zipSync } = createRequire(new URL('../../../cli/package.json', import.meta.url))('fflate');
const content = '# Isolated native installation';
const fileHash = createHash('sha256').update(content).digest('hex');
const fingerprint = 'sha256:' + createHash('sha256').update(`SKILL.md:${fileHash}\n`).digest('hex');

test.each(['absolute-official', 'redirect-official', 'private-storage'] as const)(
  'bundled DSH native install enforces archive destinations: %s', async scenario => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'cheery-dsh-source-test-')));
    await mkdir(join(root, 'skills'));
    let storageRequests = 0;
    const storage = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      storageRequests++;
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBeNull();
      return new Response(zipSync({ 'SKILL.md': new TextEncoder().encode(content) }));
    } });
    let redirects = 0;
    const registry = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBeNull();
      const path = new URL(request.url).pathname;
      if (path.endsWith('/resolve')) return Response.json({ data: { namespace: 'team', slug: 'writer', version: '1.0.0', versionId: 1, fingerprint,
        downloadUrl: scenario === 'absolute-official' ? 'https://skill.xfyun.cn/private.zip?signature=secret' : '/redirect' } });
      if (path === '/redirect') {
        redirects++;
        return new Response(null, { status: 302, headers: { location: scenario === 'redirect-official'
          ? 'https://SKILL.XFYUN.CN:443/private.zip' : `${storage.url.href}archive.zip?signature=secret` } });
      }
      return new Response('', { status: 404 });
    } });
    const originalFetch = globalThis.fetch;
    let officialAttempts = 0;
    const guard = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname.replace(/\.$/u, '') === 'skill.xfyun.cn') { officialAttempts++; throw new Error('Unexpected official request'); }
      if (init?.redirect !== 'manual' && init?.redirect !== 'error') throw new Error('Unsafe implicit redirect');
      return originalFetch(input, init);
    }, { preconnect: originalFetch.preconnect }));
    try {
      const core: NativeCore = await import(new URL('../lib/local-core.js', import.meta.url).href);
      const runtime = await core.openNativeRuntime({ stateDirectory: join(root, 'operations'), inventoryHome: join(root, 'home') });
      const ownerId = 'fixture-session';
      const accepted = await runtime.acceptInstall({ hostInstanceId: runtime.hostInstanceId, ownerId,
        requestKey: randomUUID(), mode: 'new', parameters: { version: '1.0.0' } }, async () => ({
        namespace: 'team', slug: 'writer', version: '1.0.0', targetLabel: 'Fixture', targetPaths: [join(root, 'skills/writer')],
        context: { sourceIdentity: registry.url.origin, sourceLabel: 'Fixture', sourceRevision: randomUUID(), hostLabel: 'Fixture', initiatedFrom: 'plaza' },
      }));
      if (!accepted) throw new Error('Fixture operation was not accepted');
      const execute = () => runtime.executeInstall({ operationId: accepted.operationId, ownerId,
        registry: registry.url.origin, namespace: 'team', slug: 'writer', version: '1.0.0', versionId: 1,
        fingerprint, root: join(root, 'skills'), scope: 'project', authorize: async () => {}, validateStaged: async () => {} });
      if (scenario === 'private-storage') {
        expect(await execute()).toMatchObject({ outcome: 'committed' });
        expect(await readFile(join(root, 'skills/writer/SKILL.md'), 'utf8')).toBe(content);
      } else {
        await expect(execute()).rejects.toThrow();
        await expect(readFile(join(root, 'skills/writer/SKILL.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      }
      expect(officialAttempts).toBe(0);
      expect(storageRequests).toBe(scenario === 'private-storage' ? 1 : 0);
      expect(redirects).toBe(scenario === 'absolute-official' ? 0 : 1);
    } finally {
      guard.mockRestore(); await registry.stop(true); await storage.stop(true); await rm(root, { recursive: true, force: true });
    }
  },
);
