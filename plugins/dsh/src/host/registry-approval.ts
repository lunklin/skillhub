/** A saved upstream default is not proof of the user's consent to connect. */
export function isOfficialRegistry(value: string): boolean {
  try { return new URL(value.trim()).hostname.replace(/\.$/u, '') === 'skill.xfyun.cn'; } catch { return false; }
}

/** Match consent to the complete normalized source, including scheme, port and path. */
export function isApprovedOfficialRegistry(value: string, approval: string | undefined): boolean {
  if (!isOfficialRegistry(value) || !approval) return false;
  try {
    const source = new URL(value.trim());
    const approved = new URL(approval.trim());
    return ['http:', 'https:'].includes(source.protocol) && !source.username && !source.password
      && !source.search && !source.hash && source.href.replace(/\/+$/u, '') === approved.href.replace(/\/+$/u, '');
  } catch { return false; }
}
