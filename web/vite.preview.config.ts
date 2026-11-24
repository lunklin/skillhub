import { defineConfig, type Plugin } from 'vite'
import appConfig from './vite.config'
import type { SkillSummary } from './src/api/types'

const skills = [
  { id: 1, slug: 'preview-handbook', namespace: 'demo', displayName: 'CHEERY preview handbook', summary: 'Synthetic skill for the local UI preview.', downloadCount: 0, starCount: 0, ratingCount: 0, updatedAt: '2026-11-24T00:00:00Z', canSubmitPromotion: false },
  { id: 2, slug: 'preview-checklist', namespace: 'demo', displayName: 'CHEERY preview checklist', summary: 'Synthetic skill for testing search and navigation.', downloadCount: 0, starCount: 0, ratingCount: 0, updatedAt: '2026-11-24T00:00:00Z', canSubmitPromotion: false },
] satisfies SkillSummary[]

/** Explicit opt-in Vite preview; never imported by the production build. */
function syntheticPreview(): Plugin {
  return {
    name: 'synthetic-ui-preview',
    transformIndexHtml() {
      return [{ tag: 'div', attrs: { role: 'status', lang: 'en', style: 'padding:8px 16px;background:#fff3cd;color:#493800;font:14px/1.5 system-ui;text-align:center' }, children: 'UI preview · Synthetic data · No backend / 合成資料預覽，未連接後端', injectTo: 'body-prepend' }]
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (!url.pathname.startsWith('/api/')) return next()
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        const send = (data: unknown, status = 200) => {
          response.statusCode = status
          response.end(JSON.stringify({ code: status === 200 ? 0 : status, msg: 'Synthetic UI preview', data }))
        }
        if (request.method !== 'GET') return send(null, 405)
        switch (url.pathname) {
          case '/api/v1/site-presentation':
            return send({ version: 0, settings: { siteName: null, logoUrl: null, faviconUrl: null, links: {}, sections: Object.fromEntries(['hero', 'curated', 'capabilities', 'quickStart', 'popular', 'latest', 'enterprise', 'cta', 'footer'].map(id => [id, { enabled: true, texts: {}, items: {} }])) } })
          case '/api/v1/auth/me': return send(null, 401)
          case '/api/v1/auth/providers':
          case '/api/v1/auth/methods':
          case '/api/v1/labels':
          case '/api/web/labels': return send([])
          case '/api/v1/auth/local/capabilities': return send({ enabled: false, registrationEnabled: false, passwordResetEnabled: false })
          case '/api/v1/site-recommendations': return send({ topics: [], featuredSkills: [] })
          case '/api/web/skills': {
            const query = (url.searchParams.get('q') ?? '').toLowerCase()
            const items = skills.filter(skill => `${skill.displayName} ${skill.summary}`.toLowerCase().includes(query))
            return send({ items, total: items.length, page: 0, size: Number(url.searchParams.get('size') ?? 20), totalPages: items.length ? 1 : 0 })
          }
          default: return send(null, 404)
        }
      })
    },
  }
}

export default defineConfig({
  ...appConfig,
  plugins: [...(appConfig.plugins ?? []), syntheticPreview()],
  server: { ...appConfig.server, host: '127.0.0.1', strictPort: true, proxy: {} },
})
