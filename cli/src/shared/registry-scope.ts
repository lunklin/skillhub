export function isOfficialRegistry(registry: string): boolean {
  try { return new URL(registry).hostname.toLowerCase().replace(/\.$/, '') === 'skill.xfyun.cn' } catch { return false }
}

export function isWithinRegistryScope(registry: string, target: URL): boolean {
  try {
    const base = new URL(registry)
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return false
    base.pathname = `${base.pathname.replace(/\/+$/, '')}/`
    if (target.origin !== base.origin || target.username || target.password) return false
    const within = (path: string, prefix: string) => path === prefix.slice(0, -1) || path.startsWith(prefix)
    const decoded = decodeURIComponent(target.pathname)
    const decodedBase = decodeURIComponent(base.pathname)
    if (decoded.includes('\\') || /%[a-f0-9]{2}/i.test(decoded)
      || decoded.split('/').some(segment => segment === '.' || segment === '..')) return false
    return within(target.pathname, base.pathname) && within(decoded, decodedBase)
  } catch { return false }
}

export function isAllowedOfficialDestination(registry: string, target: URL): boolean {
  return !isOfficialRegistry(target.href) || (isOfficialRegistry(registry) && isWithinRegistryScope(registry, target))
}
