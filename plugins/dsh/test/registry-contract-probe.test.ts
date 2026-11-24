import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { probeRegistry } from '../scripts/probe-registry.js';

const { zipSync } = createRequire(new URL('../../../cli/package.json', import.meta.url))('fflate');
const content = '# Contract fixture';
const hash = createHash('sha256').update(content).digest('hex');
const fingerprint = 'sha256:' + createHash('sha256').update(`SKILL.md:${hash}\n`).digest('hex');

test.each(['valid', 'fingerprint-mismatch', 'unsafe-archive', 'resolve-denied', 'version-mismatch', 'optional-failure'] as const)(
  'anonymous registry contract probe: %s', async scenario => {
    const requests: string[] = [];
    const archive = zipSync({ [scenario === 'unsafe-archive' ? '../SKILL.md' : 'SKILL.md']: new TextEncoder().encode(content) });
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      expect(request.method).toBe('GET');
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBeNull();
      const url = new URL(request.url);
      requests.push(url.pathname);
      if (url.pathname.endsWith('/search')) return Response.json({ data: { items: [], total: 0, limit: 20 } });
      if (url.pathname.endsWith('/resolve')) {
        if (scenario === 'resolve-denied') return new Response('private diagnostics', { status: 403 });
        expect(url.searchParams.get('version')).toBe('1');
        return Response.json({ data: { namespace: 'team', slug: 'writer', version: scenario === 'version-mismatch' ? '2' : '1', versionId: 7,
          fingerprint: scenario === 'fingerprint-mismatch' ? 'sha256:wrong' : fingerprint, downloadUrl: '/download?signature=do-not-leak' } });
      }
      if (url.pathname === '/download') return new Response(archive, { headers: { 'content-type': 'application/zip' } });
      if (url.pathname.endsWith('/file')) return new Response(content);
      if (url.pathname.endsWith('/security-audit')) return new Response('private diagnostics', { status: 403 });
      if (url.pathname.endsWith('/versions') || url.pathname.endsWith('/reviews')) {
        if (scenario === 'optional-failure') return new Response('private diagnostics', { status: 503 });
        return Response.json({ data: { items: [], total: 0, page: 0, size: 20 } });
      }
      return Response.json({ data: { id: 42, namespace: 'team', slug: 'writer', displayName: null, summary: null } });
    } });
    try {
      const report = await probeRegistry({ registry: server.url.href, namespace: 'team', slug: 'writer', version: '1' });
      expect(report.requiredPassed).toBe(scenario === 'valid' || scenario === 'optional-failure');
      expect(JSON.stringify(report)).not.toContain('do-not-leak');
      expect(JSON.stringify(report)).not.toContain('private diagnostics');
      expect(report.checks).toHaveLength(8);
      if (scenario === 'valid' || scenario === 'resolve-denied') {
        const child = Bun.spawn(['bun', 'run', 'probe:registry', '--registry', server.url.href,
          '--namespace', 'team', '--slug', 'writer', '--version', '1'], {
          cwd: fileURLToPath(new URL('..', import.meta.url)), stdout: 'pipe', stderr: 'pipe',
        });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
        ]);
        expect(exitCode).toBe(scenario === 'valid' ? 0 : 1);
        expect(JSON.parse(stdout).requiredPassed).toBe(scenario === 'valid');
        expect(stdout + stderr).not.toContain('do-not-leak');
        expect(stdout + stderr).not.toContain('private diagnostics');
      }
      if (scenario === 'resolve-denied' || scenario === 'version-mismatch') {
        expect(requests).not.toContain('/download');
        expect(report.checks.find(item => item.name === 'download-archive-fingerprint')?.outcome).toBe('blocked');
      } else expect(report.checks.find(item => item.name === 'security-audit-access')?.outcome).toBe('anonymous-denied');
      if (scenario === 'optional-failure') expect(report.checks.find(item => item.name === 'reviews'))
        .toMatchObject({ outcome: 'failed', reason: 'REGISTRY_UNAVAILABLE' });
    } finally { await server.stop(true); }
  },
);

