import { afterEach, describe, expect, test } from 'bun:test'
import { runCli } from '../helpers/run-cli'

const servers: Array<ReturnType<typeof Bun.serve>> = []
afterEach(() => { for (const server of servers.splice(0)) server.stop(true) })

describe('update command', () => {
  test.each([{ args: ['update', '--json'] }, { args: ['update', '--check', '--json'] }])('refuses %j without contacting npm', async ({ args }) => {
    let calls = 0
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() { calls++; return Response.json({ version: '99.0.0' }) } })
    servers.push(server)
    const result = await runCli([...args], { SKILLHUB_NPM_REGISTRY: server.url.href })
    expect(result.exitCode).toBe(5)
    expect(JSON.parse(result.stderr).message).toContain('reviewed CHEERY Fork release process')
    expect(calls).toBe(0)
  })
})
