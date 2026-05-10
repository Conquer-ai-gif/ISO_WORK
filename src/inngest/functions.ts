import { createAgent, type Message } from '@inngest/agent-kit'
import { getOpenRouterModel, readerModel } from '@/lib/openrouter'
import * as Sentry from '@sentry/nextjs'

import { inngest } from './client'
import { getSandbox, parseAgentOutput } from './utils'
import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
import { prisma } from '@/lib/db'
import type { Plan } from '@/generated/prisma'
import {
  FRAGMENT_TITLE_PROMPT,
  RESPONSE_PROMPT,
  DESIGN_LIBRARY,
  BACKEND_AGENT_PROMPT,
  ARCHITECTURE_MAP_PROMPT,
  REVIEW_AGENT_PROMPT,
} from '@/prompt'

import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
import { createDbEmitter } from '@/lib/generationEvents'
import { makeEvent } from '@/streaming/events'
import { figmaToTailwindConfig } from '@/lib/figma'
import { generateTaskGraph } from '@/planning/planner'
import { runCodeAgent } from '@/agents/codeAgent'
import { runFixAgent } from '@/agents/fixAgent'
import { createTools } from '@/tools/createTools'
import { upsertFilesToVectorStore, searchSimilarComponents, formatComponentMatches, archiveProjectMemory, searchProjectMemory, formatMemoryMatches } from '@/lib/vector-store'

