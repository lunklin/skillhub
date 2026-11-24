#!/usr/bin/env python3
"""Check effective CHEERY overlay values without starting containers."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
base = ['docker', 'compose', '--env-file', '.env.release.example', '-f', 'compose.release.yml']

def render(extra):
    result = subprocess.run(base + extra + ['config', '--format', 'json'], cwd=root,
                            capture_output=True, text=True, check=True)
    return json.loads(result.stdout)

original = render([])
effective = render(['-f', 'compose.cheery-security.yml'])
expected = {
    'SKILLHUB_BUILTIN_SKILLS_ENABLED': 'false',
    'SKILLHUB_SECURITY_SCANNER_ENABLED': 'true',
    'SKILLHUB_SCANNER_USE_BEHAVIORAL': 'true',
    'SKILLHUB_SCANNER_USE_LLM': 'false',
    'SKILLHUB_SCANNER_USE_AI_DEFENSE': 'false',
    'SKILLHUB_SCANNER_USE_VIRUSTOTAL': 'false',
    'SKILLHUB_SCANNER_USE_TRIGGER': 'false',
    'SKILLHUB_BUSINESS_LOGS_ENABLED': 'false',
    'SKILLHUB_TRACING_MODE': 'none',
}
for name, value in expected.items():
    assert effective['services']['server']['environment'].get(name) == value, name
for service in ('server', 'skill-scanner'):
    for field in ('image', 'ports', 'volumes', 'networks'):
        assert original['services'][service].get(field) == effective['services'][service].get(field), (service, field)
print('PASS: effective security flags; image, ports, volumes and networks preserved')
