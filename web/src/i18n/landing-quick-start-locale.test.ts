import { describe, expect, it } from 'vitest'
import skillGuideTemplate from '../docs/skill.md.template?raw'
import en from './locales/en.json'
import ko from './locales/ko.json'
import ru from './locales/ru.json'
import zh from './locales/zh.json'

describe('landing quick start locales', () => {
  it('uses localized agent setup prompts for chinese, english, and russian', () => {
    expect(zh.landing.quickStart.agent.command).toBe('请根据 https://www.example.com/registry/skill.md 接入 SkillHub')
    expect(en.landing.quickStart.agent.command).toBe('Connect SkillHub using https://www.example.com/registry/skill.md')
    expect(ru.landing.quickStart.agent.command).toBe('Подключите SkillHub по инструкции https://www.example.com/registry/skill.md')
  })

  it('provides command templates with url placeholder for dynamic rendering', () => {
    expect(zh.landing.quickStart.agent.commandTemplate).toBe('请根据 {{url}} 接入 SkillHub')
    expect(en.landing.quickStart.agent.commandTemplate).toBe('Connect SkillHub using {{url}}')
    expect(ru.landing.quickStart.agent.commandTemplate).toBe('Подключите SkillHub по инструкции {{url}}')
    expect(zh.landing.quickStart.human.commandTemplate).toContain('--registry {{url}}')
    expect(en.landing.quickStart.human.commandTemplate).toContain('--registry {{url}}')
    expect(ru.landing.quickStart.human.commandTemplate).toContain('--registry {{url}}')
  })

  it('keeps exact skill installs on the selected registry', () => {
    for (const prompt of [
      zh.skillDetail.installForAgent.prompt,
      en.skillDetail.installForAgent.prompt,
      ru.skillDetail.installForAgent.prompt,
      ko.skillDetail.installForAgent.prompt,
    ]) {
      expect(prompt).toContain('{{guideUrl}}')
      expect(prompt).toContain('{{skill}}')
      expect(prompt).toContain('{{version}}')
      expect(prompt).not.toContain('fallback')
      expect(prompt).not.toContain('备用公共')
      expect(prompt).not.toMatch(/若无法安装|If installation fails|Если установка не удалась/)
      expect(prompt).not.toMatch(/不要改用其他来源|do not use another source|не используйте другой источник/)
    }
  })

  it('keeps the native CLI guide bound to the selected registry', () => {
    expect(skillGuideTemplate).toContain('name: skillhub-cli')
    expect(skillGuideTemplate).toContain('version: 2.0.3-cheery.1')
    expect(skillGuideTemplate).toContain('reviewed CHEERY Fork build')
    expect(skillGuideTemplate).toContain('the `registry` field in `~/.skillhub/config.json`')
    expect(skillGuideTemplate).toContain('if no registry is configured, stop')
    expect(skillGuideTemplate).toContain('Never turn an inherited public URL into an explicit `--registry` argument')
    expect(skillGuideTemplate).not.toContain('https://skill.xfyun.cn')
    expect(skillGuideTemplate).toContain('Do not install or update a CLI automatically')
    expect(skillGuideTemplate).not.toContain('${SKILLHUB_PUBLIC_BASE_URL}')
    expect(skillGuideTemplate).toContain('Treat `<registry>` below as a value to replace')
    expect(skillGuideTemplate).toContain([
      'skillhub install @global/skillhub-cli \\',
      '  --version 2.0.3-cheery.1 \\',
      '  --scope user',
    ].join('\n'))
    expect(skillGuideTemplate).toContain('PowerShell 7')
    expect(skillGuideTemplate).toContain('do not search for or substitute a similarly named package')
    expect(skillGuideTemplate).toContain('ask before querying another registry')
  })

  it('exposes CLI install command in both locales', () => {
    expect(zh.landing.quickStart.tabs.cli).toBe('CLI')
    expect(zh.landing.quickStart.cli.command).toBe('skillhub version')
    expect(zh.landing.quickStart.cli.description).toBe('先使用已審核的 CHEERY Fork CLI；確認版本後可安裝技能')
    expect(en.landing.quickStart.tabs.cli).toBe('CLI')
    expect(en.landing.quickStart.cli.command).toBe('skillhub version')
    expect(en.landing.quickStart.cli.description).toBe('Use a reviewed CHEERY Fork CLI and check its version before installing skills.')
  })
})
