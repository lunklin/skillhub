import { EXIT } from '../shared/constants'
import { CliError } from '../shared/errors'

export function resolveRegistry(
  args: { registry?: string | undefined },
  env: NodeJS.ProcessEnv,
  config: { registry?: string | undefined }
): string {
  const selected = args.registry || env.SKILLHUB_REGISTRY || config.registry
  if (!selected) throw new CliError('Registry is not configured; specify --registry or configure a trusted registry', EXIT.usage)
  return normalizeRegistry(selected)
}

export function resolveToken(
  args: { token?: string | undefined },
  env: NodeJS.ProcessEnv,
  storedToken?: string | undefined
): string | undefined {
  return args.token || env.SKILLHUB_TOKEN || storedToken
}

function normalizeRegistry(registry: string): string {
  return registry.replace(/\/+$/, '')
}

export function isOfficialRegistry(registry: string): boolean {
  try { return new URL(registry).hostname.toLowerCase() === 'skill.xfyun.cn' } catch { return false }
}