import { TaskExecutor } from '@/execution/TaskExecutor'
import type { Task, TaskGraph } from '@/execution/taskGraph'
import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildTaskPrompt(
  task: Task,
  userRequest: string,
  imageData?: { mimeType: string; base64: string },
  contextSuffix = '',
): string | unknown[] {
  const text =
    `USER REQUEST: ${userRequest}\n\n` +
    `YOUR TASK (${task.type}): ${task.description}\n\n` +
    `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
    contextSuffix

  if (imageData) {
    return [
      { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
      { type: 'text', text },
    ]
  }
  return text
}

function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
  switch (taskType) {
    case 'ui':
      return DESIGN_LIBRARY + contextSuffix
    case 'backend':
      return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
    default:
      return contextSuffix
  }
}

// ─── main function ────────────────────────────────────────────────────────────

export const codeAgentFunction = inngest.createFunction(
  { id: 'code-agent' },
  { event: 'code-agent/run' },
  async ({ event, step }) => {
    const { messageId, projectId, value, imageUrl } = event.data as {
      messageId: string
      projectId: string
      value: string
      imageUrl?: string
      supabaseUrl?: string
      supabaseAnonKey?: string
    }

    // ── Check current plan status ─────────────────────────────────────────────
    const existingMessage = await step.run('check-plan-status', async () =>
      prisma.message.findUnique({
        where: { id: messageId },
        select: { planStatus: true, plan: true },
      }),
    )

    // ════════════════════════════════════════════════════════════════════════════
    // PLAN PHASE — runs before user approves
    // ════════════════════════════════════════════════════════════════════════════

    if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

      // 1. Get or create persistent sandbox for this project
      const planSandboxId = await step.run('plan-get-sandbox', async () => {
        const { sandboxId } = await getOrCreateSandbox(projectId)
        return sandboxId
      })

      // 2. Restore most-recent files into sandbox for context
      await step.run('plan-restore-files', async () =>
        restoreFilesIntoSandbox(projectId, planSandboxId),
      )

      // 3. Generate Zod-validated task graph
      const taskGraph = await step.run('generate-task-graph', async () =>
        generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan }),
      )

      // 4. Persist plan — UI will show it and await user approval
      await step.run('store-plan', async () =>
        prisma.message.update({
          where: { id: messageId },
          data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
        }),
      )

      return { status: 'awaiting_approval', messageId }
    }

    if (existingMessage.planStatus === 'rejected') {
      return { status: 'rejected', messageId }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // CODING PHASE — runs after user approves plan
    // ════════════════════════════════════════════════════════════════════════════

    // Parse the approved task graph
    let taskGraphData: TaskGraph = { tasks: [] }
    try {
      taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
    } catch {
      /* fall through with empty tasks — fallback to single-agent mode below */
    }
    const tasks: Task[] = taskGraphData?.tasks ?? []

    // ── Set up real-time event emitter ───────────────────────────────────────
    // Declared here so it's available for all steps including exec-restore-files
    const emit = createDbEmitter(messageId)

    // 1. Persistent sandbox (reuses planning sandbox if still alive)
    const sandboxId = await step.run('exec-get-sandbox', async () => {
      const { sandboxId: id } = await getOrCreateSandbox(projectId)
      return id
    })

    // 2. Restore files (from last fragment OR seed from connected GitHub repo)
    const restoredFiles = await step.run('exec-restore-files', async () =>
      restoreFilesIntoSandbox(projectId, sandboxId, emit),
    )

    // 3. Inject project integration keys into sandbox environment
    // Keys are decrypted here and exported as env vars — NEVER logged or exposed elsewhere
    await step.run('inject-integration-keys', async () => {
      try {
        const configs = await prisma.integrationConfig.findMany({
          where: { projectId },
        })
        if (configs.length === 0) return 'skipped: no integration keys configured'

        const { decrypt } = await import('@/lib/encryption')
        const { resolveEnvVar } = await import('@/modules/integrations/server/procedures')
        const sandbox = await getSandbox(sandboxId)

        // Build env file content via file API — NO shell interpolation
        // Keys with backticks, $(...), or newlines cannot execute commands
        const lines: string[] = []
        for (const config of configs) {
          try {
            const plaintext = decrypt(config.encryptedKey, config.iv)
            const envVar = resolveEnvVar(config.provider, config.customEnvVar)
            if (!envVar) continue
            // Single-quote the value — only escape embedded single quotes
            const safeValue = plaintext.replace(/'/g, "'\''")
            lines.push(`export ${envVar}='${safeValue}'`)
          } catch {
            // Non-fatal — if one key fails to decrypt, continue with the rest
          }
        }

        if (lines.length > 0) {
          // Write via file API — value never touches shell until source runs
          await sandbox.files.write('/home/user/.env_isotope', lines.join('\n') + '\n')
        }

        // Source the file so all subsequent sandbox processes inherit the vars
        await sandbox.commands.run(
          '[ -f /home/user/.env_isotope ] && source /home/user/.env_isotope || true',
          { timeout: 3000 },
        )

        return `injected ${lines.length} integration key(s)`
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'inject-integration-keys', projectId } })
        return 'injection failed — continuing without keys'
      }
    })

    // 4. Write Figma tailwind config — only on first generation for a project
    // Skip on follow-up prompts to avoid overwriting user-modified tailwind.config.ts
    await step.run('write-figma-tailwind-config', async () => {
      const figmaFileKey   = process.env.FIGMA_FILE_KEY
      const figmaToken     = process.env.FIGMA_ACCESS_TOKEN
      if (!figmaFileKey || !figmaToken) return 'skipped: no figma config'

      // Only run if this is the first message in the project
      const messageCount = await prisma.message.count({ where: { projectId } })
      if (messageCount > 1) return 'skipped: not first generation'

      try {
        const { figmaToTailwindConfig } = await import('@/lib/figma')
        const tailwindConfig = await figmaToTailwindConfig(figmaFileKey, figmaToken)
        const sandbox = await getSandbox(sandboxId)
        await sandbox.files.write('tailwind.config.ts', tailwindConfig)
        return 'figma tailwind config written'
      } catch (e) {
        return `figma tailwind config failed: ${e}`
      }
    })

    // 5. Look up user plan + userId to select the correct AI model
    const { userPlan, userId } = await step.run('get-user-plan', async () => {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      })
      if (!project?.userId) return { userPlan: 'free', userId: '' }
      const credits = await prisma.credits.findUnique({
        where: { userId: project.userId },
        select: { plan: true },
      })
      return { userPlan: credits?.plan ?? 'free', userId: project.userId }
    })

    // 4b. Project context (supabase, architecture map)
    const projectContext = await step.run('get-project-context', async () =>
      prisma.project.findUnique({
        where: { id: projectId },
        select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
      }),
    )

    // 5. Conversation history (capped at 200 messages, older ones summarized)
    const previousMessages = await step.run('get-previous-messages', async () => {
      const all = await prisma.message.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      // Reverse to chronological order after descending fetch
      all.reverse()
      if (all.length > 8) {
        const old = all.slice(0, all.length - 6)
        const recent = all.slice(all.length - 6)
        const summary = old
          .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
          .map((m: { content: string }) => m.content.slice(0, 200))
          .join(' | ')
        const formatted: { type: string; role: string; content: string }[] = []
        if (summary) {
          formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
        }
        for (const m of recent) {
          formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
        }
        return formatted
      }
      return all.map((m: { role: string; content: string }) => ({
        type: 'text',
        role: m.role === 'ASSISTANT' ? 'assistant' : 'user',
        content: m.content,
      }))
    })

    // 6. Similar components from vector store (if supabase configured)
    const similarComponents = await step.run('search-components-for-coding', async () => {
      if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
      try {
        const matches = await searchSimilarComponents({
          projectId,
          query: value,
          supabaseUrl: projectContext.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
        })
        return formatComponentMatches(matches)
      } catch {
        return ''
      }
    })

    // 6b. Past project memory — relevant decisions from previous sessions
    const pastMemory = await step.run('search-project-memory', async () => {
      if (!projectContext?.supabaseUrl) return ''
      try {
        const matches = await searchProjectMemory({
          projectId,
          query: value,
          supabaseUrl: projectContext.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
        })
        return formatMemoryMatches(matches)
      } catch {
        return ''
      }
    })

    // 7. Build shared context suffix
    const supabaseCtx = (() => {
      const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
      const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
      if (!url || !key) return ''
      return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
    })()

    const archCtx = projectContext?.contextDocument
      ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
      : ''

    const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

    // 8. Parse image attachment
    let imageData: { mimeType: string; base64: string } | undefined
    if (imageUrl) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (match) imageData = { mimeType: match[1], base64: match[2] }
    }

    // ── Shared mutable state (captured by closures below) ────────────────────
    // NOTE: network.run() + tool steps must remain OUTSIDE step.run().
    // Agent Kit's tool handler receives its own step context (toolStep)
    // which conflicts with Inngest's outer step.run() context.

    // Start with restored files — the agent sees the full existing codebase
    // from the start, whether that's a prior generation or a seeded GitHub repo.
    let allFiles: Record<string, string> = restoredFiles.files ?? {}
    const summaries: string[] = []

    // ── Build the AgentRunner used by TaskExecutor ────────────────────────────
    // IMPORTANT: runner does NOT mutate allFiles or summaries directly.
    // Results are stored on the task object and merged by TaskExecutor after
    // each parallel wave completes — this prevents race conditions when two
    // independent tasks run concurrently via Promise.all.
    const makeRunner = (): AgentRunner => ({
      async run(task: Task, ctx: ExecutionContext): Promise<void> {
        // ── Search task — fetch and cache library docs ────────────────────────
        if (task.type === 'search') {
          const { runSearchAgent } = await import('@/lib/search-agent')
          const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { supabaseUrl: true, supabaseAnonKey: true },
          })
          const result = await runSearchAgent({
            libraryName:       task.id.replace(/^search-/, ''),
            description:       task.description,
            sandboxId:         ctx.sandboxId,
            supabaseUrl:       project?.supabaseUrl ?? undefined,
            supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
          })
          ctx.emit(makeEvent('log', {
            data: {
              description: result.fromCache
                ? `Loaded ${result.libraryName} docs from cache`
                : `Fetched and cached ${result.libraryName} docs`,
              message: result.fromCache ? 'docs from cache' : 'docs fetched',
            },
          }))
          ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
            files:   { [result.docFilePath]: result.summary },
            summary: `Fetched docs for ${result.libraryName}`,
          }
          return
        }
        const result = await runCodeAgent({
          sandboxId: ctx.sandboxId,
          userPrompt: buildTaskPrompt(task, value, imageData, contextSuffix),
          history: previousMessages as unknown as Message[],
          allowedFiles: task.files.length > 0 ? task.files : undefined,
          initialFiles: allFiles,
          systemSuffix: buildSystemSuffix(task.type, contextSuffix),
          emit: ctx.emit,
          userPlan,
          taskType: task.type,
          fileCount: task.files.length,  // for complexity scoring
        })

        // Store result on the task object — TaskExecutor merges after each wave
        ;(task as Task & { _result?: typeof result })._result = result
      },
    })

    // ── Per-task TypeScript validation ────────────────────────────────────────
    // Runs after every task completes. Only checks the files that task owned.
    // If errors are found, the fix agent is scoped to those files only.
    let actualFixCount = 0  // track real fix loops for accurate billing

    const validateTask = async (task: Task, ctx: ExecutionContext): Promise<void> => {
      if (task.files.length === 0) return

      const errors = await runTsc(ctx.sandboxId, task.files)
      if (!errors) return

      emit(makeEvent('validation_failed', { taskId: task.id, data: { errors: errors.slice(0, 300) } }))

      actualFixCount++  // increment only when fix agent actually runs

      const fixResult = await runFixAgent({
        sandboxId: ctx.sandboxId,
        existingFiles: allFiles,
        failingFiles: task.files,
        emit: ctx.emit,
        userPlan,
        maxLoops: planFeatures.maxFixLoops,  // enforce plan limit
      })

      allFiles = { ...allFiles, ...fixResult.files }

      emit(makeEvent('fix_completed', { taskId: task.id }))
    }

    // ── Execute via TaskExecutor ──────────────────────────────────────────────
    const execContext: ExecutionContext = { sandboxId, tools: {}, emit }

    const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free
    const maxTasks     = planFeatures.maxTasks

    const rawTaskGraph: TaskGraph = tasks.length > 0
      ? taskGraphData
      : {
          tasks: [{
            id: 'task_1',
            type: 'ui',
            description: value,
            files: [],
            dependsOn: [],
            priority: 1,
          }],
        }

    // Enforce plan task limit — cap the task graph to the user's plan allowance
    const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
      ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
      : rawTaskGraph

    const runner = makeRunner()
    const executor = new TaskExecutor(taskGraphToRun, execContext, {
      maxRetries: 3,
      agents: {
        ui:          runner,
        backend:     runner,
        db:          runner,
        integration: runner,
        search:      runner,
      },
      validate: validateTask,
    })

    // ── Safe post-wave merge ──────────────────────────────────────────────────
    // TaskExecutor emits 'task:result' after each parallel wave completes —
    // guaranteeing sequential merges with no race conditions.
    executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
      allFiles = { ...allFiles, ...result.files }
      if (result.summary) summaries.push(result.summary)
    })

    // TaskExecutor emits generation_started, generation_completed, and generation_failed
    // internally. We only need to catch the throw so Inngest doesn't mark the run as failed.
    let executorFailed = false
    try {
      await executor.run()
    } catch (err) {
      executorFailed = true
      Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
    }

    const combinedSummary = summaries
      .map((s) => s.trim())
      .join('\n')
    // executorFailed captures the authoritative result from TaskExecutor.
    // We also guard against the edge case where no summary or files were produced
    // even if the executor didn't throw (e.g. all tasks were no-ops).
    const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

    // ── Charge credits after execution (V2 — usage-based billing) ────────────
    await step.run('charge-credits-v2', async () => {
      if (!userId) return 'skipped: no userId'
      try {
        const { consumeCreditsV2 } = await import('@/lib/usage')

        // Count actual operations performed during this generation
        const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
        const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
        const fixCount    = executorFailed ? 0 : actualFixCount  // real count, not an approximation

        await consumeCreditsV2({
          userId,
          breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
          reason: 'generation',
        })

        return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
      } catch (e) {
        // Non-fatal — log but don't block the response
        Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
        console.error('[charge-credits-v2] failed:', e)
        return `charge failed: ${e}`
      }
    })
    // ── Review Agent — silent post-generation quality pass ────────────────────
    // Runs after all tasks complete. Fixes broken imports, missing types,
    // unused variables, console.logs, and missing nav links — silently.
    // Non-fatal: if review fails, generation still completes normally.
    // Only runs when files were actually written during this generation.
    await step.run('review-code', async () => {
      if (isError) return 'skipped: generation errored'

      const modifiedFiles = Object.keys(allFiles)
      if (modifiedFiles.length === 0) return 'skipped: no files modified'

      try {
        const fileList = modifiedFiles
          .slice(0, 20)  // cap at 20 files to stay within context
          .map((path) => {
            const content = allFiles[path] ?? ''
            const truncated = content.length > 3000
              ? content.slice(0, 3000) + '\n... (truncated)'
              : content
            return `<file path="${path}">\n${truncated}\n</file>`
          })
          .join('\n\n')

        const reviewTools = createTools({ sandboxId, emit: ctx.emit })
        const reviewAgent = createAgent({
          name:   'review-agent',
          system: REVIEW_AGENT_PROMPT,
          model:  readerModel,  // Gemini Flash — reads all modified files, large context
          tools:  [reviewTools.listFiles, reviewTools.readFiles],
        })

        const reviewInput = [
          `<files_modified>\n${fileList}\n</files_modified>`,
          `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
        ].join('\n\n')

        const { output: reviewOutput } = await reviewAgent.run(reviewInput)

        // Extract <task_summary> tag from review agent output
        const reviewText = reviewOutput
          .filter((m: { type: string }) => m.type === 'text')
          .map((m: { content: string | Array<{ text: string }> }) =>
            Array.isArray(m.content) ? m.content.map((c) => c.text).join('') : m.content,
          )
          .join('')

        const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
        const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
        if (reviewSummary) {
          console.log('[review-agent] summary:', reviewSummary.slice(0, 200))
        } else {
          console.log('[review-agent] completed (no summary emitted)')
        }
        return reviewSummary ? `reviewed: ${reviewSummary}` : 'review completed'
      } catch (err) {
        // Non-fatal — review failure must never block the generation response
        Sentry.captureException(err, {
          extra: { context: 'review-code', projectId, filesCount: modifiedFiles.length },
        })
        console.error('[review-agent] failed (non-fatal):', err)
        return `review failed: ${err}`
      }
    })

    const { fragmentTitle, responseText } = await step.run('generate-title-and-response', async () => {
      const fragmentTitleGenerator = createAgent({
        name:   'fragment-title-generator',
        system: FRAGMENT_TITLE_PROMPT,
        model:  readerModel,
      })
      const responseGenerator = createAgent({
        name:   'response-generator',
        system: RESPONSE_PROMPT,
        model:  readerModel,
      })

      const [titleResult, responseResult] = await Promise.all([
        fragmentTitleGenerator.run(combinedSummary || 'No summary'),
        responseGenerator.run(combinedSummary || 'No summary'),
      ])

      return {
        fragmentTitle:  titleResult.output,
        responseText:   responseResult.output,
      }
    })

    // ── Sandbox URL ───────────────────────────────────────────────────────────
    const sandboxUrl = await step.run('get-sandbox-url', async () => {
      const sandbox = await getSandbox(sandboxId)
      const host = sandbox.getHost(3000)
      return `https://${host}`
    })

    // ── Persist result ────────────────────────────────────────────────────────
    await step.run('save-result', async () => {
      if (isError) {
        return prisma.message.create({
          data: {
            projectId,
            content: 'Something went wrong — please try again',
            role: 'ASSISTANT',
            type: 'ERROR',
          },
        })
      }

      // Parse <required_integrations> from combined summary
      const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
      const requiredIntegrations: string[] = requiredIntegrationsRaw
        ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : []

      return prisma.message.create({
        data: {
          projectId,
          content: parseAgentOutput(responseText),
          role: 'ASSISTANT',
          type: 'RESULT',
          requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
          fragment: {
            create: {
              sandboxUrl,
              title: parseAgentOutput(fragmentTitle),
              files: allFiles,
            },
          },
        },
      })
    })

    // ── Update architecture map (contextDocument) ─────────────────────────────
    await step.run('update-architecture-map', async () => {
      if (isError) return 'skipped: error state'
      const mapAgent = createAgent({
        name: 'architecture-map-agent',
        system: ARCHITECTURE_MAP_PROMPT,
        model: readerModel,  // Gemini Flash — reads all project files, needs large context
      })
      const fileList = Object.entries(allFiles)
        .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
        .join('\n')
      const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)
      const mapText = mapOutput
        .filter((m: Message) => m.type === 'text')
        .map((m: Message) =>
          Array.isArray(m.content) ? m.content.map((c) => c.text).join('') : m.content,
        )
        .join('')
      const cleanMap = mapText.replace(/```json|```/g, '').trim()
      await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
      return 'architecture map updated'
    })

    // ── Upsert files into vector store ────────────────────────────────────────
    await step.run('upsert-vector-store', async () => {
      if (isError) return 'skipped: error state'
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { supabaseUrl: true, supabaseAnonKey: true },
      })
      if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
      try {
        await upsertFilesToVectorStore({
          projectId,
          files: allFiles,
          supabaseUrl: project.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
        })
        return `upserted ${Object.keys(allFiles).length} files`
      } catch (e) {
        Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
        return `upsert failed: ${e}`
      }
    })

    // ── Archive prompt + summary into project memory ──────────────────────────
    await step.run('archive-project-memory', async () => {
      if (isError) return 'skipped: error state'
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { supabaseUrl: true, supabaseAnonKey: true },
      })
      if (!project?.supabaseUrl) return 'skipped: no supabase'
      try {
        await archiveProjectMemory({
          projectId,
          userId,
          userPrompt: value,
          aiSummary: combinedSummary ?? '',
          supabaseUrl: project.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
        })
        return 'memory archived'
      } catch (e) {
        console.error('[archive-project-memory] failed:', e)
        return `failed: ${e}`
      }
    })

    return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
  },
)

