import { describe, expect, test } from 'bun:test'
import { SkillHubClient } from '../../../src/clients/skillhub-client'
import { CliError } from '../../../src/shared/errors'
import { EXIT } from '../../../src/shared/constants'

describe('SkillHubClient', () => {
  test.each([
    ['https://registry.test', '/api/v1/skills/team/skill/versions/1.0.0/download', 'https://registry.test/api/v1/skills/team/skill/versions/1.0.0/download'],
    ['https://registry.test/skillhub', '/api/v1/skills/team/skill/versions/1.0.0/download', 'https://registry.test/skillhub/api/v1/skills/team/skill/versions/1.0.0/download'],
    ['https://registry.test/nested/skillhub/', '/api/v1/skills/team/a%20b/versions/1.0.0/download', 'https://registry.test/nested/skillhub/api/v1/skills/team/a%20b/versions/1.0.0/download'],
    ['https://registry.test/skillhub', 'api/v1/skills/team/skill/download', 'https://registry.test/skillhub/api/v1/skills/team/skill/download'],
    ['https://registry.test/skillhub', '/skillhub/api/v1/skills/team/skill/download', 'https://registry.test/skillhub/api/v1/skills/team/skill/download'],
    ['https://registry.test/skillhub', 'https://registry.test/skillhub/api/v1/skills/team/skill/download', 'https://registry.test/skillhub/api/v1/skills/team/skill/download']
  ])('keeps registry scope when downloading %s -> %s', async (registry, downloadUrl, expected) => {
    const requests: string[] = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push(String(input))
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token')
      return new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient(registry, 'test-token', fetchImpl)
    expect(await (await client.downloadFromUrl(downloadUrl)).text()).toBe('package-bytes')
    expect(requests).toEqual([expected])
  })

  test.each([
    ['https://registry.test', 'https://cdn.test/packages/skill.zip?signature=test'],
    ['https://registry.test', '//cdn.test/api/packages/skill.zip'],
    ['https://registry.test', 'https://registry.test.cdn.test/api/skill.zip'],
    ['https://registry.test', 'http://registry.test/api/skill.zip'],
    ['https://registry.test', 'https://registry.test:8443/api/skill.zip'],
    ['https://registry.test', 'https://registry.test/packages/skill.zip'],
    ['https://registry.test/skillhub', 'https://registry.test/api/skill.zip'],
    ['https://registry.test/skillhub', 'https://registry.test/skillhub/api-other/skill.zip']
  ])('omits registry credentials when %s downloads outside its API: %s', async (registry, downloadUrl) => {
    const requests: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get('Authorization')
      requests.push({ url: String(input), authorization })
      return authorization
        ? new Response('InvalidArgument', { status: 400 })
        : new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient(registry, 'test-token', fetchImpl)

    expect(await (await client.downloadFromUrl(downloadUrl)).text()).toBe('package-bytes')
    expect(requests).toEqual([{ url: new URL(downloadUrl, registry).toString(), authorization: null }])
  })

  test.each(['https://skill.xfyun.cn/pkg.zip', 'https://SKILL.XFYUN.CN.:8443/pkg.zip'])('blocks a direct official download from a private registry: %s', async downloadUrl => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response('unexpected') }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test', 'token', fetchImpl)
    await expect(client.downloadFromUrl(downloadUrl)).rejects.toThrow('public registry destination blocked')
    expect(calls).toBe(0)
  })

  test('checks every download redirect hop and never sends the token to external storage', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, authorization: new Headers(init?.headers).get('Authorization') })
      expect(init?.redirect).toBe('manual')
      if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: 'https://storage.example/archive' } })
      return new Response(null, { status: 302, headers: { Location: 'https://SKILL.XFYUN.CN.:8443/archive' } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test', 'secret-token', fetchImpl)
    await expect(client.downloadFromUrl('/api/skill')).rejects.toThrow('public registry destination blocked')
    expect(calls).toEqual([
      { url: 'https://registry.test/api/skill', authorization: 'Bearer secret-token' },
      { url: 'https://storage.example/archive', authorization: null }
    ])
  })

  test('permits a private Registry to redirect downloads to S3 without credentials', async () => {
    const calls: Array<string | null> = []
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { Location: 'https://storage.example/file.zip?sig=test' } })
        : new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test', 'secret-token', fetchImpl)
    expect(await (await client.download('team', 'demo')).text()).toBe('package-bytes')
    expect(calls).toEqual(['Bearer secret-token', null])
  })

  test.each([
    'https://registry.test/approved/api/%2f..%2foutside',
    'https://registry.test/approved/api/%252f..%252foutside',
    'https://registry.test/approved/api/%5c..%5coutside'
  ])('never forwards bearer credentials to an encoded traversal download: %s', async target => {
    const calls: Array<string | null> = []
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      return new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    expect(await (await client.downloadFromUrl(target)).text()).toBe('package-bytes')
    expect(calls).toEqual([null])
  })

  test.each([
    'https://registry.test/approved/api/%2f..%2foutside',
    'https://registry.test/approved/api/%252f..%252foutside'
  ])('strips bearer credentials before following an encoded traversal redirect: %s', async target => {
    const calls: Array<string | null> = []
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: target } })
      return new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    expect(await (await client.downloadFromUrl('/api/start')).text()).toBe('package-bytes')
    expect(calls).toEqual(['Bearer secret-token', null])
  })

  test('does not restore bearer credentials after an encoded traversal redirects back to the API', async () => {
    const calls: Array<string | null> = []
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: '/approved/api/%2f..%2foutside' } })
      if (calls.length === 2) return new Response(null, { status: 302, headers: { Location: '/approved/api/again' } })
      return new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    expect(await (await client.downloadFromUrl('/api/start')).text()).toBe('package-bytes')
    expect(calls).toEqual(['Bearer secret-token', null, null])
  })

  test('does not restore registry credentials after a redirect leaves the trusted API', async () => {
    const calls: Array<string | null> = []
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: 'https://storage.example/file' } })
      if (calls.length === 2) return new Response(null, { status: 302, headers: { Location: 'https://registry.test/api/other' } })
      return new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test', 'secret-token', fetchImpl)
    expect(await (await client.downloadFromUrl('/api/start')).text()).toBe('package-bytes')
    expect(calls).toEqual(['Bearer secret-token', null, null])
  })

  test('does not follow API redirects or forward tokens to another host', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(String(input))
      expect(init?.redirect).toBe('manual')
      return new Response(null, { status: 302, headers: { Location: 'https://skill.xfyun.cn/' } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test', 'secret-token', fetchImpl)
    await expect(client.search('test', 1)).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })

  test('allows a client whose selected Registry is the official host', async () => {
    let calls = 0
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls++
      expect(init?.redirect).toBe('manual')
      return new Response('package-bytes')
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://skill.xfyun.cn', undefined, fetchImpl)
    expect(await (await client.downloadFromUrl('/api/skill')).text()).toBe('package-bytes')
    expect(calls).toBe(1)
  })

  test.each([
    'http://skill.xfyun.cn/approved/file',
    'https://skill.xfyun.cn:8443/approved/file',
    'https://skill.xfyun.cn/other/file',
    'https://skill.xfyun.cn/approved-elsewhere/file',
    'https://skill.xfyun.cn/approved/%2f..%2fother'
  ])('blocks an official destination outside the specifically authorized origin and base path: %s', async target => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response('unexpected') }) as unknown as typeof fetch
    const client = new SkillHubClient('https://skill.xfyun.cn/approved', 'token', fetchImpl)
    await expect(client.downloadFromUrl(target)).rejects.toThrow('public registry destination blocked')
    expect(calls).toBe(0)
  })

  test('blocks official redirects outside the specifically authorized base path', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: URL | RequestInfo) => {
      calls.push(String(input))
      return new Response(null, { status: 302, headers: { Location: 'https://skill.xfyun.cn/other/file' } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://skill.xfyun.cn/approved', 'token', fetchImpl)
    await expect(client.downloadFromUrl('/api/start')).rejects.toThrow('public registry destination blocked')
    expect(calls).toEqual(['https://skill.xfyun.cn/approved/api/start'])
  })

  test('permits safe GET redirects inside the authorized private registry base path', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      calls.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') })
      expect(init?.redirect).toBe('manual')
      if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: '/approved/api/cli/v1/skills/search?q=new' } })
      return Response.json({ data: { items: [], total: 0, limit: 1 } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    expect(await client.search('demo', 1)).toEqual({ items: [], total: 0, limit: 1 })
    expect(calls).toEqual([
      { url: 'https://registry.test/approved/api/cli/v1/skills/search?q=demo&limit=1', authorization: 'Bearer secret-token' },
      { url: 'https://registry.test/approved/api/cli/v1/skills/search?q=new', authorization: 'Bearer secret-token' }
    ])
  })

  test.each(['https://other.test/approved/api', 'https://registry.test/outside/api', 'http://registry.test/approved/api'])('refuses GET redirect outside authorized scope: %s', async location => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response(null, { status: 302, headers: { Location: location } }) }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    await expect(client.search('demo', 1)).rejects.toThrow('registry redirect refused')
    expect(calls).toBe(1)
  })

  test('strips authorization on same-origin GET redirects outside the API and never restores it', async () => {
    const calls: Array<string | null> = []
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get('Authorization'))
      if (calls.length === 1) return new Response(null, { status: 302, headers: { Location: '/approved/outside-api' } })
      if (calls.length === 2) return new Response(null, { status: 302, headers: { Location: '/approved/api/cli/v1/skills/search' } })
      return Response.json({ data: { items: [], total: 0, limit: 1 } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    await client.search('demo', 1)
    expect(calls).toEqual(['Bearer secret-token', null, null])
  })

  test('does not replay a publish POST after even a same-scope redirect', async () => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response(null, { status: 307, headers: { Location: '/approved/api/cli/v1/skills/team/publish' } }) }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test/approved', 'secret-token', fetchImpl)
    await expect(client.publish('team', new Blob(['zip']), 'PRIVATE')).rejects.toThrow('registry redirect refused')
    expect(calls).toBe(1)
  })

  test('limits download redirects', async () => {
    let calls = 0
    const fetchImpl = (async () => { calls++; return new Response(null, { status: 302, headers: { Location: '/api/loop' } }) }) as unknown as typeof fetch
    const client = new SkillHubClient('https://registry.test', 'token', fetchImpl)
    await expect(client.downloadFromUrl('/api/start')).rejects.toThrow('too many download redirects')
    expect(calls).toBe(6)
  })

  test('uses the provided multipart file name when publishing', async () => {
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      const formData = init?.body as FormData
      const file = formData.get('file') as File
      expect(file.name).toBe('custom-skill.zip')
      expect(formData.get('visibility')).toBe('PRIVATE')
      return Response.json({
        data: {
          namespace: 'team',
          slug: 'custom-skill',
          version: '1.0.0',
          visibility: 'PRIVATE',
          status: 'UPLOADED'
        }
      })
    }) as unknown as typeof fetch

    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    await expect(client.publish('team', new Blob(['zip'], { type: 'application/zip' }), 'PRIVATE', 'custom-skill.zip'))
      .resolves.toMatchObject({ slug: 'custom-skill' })
  })

  // --- download() error handling (P0) ---

  test('download() throws auth error on 401', async () => {
    const fetchImpl = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.download('ns', 'slug')).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'authentication failed')
    await err.toHaveProperty('exitCode', EXIT.auth)
  })

  test('download() preserves the server reason and request ID on 403', async () => {
    const fetchImpl = (async () => Response.json({
      code: 403,
      msg: 'API token is missing required scope: skill:read',
      requestId: 'req-download'
    }, { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.download('ns', 'slug')).rejects.toMatchObject({
      message: 'API token is missing required scope: skill:read',
      exitCode: EXIT.auth,
      details: {
        registry: 'http://registry.test',
        requestId: 'req-download'
      }
    })
  })

  test('download() uses a neutral access error for an unstructured 403', async () => {
    const fetchImpl = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.download('ns', 'slug')).rejects.toMatchObject({
      message: 'access denied',
      exitCode: EXIT.auth,
      details: { registry: 'http://registry.test' }
    })
  })

  test('download() throws not-found error on 404', async () => {
    const fetchImpl = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.download('ns', 'slug')).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'skill or version not found')
    await err.toHaveProperty('exitCode', EXIT.generic)
  })

  test('download() throws generic error on 400', async () => {
    const fetchImpl = (async () => new Response(null, { status: 400 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.download('ns', 'slug')).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'download failed with status 400')
    await err.toHaveProperty('exitCode', EXIT.generic)
  })

  test('download() throws generic error on 500', async () => {
    const fetchImpl = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.download('ns', 'slug')).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'download failed with status 500')
    await err.toHaveProperty('exitCode', EXIT.generic)
  })

  test('download() retains its fallback while classifying 502 as a network error', async () => {
    const fetchImpl = (async () => new Response(null, { status: 502 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.download('ns', 'slug')).rejects.toMatchObject({
      message: 'download failed with status 502',
      exitCode: EXIT.network,
      details: { registry: 'http://registry.test' }
    })
  })

  test('download() throws network error on fetch failure', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.download('ns', 'slug')).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'registry unreachable')
    await err.toHaveProperty('exitCode', EXIT.network)
  })

  // --- whoami() (P1) ---

  test('whoami() returns user data', async () => {
    const fetchImpl = (async () => Response.json({
      data: { handle: 'alice', displayName: 'Alice', email: 'a@b.com' }
    })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const result = await client.whoami()
    expect(result).toEqual({ handle: 'alice', displayName: 'Alice', email: 'a@b.com' })
  })

  test('whoami() throws on 401', async () => {
    const fetchImpl = (async () => new Response(null, { status: 401 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.whoami()).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'authentication failed')
    await err.toHaveProperty('exitCode', EXIT.auth)
  })

  test('device authorization uses the public endpoints without bearer credentials', async () => {
    const requests: Array<{ path: string; authorization: string | null; body?: unknown }> = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({
        path: url.pathname,
        authorization: new Headers(init?.headers).get('authorization'),
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {})
      })
      if (url.pathname.endsWith('/code')) {
        return Response.json({
          data: {
            deviceCode: 'device-secret',
            userCode: 'ABCD-2345',
            verificationUri: '/device',
            expiresIn: 60,
            interval: 5
          }
        })
      }
      return Response.json({ data: { accessToken: null, tokenType: null, error: 'authorization_pending' } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('https://skillhub.example.com', 'stored-token', fetchImpl)

    await client.requestDeviceCode()
    await client.pollDeviceToken('device-secret')

    expect(requests).toEqual([
      { path: '/api/v1/auth/device/code', authorization: null },
      { path: '/api/v1/auth/device/token', authorization: null, body: { deviceCode: 'device-secret' } }
    ])
  })

  // --- search() (P1) ---

  test('search() returns items', async () => {
    const fetchImpl = (async () => Response.json({
      data: {
        items: [{ namespace: 'g', slug: 's', latestVersion: '1.0', summary: 'x' }],
        total: 1,
        limit: 20
      }
    })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const result = await client.search('test', 20)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({ namespace: 'g', slug: 's', latestVersion: '1.0', summary: 'x' })
    expect(result.total).toBe(1)
    expect(result.limit).toBe(20)
  })

  test('search() returns empty results', async () => {
    const fetchImpl = (async () => Response.json({
      data: { items: [], total: 0, limit: 20 }
    })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const result = await client.search('nothing', 20)
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  // --- resolve() (P1) ---

  test('resolve() without version omits query param', async () => {
    let capturedUrl = ''
    const fetchImpl = (async (input: URL | RequestInfo) => {
      capturedUrl = String(input)
      return Response.json({
        data: { namespace: 'ns', slug: 'sk', version: '1.0.0', versionId: 1, fingerprint: 'abc', downloadUrl: '/dl' }
      })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    await client.resolve('ns', 'sk')
    expect(capturedUrl).not.toContain('?version=')
  })

  test('resolve() with version includes query param', async () => {
    let capturedUrl = ''
    const fetchImpl = (async (input: URL | RequestInfo) => {
      capturedUrl = String(input)
      return Response.json({
        data: { namespace: 'ns', slug: 'sk', version: '2.0.0', versionId: 2, fingerprint: 'def', downloadUrl: '/dl' }
      })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    await client.resolve('ns', 'sk', '2.0.0')
    expect(capturedUrl).toContain('?version=2.0.0')
  })

  test('listNamespaceSkills forwards cursor and limit', async () => {
    let capturedUrl = ''
    const fetchImpl = (async (input: URL | RequestInfo) => {
      capturedUrl = String(input)
      return Response.json({ data: { items: [], nextCursor: null } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await client.listNamespaceSkills('team a', 'cursor-value', 50)

    expect(capturedUrl).toContain('/api/cli/v1/namespaces/team%20a/skills')
    expect(capturedUrl).toContain('cursor=cursor-value')
    expect(capturedUrl).toContain('limit=50')
  })

  test('submitReview posts the lifecycle request with bearer auth', async () => {
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      expect(String(input)).toContain('/api/v1/skills/team-a/demo/submit-review')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token')
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({ version: '1.0.0', targetVisibility: 'NAMESPACE_ONLY' })
      return Response.json({ data: { skillId: 1, versionId: 2, action: 'SUBMIT_REVIEW', status: 'PENDING_REVIEW' } })
    }) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.submitReview('team-a', 'demo', '1.0.0', 'NAMESPACE_ONLY'))
      .resolves.toMatchObject({ status: 'PENDING_REVIEW' })
  })

  // --- handleJsonResponse() non-2xx classification ---

  test('whoami() preserves public fields and ignores unknown fields on a structured 401', async () => {
    const fetchImpl = (async () => Response.json({
      code: 401,
      msg: 'token has been revoked',
      requestId: 'req-401',
      detail: 'internal token state',
      stack: 'internal stack trace'
    }, { status: 401 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    const error = await client.whoami().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CliError)
    expect((error as CliError).message).toBe('token has been revoked')
    expect((error as CliError).exitCode).toBe(EXIT.auth)
    expect((error as CliError).details).toEqual({
      registry: 'http://registry.test',
      requestId: 'req-401',
      next: 'run `skillhub login`'
    })
  })

  test('search() preserves a public 403 message and request ID', async () => {
    const fetchImpl = (async () => Response.json({
      code: 403,
      msg: 'token has been revoked',
      requestId: 'req-403'
    }, { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    try {
      await client.search('test', 20)
      throw new Error('expected search to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect((error as CliError).message).toBe('token has been revoked')
      expect((error as CliError).exitCode).toBe(EXIT.auth)
      expect((error as CliError).details).toEqual({
        registry: 'http://registry.test',
        requestId: 'req-403'
      })
    }
  })

  test('search() uses a neutral 403 fallback when msg is absent', async () => {
    const fetchImpl = (async () => Response.json({
      code: 403,
      requestId: 'req-fallback'
    }, { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    try {
      await client.search('test', 20)
      throw new Error('expected search to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect((error as CliError).message).toBe('access denied')
      expect((error as CliError).exitCode).toBe(EXIT.auth)
      expect((error as CliError).details).toEqual({
        registry: 'http://registry.test',
        requestId: 'req-fallback'
      })
    }
  })

  test('search() uses a neutral 403 fallback for a non-JSON body', async () => {
    const fetchImpl = (async () => new Response('<html>forbidden</html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' }
    })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    try {
      await client.search('test', 20)
      throw new Error('expected search to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect((error as CliError).message).toBe('access denied')
      expect((error as CliError).exitCode).toBe(EXIT.auth)
      expect((error as CliError).details).toEqual({ registry: 'http://registry.test' })
    }
  })

  test('whoami() preserves a structured 404 message and request ID', async () => {
    const fetchImpl = (async () => Response.json({
      code: 404,
      msg: 'namespace not found',
      requestId: 'req-404'
    }, { status: 404 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    try {
      await client.whoami()
      throw new Error('expected whoami to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect((error as CliError).message).toBe('namespace not found')
      expect((error as CliError).exitCode).toBe(EXIT.generic)
      expect((error as CliError).details).toEqual({
        registry: 'http://registry.test',
        requestId: 'req-404'
      })
    }
  })

  test('whoami() uses the resource fallback on an unstructured 404', async () => {
    const fetchImpl = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.whoami()).rejects.toMatchObject({
      message: 'resource not found',
      exitCode: EXIT.generic,
      details: { registry: 'http://registry.test' }
    })
  })

  test('download() preserves a structured 403 message and request ID', async () => {
    const fetchImpl = (async () => Response.json({
      code: 403,
      msg: 'namespace access denied',
      requestId: 'req-download'
    }, { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    try {
      await client.download('team', 'private-skill')
      throw new Error('expected download to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(CliError)
      expect((error as CliError).message).toBe('namespace access denied')
      expect((error as CliError).exitCode).toBe(EXIT.auth)
      expect((error as CliError).details).toEqual({
        registry: 'http://registry.test',
        requestId: 'req-download'
      })
    }
  })

  test('whoami() surfaces server reason and request ID on 403', async () => {
    const fetchImpl = (async () => Response.json({
      code: 403,
      msg: 'API token cannot access endpoint: /api/cli/v1/whoami',
      requestId: 'req-610'
    }, { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.whoami()).rejects.toMatchObject({
      message: 'API token cannot access endpoint: /api/cli/v1/whoami',
      exitCode: EXIT.auth,
      details: {
        registry: 'http://registry.test',
        requestId: 'req-610'
      }
    })
  })

  test('whoami() falls back to generic access denied when 403 body is invalid', async () => {
    const fetchImpl = (async () => new Response('not-json', { status: 403 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.whoami()).rejects.toMatchObject({
      message: 'access denied',
      exitCode: EXIT.auth,
      details: { registry: 'http://registry.test' }
    })
  })

  test('whoami() preserves public fields on a structured 500', async () => {
    const fetchImpl = (async () => Response.json({
      code: 500,
      msg: 'registry operation failed',
      requestId: 'req-500',
      detail: 'internal database error'
    }, { status: 500 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.whoami()).rejects.toMatchObject({
      message: 'registry operation failed',
      exitCode: EXIT.generic,
      details: {
        registry: 'http://registry.test',
        requestId: 'req-500'
      }
    })
  })

  test('whoami() does not expose a raw non-JSON 500 body', async () => {
    const fetchImpl = (async () => new Response('internal stack trace', { status: 500 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.whoami()).rejects.toMatchObject({
      message: 'registry returned 500',
      exitCode: EXIT.generic,
      details: { registry: 'http://registry.test' }
    })
  })

  test('search() preserves public fields and network classification on a structured 502', async () => {
    const fetchImpl = (async () => Response.json({
      code: 502,
      msg: 'registry upstream unavailable',
      requestId: 'req-502'
    }, { status: 502 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.search('test', 20)).rejects.toMatchObject({
      message: 'registry upstream unavailable',
      exitCode: EXIT.network,
      details: {
        registry: 'http://registry.test',
        requestId: 'req-502'
      }
    })
  })

  test('search() uses the network fallback on an unstructured 502', async () => {
    const fetchImpl = (async () => new Response(null, { status: 502 })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)

    await expect(client.search('test', 20)).rejects.toMatchObject({
      message: 'registry returned 502',
      exitCode: EXIT.network,
      details: { registry: 'http://registry.test' }
    })
  })

  // --- deleteRemote() (P1) ---

  test('deleteRemote() returns result on success', async () => {
    const fetchImpl = (async () => Response.json({
      data: { ok: true, scope: 'remote', action: 'delete', namespace: 'global', slug: 'demo' }
    })) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const result = await client.deleteRemote('global', 'demo')
    expect(result).toEqual({ ok: true, scope: 'remote', action: 'delete', namespace: 'global', slug: 'demo' })
  })

  test('deleteRemote() throws on network error', async () => {
    const fetchImpl = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    const client = new SkillHubClient('http://registry.test', 'token', fetchImpl)
    const err = expect(client.deleteRemote('global', 'demo')).rejects
    await err.toBeInstanceOf(CliError)
    await err.toHaveProperty('message', 'registry unreachable')
    await err.toHaveProperty('exitCode', EXIT.network)
  })
})
