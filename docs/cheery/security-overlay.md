# CHEERY security overlay

`compose.cheery-security.yml` adds the private-deployment security baseline to an existing
release Compose stack. Preserve every existing deployment overlay and load this file last;
validate the resulting Compose configuration before recreating any affected service. For
example, use the actual project name and all existing deployment files:

```sh
docker compose --env-file .env.release -f compose.release.yml \
  -f <existing-deployment-overlay.yml> -f compose.cheery-security.yml \
  -p <existing-project-name> config --quiet
```

The overlay disables external built-in Skill initialization and external scanner engines,
keeps the local scanner and behavioral analyzer enabled, and disables business event export,
tracing and email notifications. It does not change the storage provider, local analytics,
credentials, volumes or listening addresses. It does not prevent outbound network traffic:
separate egress controls and an audit are required. If existing files or the runtime use a
different topology, verify their effective settings and preserve them before applying changes.