// ── Embed repo files after import ────────────────────────────────────────────

export const embedRepoFilesFunction = inngest.createFunction(
  { id: 'embed-repo-files', retries: 2 },
  { event: 'isotope/repo.imported' },
  async ({ event, step }) => {
    const { projectId, userId, owner, repo } = event.data as {
      projectId: string
      userId: string
      owner: string
      repo: string
    }

    // Mark project as indexing
    await step.run('mark-indexing-start', async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: { isIndexing: true },
      })
    })

    try {
      // Fetch repo files from GitHub
      const files = await step.run('fetch-repo-files', async () => {
        const { getGitHubToken } = await import('@/lib/github-token')
        const { getRepoFiles } = await import('@/lib/github')
        const tokenRecord = await getGitHubToken(userId)
        if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
        return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
      })

      // Get project context — Supabase config + framework from contextDocument
      const project = await step.run('get-project', async () => {
        return prisma.project.findUnique({
          where:  { id: projectId },
          select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
        })
      })

      if (!project?.supabaseUrl) {
        await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
        return 'skipped: no supabase configured'
      }

      // ── Transform non-Next.js files before embedding ──────────────────────
      // If the repo is Vue, Svelte, or React/Vite, convert to Next.js TSX first.
      // This ensures the vector store mirrors what the sandbox will actually run —
      // not the original framework code which would cause mismatched suggestions.
      const processedFiles = await step.run('transform-framework-files', async () => {
        try {
          const analysis  = JSON.parse(project.contextDocument ?? '{}')
          const framework = (analysis.framework ?? 'nextjs') as string

          if (framework === 'nextjs') {
            // Already Next.js — no transformation needed
            return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
          }

          console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
          const { transformToNextJs } = await import('@/lib/ai-transformer')
          const result = await transformToNextJs(files, framework)
          console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
          return result
        } catch (err) {
          // Non-fatal — fall back to original files if transformation fails
          console.error('[embed-repo] transform-framework-files failed, using originals:', err)
          return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
        }
      })

      // Embed and store the PROCESSED (converted) files — not the originals
      await step.run('upsert-repo-files', async () => {
        await upsertFilesToVectorStore({
          projectId,
          files:            processedFiles.files,
          supabaseUrl:      project.supabaseUrl!,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
        })
        return `embedded ${Object.keys(processedFiles.files).length} files (${processedFiles.transformedCount} converted)`
      })
    } finally {
      // Always clear the indexing flag — even if embedding fails
      await step.run('mark-indexing-done', async () => {
        await prisma.project.update({
          where: { id: projectId },
          data: { isIndexing: false },
        })
      })
    }

    return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
  },
)

