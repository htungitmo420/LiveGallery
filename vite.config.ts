import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'

function originFromUrl(raw: string | undefined): string {
  const trimmed = raw?.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : ''
  } catch {
    return ''
  }
}

function supabasePreconnectPlugin(apiOrigin: string): Plugin {
  return {
    name: 'supabase-preconnect',
    transformIndexHtml() {
      if (!apiOrigin) return []
      const tags: HtmlTagDescriptor[] = [
        { tag: 'link', attrs: { rel: 'dns-prefetch', href: apiOrigin }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'preconnect', href: apiOrigin, crossorigin: '' }, injectTo: 'head' },
      ]
      return tags
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiOrigin = originFromUrl(env.VITE_GALLERY_API_URL) || originFromUrl(env.VITE_SUPABASE_URL)

  return {
    plugins: [react(), supabasePreconnectPlugin(apiOrigin)],
  }
})
