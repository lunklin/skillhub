import { describe, expect, test } from 'bun:test'
import { resolveRegistry, resolveToken } from '../../../src/services/registry-service'

describe('registry-service', () => {
  test('resolves registry by cli arg, env, config order and fails closed when unset', () => {
    expect(resolveRegistry({ registry: 'https://arg.example.com' }, {}, { registry: 'https://config.example.com' }))
      .toBe('https://arg.example.com')
    expect(resolveRegistry({}, { SKILLHUB_REGISTRY: 'https://env.example.com' }, { registry: 'https://config.example.com' }))
      .toBe('https://env.example.com')
    expect(resolveRegistry({}, {}, { registry: 'https://config.example.com' })).toBe('https://config.example.com')
    expect(() => resolveRegistry({}, {}, {})).toThrow('Registry is not configured')
  })

  test('saved official URLs require a per-command registry argument', () => {
    for (const registry of ['https://skill.xfyun.cn', 'https://SKILL.XFYUN.CN./nested']) {
      expect(() => resolveRegistry({}, {}, { registry })).toThrow('explicit authorization')
      expect(() => resolveRegistry({}, { SKILLHUB_REGISTRY: registry }, {})).toThrow('explicit authorization')
      expect(resolveRegistry({ registry }, {}, {})).toBe(registry)
    }
    expect(resolveRegistry({ registry: 'https://private.example' }, { SKILLHUB_REGISTRY: 'https://skill.xfyun.cn' }, {})).toBe('https://private.example')
  })

  test('resolves token by cli arg, env, credentials order', () => {
    expect(resolveToken({ token: 'arg' }, {}, 'stored')).toBe('arg')
    expect(resolveToken({}, { SKILLHUB_TOKEN: 'env' }, 'stored')).toBe('env')
    expect(resolveToken({}, {}, 'stored')).toBe('stored')
  })
})
