'use client'

/**
 * CodeView — syntax highlighting via Shiki.
 * Shiki runs server-side and inlines styles, so no separate CSS theme file is needed.
 * Run `npm install shiki` if not already installed.
 */

import { useEffect, useState } from 'react'

interface Props {
  code: string
  lang: string
}

// Language aliases — map common extensions to Shiki-supported grammar ids
const LANG_MAP: Record<string, string> = {
  tsx: 'tsx',
  ts: 'typescript',
  typescript: 'typescript',
  jsx: 'jsx',
  js: 'javascript',
  javascript: 'javascript',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  sh: 'bash',
  bash: 'bash',
  shell: 'bash',
  prisma: 'prisma',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
}

export const CodeView = ({ code, lang }: Props) => {
  const [html, setHtml] = useState<string>('')

  useEffect(() => {
    let cancelled = false

    const highlight = async () => {
      try {
        // Dynamic import keeps Shiki out of the initial bundle
        const { codeToHtml } = await import('shiki')
        const resolvedLang = LANG_MAP[lang] ?? 'plaintext'

        const result = await codeToHtml(code, {
          lang: resolvedLang,
          theme: 'github-dark-default',
        })

        if (!cancelled) setHtml(result)
      } catch {
        // Fallback to plain text if Shiki fails (e.g. unknown language)
        if (!cancelled) {
          setHtml(
            `<pre style="margin:0;padding:0;background:transparent"><code>${code
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}</code></pre>`,
          )
        }
      }
    }

    highlight()
    return () => { cancelled = true }
  }, [code, lang])

  return (
    <div
      className="p-2 bg-transparent text-xs [&>pre]:!bg-transparent [&>pre]:!m-0 [&>pre]:!p-0 [&>pre]:!rounded-none [&>pre]:!border-none"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is trusted
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