test.each(['absolute-official', 'redirect-official', 'private-storage'] as const)(
  'probe rejects unapproved official archive targets and preserves private storage: %s', async scenario => {
    const archive = zipSync({ 'SKILL.md': new TextEncoder().encode(content) });
    let storageRequests = 0;
    const storage = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      storageRequests++;
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBeNull();
      return new Response(archive);
    } });
    let redirects = 0;
    const registry = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.headers.get('cookie')).toBeNull();
      const url = new URL(request.url);
      if (url.pathname.endsWith('/search')) return Response.json({ data: { items: [], total: 0, limit: 20 } });
      if (url.pathname.endsWith('/resolve')) return Response.json({ data: { namespace: 'team', slug: 'writer', version: '1', versionId: 7, fingerprint,
        downloadUrl: scenario === 'absolute-official' ? 'https://SKILL.XFYUN.CN:443/private.zip' : '/redirect' } });
      if (url.pathname === '/redirect') {
        redirects++;
        return new Response(null, { status: 302, headers: { location: scenario === 'redirect-official'
          ? 'https://skill.xfyun.cn./private.zip' : `${storage.url.href}archive.zip?signature=private` } });
      }
      if (url.pathname.endsWith('/file')) return new Response(content);
      if (url.pathname.endsWith('/security-audit')) return new Response('', { status: 403 });
      if (url.pathname.endsWith('/versions') || url.pathname.endsWith('/reviews')) return Response.json({ data: { items: [], total: 0, page: 0, size: 20 } });
      return Response.json({ data: { id: 42, namespace: 'team', slug: 'writer', displayName: null, summary: null } });
    } });
    let attemptedOfficial = 0;
    const guardedFetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname.replace(/\.$/u, '') === 'skill.xfyun.cn') { attemptedOfficial++; throw new Error('Unexpected official request'); }
      if (init?.redirect !== 'manual' && init?.redirect !== 'error') throw new Error('Unsafe implicit redirect');
      return fetch(input, init);
    }, { preconnect: fetch.preconnect });
    try {
      const report = await probeRegistry({ registry: registry.url.href, namespace: 'team', slug: 'writer', version: '1' }, guardedFetch);
      expect(report.requiredPassed).toBe(scenario === 'private-storage');
      expect(report.checks.find(item => item.name === 'download-archive-fingerprint')?.outcome)
        .toBe(scenario === 'private-storage' ? 'passed' : 'failed');
      expect(attemptedOfficial).toBe(0);
      expect(storageRequests).toBe(scenario === 'private-storage' ? 1 : 0);
      expect(redirects).toBe(scenario === 'absolute-official' ? 0 : 1);
      expect(JSON.stringify(report)).not.toContain('signature=private');
    } finally { await registry.stop(true); await storage.stop(true); }
  },
);

test('probe preserves a selected Registry base path for application-relative archive URLs', async () => {
  const paths: string[] = [];
  const archive = zipSync({ 'SKILL.md': new TextEncoder().encode(content) });
  const mockFetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    paths.push(url.pathname);
    expect(url.origin).toBe('https://registry.example');
    expect(init?.redirect === 'manual' || init?.redirect === 'error').toBe(true);
    if (url.pathname.endsWith('/search')) return Response.json({ data: { items: [], total: 0, limit: 20 } });
    if (url.pathname.endsWith('/resolve')) return Response.json({ data: { namespace: 'team', slug: 'writer', version: '1', versionId: 7, fingerprint,
      downloadUrl: '/api/cli/v1/skills/team/writer/versions/1/download' } });
    if (url.pathname.endsWith('/download')) return new Response(archive);
    if (url.pathname.endsWith('/file')) return new Response(content);
    if (url.pathname.endsWith('/security-audit')) return new Response('', { status: 403 });
    if (url.pathname.endsWith('/versions') || url.pathname.endsWith('/reviews')) return Response.json({ data: { items: [], total: 0, page: 0, size: 20 } });
    return Response.json({ data: { id: 42, namespace: 'team', slug: 'writer', displayName: null, summary: null } });
  }, { preconnect: fetch.preconnect });
  const report = await probeRegistry({ registry: 'https://registry.example/base', namespace: 'team', slug: 'writer', version: '1' }, mockFetch);
  expect(report.requiredPassed).toBe(true);
  expect(paths).toContain('/base/api/cli/v1/skills/team/writer/versions/1/download');
  expect(paths).not.toContain('/api/cli/v1/skills/team/writer/versions/1/download');
});

test.each([
  ['https://skill.xfyun.cn/approved/%2f..%2fother', false],
  ['https://skill.xfyun.cn/approved/%252f..%252fother', false],
  ['https://skill.xfyun.cn/approved/%5c..%5cother', false],
  ['https://skill.xfyun.cn/elsewhere/archive.zip', false],
  ['https://skill.xfyun.cn:8443/approved/archive.zip', false],
  ['https://skill.xfyun.cn/approved/assets/archive.zip', true],
] as const)('probe enforces official base path for %s', async (archiveUrl, allowed) => {
  const calls: string[] = [];
  const archive = zipSync({ 'SKILL.md': new TextEncoder().encode(content) });
  const mockFetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.href);
    expect(['manual', 'error'].includes(init?.redirect ?? '')).toBe(true);
    if (url.pathname.endsWith('/search')) return Response.json({ data: { items: [], total: 0, limit: 20 } });
    if (url.pathname.endsWith('/resolve')) return Response.json({ data: { namespace: 'team', slug: 'writer', version: '1', versionId: 7, fingerprint, downloadUrl: archiveUrl } });
    if (url.href === archiveUrl) return new Response(archive);
    if (url.pathname.endsWith('/file')) return new Response(content);
    if (url.pathname.endsWith('/security-audit')) return new Response('', { status: 403 });
    if (url.pathname.endsWith('/versions') || url.pathname.endsWith('/reviews')) return Response.json({ data: { items: [], total: 0, page: 0, size: 20 } });
    return Response.json({ data: { id: 42, namespace: 'team', slug: 'writer', displayName: null, summary: null } });
  }, { preconnect: fetch.preconnect });
  const report = await probeRegistry({ registry: 'https://skill.xfyun.cn/approved', namespace: 'team', slug: 'writer', version: '1' }, mockFetch);
  expect(report.requiredPassed).toBe(allowed);
  expect(calls.filter(url => url === archiveUrl)).toHaveLength(allowed ? 1 : 0);
});
