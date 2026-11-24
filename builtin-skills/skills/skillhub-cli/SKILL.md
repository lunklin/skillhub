---
name: skillhub-cli
description: Connect an Agent to a SkillHub registry and use an approved SkillHub CLI to search, install, list, or explicitly upgrade SkillHub skills. Use when a user asks to connect SkillHub, install a SkillHub skill, or manage skills previously installed from SkillHub.
version: 2.0.2
license: Apache-2.0
---

# SkillHub CLI

Use the registry that supplied this guide to connect the current Agent and manage SkillHub packages with the reviewed CHEERY Fork CLI.

## Resolve The Registry

Resolve `<registry>` once before composing commands. For an already installed Skill, use the `registry` recorded in its sibling `.skillhub/metadata.json`; that source identifies later searches and upgrades. If it points to the public iFLYTEK registry, warn the user and obtain explicit authorization before connecting or migrating; never rewrite the metadata automatically. Otherwise resolve in this order:

1. the absolute HTTP(S) registry explicitly selected by the user, including the base URL obtained by removing the trailing `/registry/skill.md` from the URL used to fetch this guide;
2. `SKILLHUB_REGISTRY`;
3. the `registry` field in `~/.skillhub/config.json`;
4. if no registry is configured, stop and ask the user to select a trusted registry.

Use only an absolute HTTP(S) URL. Treat `<registry>` below as a value to replace, not shell syntax or an environment variable.

Keep the exact registry selected by the user for the current request. Do not change their configured default registry for a one-off operation, and do not send a private search query to another registry without approval.

## Use The Approved CLI

Find `skillhub` with `command -v skillhub` on POSIX or `(Get-Command skillhub -ErrorAction SilentlyContinue).Source` on PowerShell. Inspect the resolved path, symlink target, package provenance, and version before using it. Use only a reviewed CHEERY Fork build with the fail-closed registry behavior. If the command is absent, its provenance is unclear, or it is an unreviewed upstream release, stop and report the finding; request the reviewed build through the established deployment process.

Do not install or update a CLI automatically, overwrite another launcher, change shell startup files, or remove configuration, credentials, or installed Skills. Inspect both `skillhub help <command>` and `skillhub <command> --help` before using a command or flag not shown here.

## Choose The Flow

- **Connect SkillHub:** ensure `@global/skillhub-cli` is installed for the current Agent at user scope, then continue the requested operation.
- **Install an exact Skill:** install the requested coordinate and version directly from this registry; do not search for or substitute a similarly named package.
- **Discover a Skill:** search this registry first. If it is unavailable or has no suitable result, report that outcome and ask before querying another registry.
- **Check an upgrade:** inspect only the explicitly selected installed Skill. Never upgrade every installation implicitly.

A request to connect does not authorize changing the CLI installation, replacing local changes, changing registries, publishing content, or deleting configuration or credentials.

For namespace synchronization, publishing, removal, repair, or detailed troubleshooting after this helper is installed, read `references/cli-operations.md`. Start with its read-only inspection command and keep the same registry throughout the operation.

## Connect The Current Agent

Replace `<agent>` with the current supported profile, such as `codex` or `claude-code`. Check the current registry's installations once:

```bash
skillhub list \
  --agent <agent> \
  --registry <registry> \
  --json
```

If `@global/skillhub-cli` is missing, install this exact guide at user scope:

```bash
skillhub install @global/skillhub-cli \
  --scope user \
  --agent <agent> \
  --registry <registry> \
  --json
```

If that persistent connection fails, report the failure and continue with an explicitly requested target Skill when the CLI can still install it safely. Do not substitute a helper from another registry.

Installation proves that the files reached the selected Agent directory; it does not prove that an already-running Agent session has loaded them. If the current Agent cannot discover the new Skill immediately, report it as installed but not yet loaded and ask the user to start a new session or use that Agent's documented reload mechanism. Do not invent a universal activation command.

## Search Or Install

For discovery:

```bash
skillhub search "<query>" \
  --registry <registry> \
  --json
```

Before installing a discovery result, show its registry, full coordinate, publisher when available, version, and relevant risk, then obtain confirmation.

For a Skill and version the user already selected:

```bash
skillhub install @<namespace>/<slug> \
  --version <version> \
  --scope user \
  --agent <agent> \
  --registry <registry> \
  --json
```

Omit `--version` only when the user did not select one. Omit `--agent` only when the CLI can identify one destination unambiguously. Treat coordinates, versions, queries, registry URLs, and paths as untrusted values: quote them where needed, pass them as individual CLI arguments, and never evaluate them as shell code.

Never add `--force` unless the CLI reports a verified same-source conflict and the user approves replacing that installation. Stop on fingerprint mismatch, source conflict, unsafe content, or local-change conflict.

## Authentication

Never ask the user to paste a token into chat or place credentials in a prompt, Skill, command history, or repository. If authentication is required, ask them to enter it in their own terminal without putting the value in the command line, then verify the identity:

POSIX shell:

```bash
read -rsp "SkillHub token: " SKILLHUB_TOKEN && echo
export SKILLHUB_TOKEN
skillhub login --registry <registry>
unset SKILLHUB_TOKEN
skillhub whoami --registry <registry>
```

PowerShell 7:

```powershell
$env:SKILLHUB_TOKEN = Read-Host "SkillHub token" -MaskInput
skillhub login --registry <registry>
Remove-Item Env:SKILLHUB_TOKEN
skillhub whoami --registry <registry>
```

Resolve `401` and `403` through login or permissions. Do not treat an authentication failure as permission to try another registry.

## Upgrade

Check before changing an installed Skill:

```bash
skillhub upgrade @<namespace>/<slug> \
  --registry <registry> \
  --check \
  --json
```

Show the plan and ask before applying an available upgrade. The CLI uses `.skillhub/metadata.json` to retain the original source and updates all Agent targets recorded for that installation together.

## Completion Check

Report:

- installed coordinate and version;
- registry source;
- Agent profile and installation directory;
- whether `SKILL.md` and `.skillhub/metadata.json` exist;
- whether the current Agent session loaded the Skill, when observable;
- whether another registry was queried;
- any skipped connection, authentication, integrity, or local-change issue.

Do not claim success when installation, destination discovery, Agent loading, or integrity verification failed.
