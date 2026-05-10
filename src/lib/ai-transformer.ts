// ── AI Framework Transformer ──────────────────────────────────────────────────
// Converts non-Next.js files (Vue, Svelte, React/Vite) to Next.js App Router
// before they are embedded into the vector store.
//
// Why this matters:
//   If we embed Vue/Svelte code into the vector store but the sandbox runs
//   Next.js, the AI's "memory" will suggest code that doesn't match the
//   sandbox environment. Converting before embedding ensures the vector store
//   perfectly mirrors what the agent will actually write.
//
// Used by: embedRepoFilesFunction → transform-framework-files step

import * as Sentry from '@sentry/nextjs'

// File extensions that need transformation per framework
const TRANSFORM_EXTENSIONS: Record<string, string[]> = {
  vue:    ['.vue'],
  svelte: ['.svelte'],
  react:  ['.jsx'],  // convert JSX → TSX
}

// Files we never transform — keep as-is
const SKIP_PATTERNS = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.env',
  '.env.example',
  '.gitignore',
  'README',
  'LICENSE',
]

function shouldSkip(filePath: string): boolean {
  return SKIP_PATTERNS.some((p) => filePath.includes(p))
}

function getTransformExtensions(framework: string): string[] {
  return TRANSFORM_EXTENSIONS[framework] ?? []
}

function renameToNextJs(filePath: string, framework: string): string {
  if (framework === 'vue')    return filePath.replace(/\.vue$/, '.tsx')
  if (framework === 'svelte') return filePath.replace(/\.svelte$/, '.tsx')
  if (framework === 'react')  return filePath.replace(/\.jsx$/, '.tsx')
  return filePath
}

// ── LLM transformation ────────────────────────────────────────────────────────

async function convertFileToNextJs(
  filePath: string,
  content:  string,
  framework: string,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const frameworkInstructions: Record<string, string> = {
    vue: `Convert this Vue 3 SFC (.vue file) to a Next.js 15 App Router TypeScript component (.tsx).
Rules:
- <template> → JSX/TSX with React syntax
- <script setup> → functional component with hooks
- v-model → useState + onChange
- v-if / v-show → conditional JSX
- v-for → .map()
- @click, @input → onClick, onChange
- defineProps → function parameters typed with TypeScript interface
- defineEmits → callback props
- Pinia store imports → comment them out with // TODO: replace with Zustand or Context
- Scoped <style> → extract to Tailwind classes where possible, or CSS module import
- Add 'use client' directive if the component has any interactivity (useState, useEffect, event handlers)`,

    svelte: `Convert this Svelte component (.svelte file) to a Next.js 15 App Router TypeScript component (.tsx).
Rules:
- <script> → functional component with hooks
- $: reactive declarations → useMemo or useEffect
- bind:value → useState + onChange
- {#if} → conditional JSX
- {#each} → .map()
- on:click, on:input → onClick, onChange
- Svelte stores ($store) → comment them out with // TODO: replace with Zustand or Context
- <style> → extract to Tailwind classes where possible
- Add 'use client' directive if the component has any interactivity`,

    react: `Convert this React JSX file to a Next.js 15 App Router TypeScript component (.tsx).
Rules:
- Add TypeScript types for all props and state
- Convert PropTypes to TypeScript interfaces
- Keep existing logic intact
- Add 'use client' directive if the component has interactivity
- Use Next.js Link instead of react-router-dom Link`,
  }

  const instruction = frameworkInstructions[framework] ?? `Convert to Next.js 15 App Router TypeScript.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer':  process.env.NEXT_PUBLIC_APP_URL ?? 'https://isotope.app',
      'X-Title':       'Isotope',
    },
    body: JSON.stringify({
      model:       'qwen/qwen3-coder:free',
      max_tokens:  4000,
      temperature: 0.1,
      messages: [
        {
          role:    'system',
          content: `You are a framework migration specialist. ${instruction}

Output ONLY the converted TypeScript/TSX code — no explanation, no markdown code fences.
If the file cannot be meaningfully converted (e.g. it's a config file), output the original unchanged.`,
        },
        {
          role:    'user',
          content: `File: ${filePath}\n\n${content.slice(0, 8000)}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter transform error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? content
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface TransformResult {
  files:          Record<string, string>
  transformedCount: number
  skippedCount:   number
}

/**
 * Transforms non-Next.js framework files to Next.js App Router TSX.
 * Files that don't need transformation are passed through unchanged.
 * Transformation failures are non-fatal — original file is kept.
 *
 * @param files     - Record<filePath, content> from GitHub
 * @param framework - Detected framework: 'vue' | 'svelte' | 'react' | 'nextjs'
 */
export async function transformToNextJs(
  files:     Record<string, string>,
  framework: string,
): Promise<TransformResult> {
  // Next.js repos need no transformation
  if (framework === 'nextjs' || framework === 'node' || framework === 'other') {
    return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
  }

  const extensionsToTransform = getTransformExtensions(framework)
  const result: Record<string, string> = {}
  let transformedCount = 0
  let skippedCount     = 0

  // Process files in parallel batches of 5 — same pattern as vector store
  const entries  = Object.entries(files)
  const BATCH    = 5

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH)

    await Promise.allSettled(
      batch.map(async ([filePath, content]) => {
        const needsTransform = extensionsToTransform.some((ext) => filePath.endsWith(ext))
        const skip           = shouldSkip(filePath)

        if (!needsTransform || skip) {
          result[filePath] = content
          skippedCount++
          return
        }

        try {
          const converted    = await convertFileToNextJs(filePath, content, framework)
          const newPath      = renameToNextJs(filePath, framework)
          result[newPath]    = converted
          transformedCount++
        } catch (err) {
          // Non-fatal — keep original on failure
          Sentry.captureException(err, {
            extra: { context: 'ai-transformer', filePath, framework },
          })
          console.error(`[ai-transformer] Failed to convert ${filePath}:`, err)
          result[filePath] = content
          skippedCount++
        }
      }),
    )
  }

  return { files: result, transformedCount, skippedCount }
}