// ── Daily free-credit top-up cron ─────────────────────────────────────────────

export const freeCreditsResetFunction = inngest.createFunction(
  { id: 'free-credits-reset' },
  { cron: '0 0 * * *' },
  async ({ step }) => {
    const count = await step.run('reset-free-credits', async () => resetFreeCredits())
    return { message: `Reset credits for ${count} free user(s)` }
  },
)

// ── Vercel URL refresh — triggered after a GitHub merge ───────────────────────
// Waits 30s for Vercel to start the deploy, then fetches and stores the URL.
// This runs in the background so the GitHub webhook can respond in <5s.
export const refreshVercelUrlFunction = inngest.createFunction(
  { id: 'refresh-vercel-url' },
  { event: 'github/vercel-url-refresh' },
  async ({ event, step }) => {
    const { projectId, vercelProjectId } = event.data as {
      projectId:       string
      vercelProjectId: string
    }

    // Wait 30s for Vercel to start the deploy
    await step.sleep('wait-for-vercel-deploy', '30s')

    await step.run('fetch-and-save-url', async () => {
      const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
      await refreshVercelUrl(projectId, vercelProjectId)
    })

    return { projectId }
  },
)
// GenerationEvent rows are cleaned up per-message when the SSE stream closes.
// This cron is a safety net for any rows that slipped through (e.g. if the
// stream was never opened, or the client disconnected before cleanup ran).
export const purgeGenerationEventsFunction = inngest.createFunction(
  { id: 'purge-generation-events' },
  { cron: '0 2 * * *' },  // 2am daily — low traffic window
  async ({ step }) => {
    const deleted = await step.run('purge-old-events', async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)  // older than 24h
      const result = await prisma.generationEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      })
      return result.count
    })
    return { message: `Purged ${deleted} stale GenerationEvent rows` }
  },
)
