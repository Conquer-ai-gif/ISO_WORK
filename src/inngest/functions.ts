/**
 * codeAgentFunction.ts
 *
 * Core Inngest background functions for the Isotope AI code generation pipeline.
 */

import { createAgent, type Message } from '@inngest/agent-kit'
import { readerModel } from '@/lib/openrouter'
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
import { generateTaskGraph } from '@/planning/planner'
import { runCodeAgent } from '@/agents/codeAgent'
import { runFixAgent } from '@/agents/fixAgent'
import {
  upsertFilesToVectorStore,
  searchSimilarComponents,
  formatComponentMatches,
  archiveProjectMemory,
  searchProjectMemory,
  formatMemoryMatches,
} from '@/lib/vector-store'

import { TaskExecutor } from '@/execution/TaskExecutor'
import type { Task, TaskGraph } from '@/execution/taskGraph'
import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// helpers

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

// main Inngest function

export const codeAgentFunction = inngest.createFunction(
  { id: 'code-agent', retries: 0 },
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

    // ── 1. Resolve the canonical USER message that holds the plan ─────────────
    //
    // BUG FIX: The approval event sometimes arrives with `messageId` pointing
    // to the *assistant's previous result message* (role: ASSISTANT,
    // planStatus: "completed") instead of the *user's pending message*
    // (role: USER, planStatus: "pending" | "approved").
    //
    // Strategy: look up the given messageId first. If it belongs to an
    // ASSISTANT message or has no `plan` attached, fall back to finding the
    // most-recent USER message for this project that has a pending/approved
    // plan. This makes the function robust regardless of which ID the approval
    // trigger sends.
    const resolvedMessage = await step.run('resolve-user-message', async () => {
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, role: true, planStatus: true, plan: true },
      })

      // Valid USER message that owns a plan — use as-is
      if (msg && msg.role === 'USER' && msg.plan) {
        return msg
      }

      // Otherwise find the most-recent USER message for this project that
      // has a plan stored and is not yet completed/rejected.
      const fallback = await prisma.message.findFirst({
        where: {
          projectId,
          role: 'USER',
          plan: { not: null },
          planStatus: { notIn: ['completed', 'rejected'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, role: true, planStatus: true, plan: true },
      })

      if (fallback) {
        console.warn(
          `[code-agent] messageId ${messageId} resolved to wrong message ` +
          `(role=${msg?.role ?? 'not found'}, planStatus=${msg?.planStatus ?? 'n/a'}). ` +
          `Falling back to user message ${fallback.id}`,
        )
      }

      return fallback ?? msg
    })

    // Use the resolved message's ID for all subsequent DB writes
    const workingMessageId = resolvedMessage?.id ?? messageId

    // ── 2. Guard against re-entry ─────────────────────────────────────────────
    if (resolvedMessage?.planStatus === 'completed') {
      return { status: 'already_completed', messageId: workingMessageId }
    }

    if (resolvedMessage?.planStatus === 'rejected') {
      return { status: 'rejected', messageId: workingMessageId }
    }

    // PLAN PHASE — generate task graph and pause for user approval

    if (!resolvedMessage?.planStatus || resolvedMessage.planStatus === 'pending') {

      const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { userId: true },
        })
        if (!project?.userId) return { userPlan: 'free' }
        const credits = await prisma.credits.findUnique({
          where: { userId: project.userId },
          select: { plan: true },
        })
        return { userPlan: credits?.plan ?? 'free' }
      })

      const planSandboxId = await step.run('plan-get-sandbox', async () => {
        const { sandboxId } = await getOrCreateSandbox(projectId)
        return sandboxId
      })

      await step.run('plan-restore-files', async () =>
        restoreFilesIntoSandbox(projectId, planSandboxId),
      )

      const taskGraph = await step.run('generate-task-graph', async () =>
        generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
      )

      await step.run('store-plan', async () =>
        prisma.message.update({
          where: { id: workingMessageId },
          data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
        }),
      )

      return { status: 'awaiting_approval', messageId: workingMessageId }
    }

    // CODING PHASE — runs after user approves the plan

    // Mark as 'approved' immediately so any duplicate events return early
    await step.run('mark-coding-started', async () =>
      prisma.message.update({
        where: { id: workingMessageId },
        data: { planStatus: 'approved' },
      }),
    )

    // BUG FIX: Re-fetch `plan` fresh inside a durable step rather than
    // relying on resolvedMessage.plan which is the replayed step result from
    // before approval. On Inngest resume the top-level async context
    // re-executes and resolvedMessage is replayed from the event log — its
    // `plan` field may be stale if the plan was written after that step ran.
    const freshPlan = await step.run('fetch-plan', async () => {
      const msg = await prisma.message.findUnique({
        where: { id: workingMessageId },
        select: { plan: true },
      })
      return msg?.plan ?? null
    })

    let taskGraphData: TaskGraph = { summary: '', tasks: [] }
    try {
      taskGraphData = JSON.parse(freshPlan ?? '{}') as TaskGraph
    } catch {
      /* fall through — will default to single-agent mode below */
    }
    const tasks: Task[] = taskGraphData?.tasks ?? []

    const emit = createDbEmitter(workingMessageId)

    // Durable setup steps (Prisma only — safe inside step.run)

    const sandboxId = await step.run('exec-get-sandbox', async () => {
      const { sandboxId: id } = await getOrCreateSandbox(projectId)
      return id
    })

    const restoredFiles = await step.run('exec-restore-files', async () =>
      restoreFilesIntoSandbox(projectId, sandboxId, emit),
    )

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

    const projectContext = await step.run('get-project-context', async () =>
      prisma.project.findUnique({
        where: { id: projectId },
        select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
      }),
    )

    const previousMessages = await step.run('get-previous-messages', async () => {
      const all = await prisma.message.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
      all.reverse()

      if (all.length > 8) {
        const old    = all.slice(0, all.length - 6)
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
        type:    'text',
        role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
        content: m.content,
      }))
    })

    const similarComponents = await step.run('search-components-for-coding', async () => {
      if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
      try {
        const matches = await searchSimilarComponents({
          projectId,
          query:              value,
          supabaseUrl:        projectContext.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
        })
        return formatComponentMatches(matches)
      } catch {
        return ''
      }
    })

    const pastMemory = await step.run('search-project-memory', async () => {
      if (!projectContext?.supabaseUrl) return ''
      try {
        const matches = await searchProjectMemory({
          projectId,
          query:              value,
          supabaseUrl:        projectContext.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
        })
        return formatMemoryMatches(matches)
      } catch {
        return ''
      }
    })

    // Build shared context suffix

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

    let imageData: { mimeType: string; base64: string } | undefined
    if (imageUrl) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (match) imageData = { mimeType: match[1], base64: match[2] }
    }

    // Seed allFiles from the durable step return value (safe across Inngest
    // resume — replayed from the event log, not a closed-over mutable variable)
    let allFiles: Record<string, string> = restoredFiles.files ?? {}
    const summaries: string[] = []

    // AgentRunner — called by TaskExecutor for each task
    const makeRunner = (): AgentRunner => ({
      async run(task: Task, ctx: ExecutionContext): Promise<void> {

        if (task.type === 'search') {
          const { runSearchAgent } = await import('@/lib/search-agent')
          const project = await prisma.project.findUnique({
            where: { id: projectId },
            select: { supabaseUrl: true, supabaseAnonKey: true },
          })
          const result = await runSearchAgent({
            libraryName:        task.id.replace(/^search-/, ''),
            description:        task.description,
            sandboxId:          ctx.sandboxId,
            supabaseUrl:        project?.supabaseUrl ?? undefined,
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
          sandboxId:    ctx.sandboxId,
          userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
          history:      previousMessages as unknown as Message[],
          allowedFiles: task.files.length > 0 ? task.files : undefined,
          initialFiles: allFiles,
          systemSuffix: buildSystemSuffix(task.type, contextSuffix),
          emit:         ctx.emit,
          userPlan,
          taskType:     task.type,
          fileCount:    task.files.length,
          taskId:       task.id,
        })

        ;(task as Task & { _result?: typeof result })._result = result
      },
    })

    // Build and run the TaskExecutor
    const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free
    const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
    const maxTasks = planFeatures.maxTasks

    const rawTaskGraph: TaskGraph = tasks.length > 0
      ? taskGraphData
      : {
          summary: '',
          tasks: [{
            id:          'task_1',
            type:        'ui',
            description: value,
            files:       [],
            dependsOn:   [],
            priority:    1,
          }],
        }

    const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
      ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
      : rawTaskGraph

    const runner = makeRunner()

    // `validate` removed from TaskExecutor options — TypeScript validation now
    // runs once after executor.run() finishes (see post-executor block below).
    const executor = new TaskExecutor(taskGraphToRun, execContext, {
      maxRetries: 0,
      agents: {
        ui:          runner,
        backend:     runner,
        db:          runner,
        integration: runner,
        search:      runner,
      },
    })

    executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
      // #region agent log
      fetch('http://127.0.0.1:7421/ingest/513a4f58-6002-4944-98a0-ba339a997cb4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'55e940'},body:JSON.stringify({sessionId:'55e940',runId:'pre-fix',hypothesisId:'A',location:'functions.ts:task-result',message:'task result merged',data:{resultFiles:Object.keys(result.files).length,hasSummary:!!result.summary,allFilesBefore:Object.keys(allFiles).length,summariesBefore:summaries.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      allFiles = { ...allFiles, ...result.files }
      if (result.summary) summaries.push(result.summary)
    })


    // let executorFailed = false
    //   try {
    //     await step.run('execute-all-tasks', async () => {
    //       await executor.run()
    //     })
    //   } catch (err) {
    //     executorFailed = true
    //     Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
    //   }

    let executorFailed = false
    try {
      await executor.run()
    } catch (err) {
      executorFailed = true
      // #region agent log
      fetch('http://127.0.0.1:7421/ingest/513a4f58-6002-4944-98a0-ba339a997cb4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'55e940'},body:JSON.stringify({sessionId:'55e940',runId:'pre-fix',hypothesisId:'B',location:'functions.ts:executor-catch',message:'executor threw',data:{error:err instanceof Error?err.message:String(err),allFiles:Object.keys(allFiles).length,summaries:summaries.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
    }

    // Single TypeScript validation pass over ALL completed task files.
    // Runs once after every agent has written its files so the type checker
    // sees the full picture. Avoids false positives from partial file states
    // mid-execution and limits fix charges to at most one per generation.
    let actualFixCount = 0

    if (!executorFailed) {
      const allTaskFiles = taskGraphToRun.tasks
        .filter((t) => t.type !== 'search' && t.files.length > 0)
        .flatMap((t) => t.files)
        .filter((f, i, arr) => arr.indexOf(f) === i)

      if (allTaskFiles.length > 0) {
        const errors = await runTsc(sandboxId, allTaskFiles)

        if (errors) {
          emit(makeEvent('validation_failed', { taskId: 'post-execution', data: { errors: errors.slice(0, 300) } }))
          actualFixCount++

          const fixResult = await runFixAgent({
            sandboxId,
            existingFiles: allFiles,
            failingFiles:  allTaskFiles,
            emit,
            userPlan,
            maxLoops: planFeatures.maxFixLoops,
          })

          // #region agent log
          fetch('http://127.0.0.1:7421/ingest/513a4f58-6002-4944-98a0-ba339a997cb4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'55e940'},body:JSON.stringify({sessionId:'55e940',runId:'pre-fix',hypothesisId:'C',location:'functions.ts:fix-result',message:'fix agent returned',data:{fixed:fixResult.fixed,remainingErrors:fixResult.remainingErrors?.slice(0,180)??'',returnedFiles:Object.keys(fixResult.files??{}).length},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          allFiles = { ...allFiles, ...fixResult.files }
          emit(makeEvent('fix_completed', { taskId: 'post-execution' }))
        }
      }
    }

    const combinedSummary = summaries.map((s) => s.trim()).join('\n')
    const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0
    // #region agent log
    fetch('http://127.0.0.1:7421/ingest/513a4f58-6002-4944-98a0-ba339a997cb4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'55e940'},body:JSON.stringify({sessionId:'55e940',runId:'pre-fix',hypothesisId:'D',location:'functions.ts:isError',message:'computed isError',data:{executorFailed,summariesLen:summaries.length,allFilesLen:Object.keys(allFiles).length,isError,summaryPreview:combinedSummary.slice(0,160)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Charge credits (durable step — Prisma only)
    await step.run('charge-credits-v2', async () => {
      if (!userId) return 'skipped: no userId'
      try {
        const { consumeCreditsV2 } = await import('@/lib/usage')
        const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
        const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
        const fixCount    = executorFailed ? 0 : actualFixCount
        await consumeCreditsV2({
          userId,
          breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
          reason: 'generation',
        })
        return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
      } catch (e) {
        Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
        console.error('[charge-credits-v2] failed:', e)
        return `charge failed: ${e}`
      }
    })

    // Review Agent
    if (!isError && Object.keys(allFiles).length > 0) {
      try {
        const modifiedFiles = Object.keys(allFiles)
        const fileList = modifiedFiles
          .slice(0, 20)
          .map((path) => {
            const content   = allFiles[path] ?? ''
            const truncated = content.length > 3000
              ? content.slice(0, 3000) + '\n... (truncated)'
              : content
            return `<file path="${path}">\n${truncated}\n</file>`
          })
          .join('\n\n')

        const reviewAgent = createAgent({
          name:   'review-agent',
          system: REVIEW_AGENT_PROMPT,
          model:  (readerModel as unknown) as any,
        })

        const reviewInput = [
          `<files_modified>\n${fileList}\n</files_modified>`,
          `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
        ].join('\n\n')

        const { output: reviewOutput } = await reviewAgent.run(reviewInput)

        const reviewText = reviewOutput
          .filter((m) => (m as any).type === 'text')
          .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
          .join('')

        const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
        const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
        console.log(reviewSummary
          ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
          : '[review-agent] completed (no summary emitted)',
        )
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
        })
        console.error('[review-agent] failed (non-fatal):', err)
      }
    }

    // Fragment title + assistant response
    const fragmentTitleGenerator = createAgent({
      name:   'fragment-title-generator',
      system: FRAGMENT_TITLE_PROMPT,
      model:  (readerModel as unknown) as any,
    })
    const responseGenerator = createAgent({
      name:   'response-generator',
      system: RESPONSE_PROMPT,
      model:  (readerModel as unknown) as any,
    })

    const [titleResult, responseResult] = await Promise.all([
      fragmentTitleGenerator.run(combinedSummary || 'No summary'),
      responseGenerator.run(combinedSummary || 'No summary'),
    ])

    // Sandbox URL (durable step — no agents)
    const sandboxUrl = await step.run('get-sandbox-url', async () => {
      const sandbox = await getSandbox(sandboxId)
      const host    = sandbox.getHost(3000)
      return `https://${host}`
    })

    // Persist result to DB (durable step — Prisma only)
    await step.run('save-result', async () => {
      // #region agent log
      fetch('http://127.0.0.1:7421/ingest/513a4f58-6002-4944-98a0-ba339a997cb4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'55e940'},body:JSON.stringify({sessionId:'55e940',runId:'pre-fix',hypothesisId:'E',location:'functions.ts:save-result-entry',message:'save-result entered',data:{isError,executorFailed,summariesLen:summaries.length,allFilesLen:Object.keys(allFiles).length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (isError) {
        // #region agent log
        fetch('http://127.0.0.1:7421/ingest/513a4f58-6002-4944-98a0-ba339a997cb4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'55e940'},body:JSON.stringify({sessionId:'55e940',runId:'pre-fix',hypothesisId:'E',location:'functions.ts:save-result-error-branch',message:'saving ERROR message',data:{projectId,allFilesLen:Object.keys(allFiles).length,summariesLen:summaries.length,executorFailed},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return prisma.message.create({
          data: {
            projectId,
            content: 'Something went wrong — please try again',
            role:    'ASSISTANT',
            type:    'ERROR',
          },
        })
      }

      const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
      const requiredIntegrations: string[] = requiredIntegrationsRaw
        ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : []

      return prisma.message.create({
        data: {
          projectId,
          content:              parseAgentOutput(responseResult.output),
          role:                 'ASSISTANT',
          type:                 'RESULT',
          requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
          fragment: {
            create: {
              sandboxUrl,
              title: parseAgentOutput(titleResult.output),
              files: allFiles,
            },
          },
        },
      })
    })

    // Architecture map update
    if (!isError) {
      try {
        const mapAgent = createAgent({
          name:   'architecture-map-agent',
          system: ARCHITECTURE_MAP_PROMPT,
          model:  (readerModel as unknown) as any,
        })
        const fileList = Object.entries(allFiles)
          .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
          .join('\n')

        const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

        const mapText = mapOutput
          .filter((m) => (m as any).type === 'text')
          .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
          .join('')
        const cleanMap = mapText.replace(/```json|```/g, '').trim()

        await step.run('update-architecture-map', async () => {
          await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
          return 'architecture map updated'
        })
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
      }
    }

    // Vector store upsert (durable step — no agents)
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
          files:              allFiles,
          supabaseUrl:        project.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
        })
        return `upserted ${Object.keys(allFiles).length} files`
      } catch (e) {
        Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
        return `upsert failed: ${e}`
      }
    })

    // Project memory archive (durable step — no agents)
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
          userPrompt:         value,
          aiSummary:          combinedSummary ?? '',
          supabaseUrl:        project.supabaseUrl,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
        })
        return 'memory archived'
      } catch (e) {
        console.error('[archive-project-memory] failed:', e)
        return `failed: ${e}`
      }
    })

    // Mark as completed so any future duplicate events return early
    await step.run('mark-completed', async () =>
      prisma.message.update({
        where: { id: workingMessageId },
        data: { planStatus: 'completed' },
      }),
    )

    return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
  },
)

// Embed repo files after GitHub import

export const embedRepoFilesFunction = inngest.createFunction(
  { id: 'embed-repo-files', retries: 2 },
  { event: 'isotope/repo.imported' },
  async ({ event, step }) => {
    const { projectId, userId, owner, repo } = event.data as {
      projectId: string
      userId:    string
      owner:     string
      repo:      string
    }

    await step.run('mark-indexing-start', async () => {
      await prisma.project.update({
        where: { id: projectId },
        data:  { isIndexing: true },
      })
    })

    let files: Record<string, string> = {}
    let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

    try {
      files = await step.run('fetch-repo-files', async () => {
        const { getGitHubToken } = await import('@/lib/github-token')
        const { getRepoFiles }   = await import('@/lib/github')
        const tokenRecord = await getGitHubToken(userId)
        if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
        return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
      })

      const project = await step.run('get-project', async () =>
        prisma.project.findUnique({
          where:  { id: projectId },
          select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
        }),
      )

      if (!project?.supabaseUrl) {
        await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
        return 'skipped: no supabase configured'
      }

      processedFiles = await step.run('transform-framework-files', async () => {
        try {
          const analysis  = JSON.parse(project.contextDocument ?? '{}')
          const framework = (analysis.framework ?? 'nextjs') as string

          if (framework === 'nextjs') {
            return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
          }

          console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} to Next.js`)
          const { transformToNextJs } = await import('@/lib/ai-transformer')
          const result = await transformToNextJs(files, framework)
          console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
          return result
        } catch (err) {
          console.error('[embed-repo] transform-framework-files failed, using originals:', err)
          return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
        }
      })

      await step.run('upsert-repo-files', async () => {
        await upsertFilesToVectorStore({
          projectId,
          files:              processedFiles!.files,
          supabaseUrl:        project.supabaseUrl!,
          supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
        })
        return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
      })
    } finally {
      await step.run('mark-indexing-done', async () => {
        await prisma.project.update({
          where: { id: projectId },
          data:  { isIndexing: false },
        })
      })
    }

    return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
  },
)

// Daily free-credit top-up cron

export const freeCreditsResetFunction = inngest.createFunction(
  { id: 'free-credits-reset' },
  { cron: '0 0 * * *' },
  async ({ step }) => {
    const count = await step.run('reset-free-credits', async () => resetFreeCredits())
    return { message: `Reset credits for ${count} free user(s)` }
  },
)

// Vercel URL refresh after GitHub merge

export const refreshVercelUrlFunction = inngest.createFunction(
  { id: 'refresh-vercel-url' },
  { event: 'github/vercel-url-refresh' },
  async ({ event, step }) => {
    const { projectId, vercelProjectId } = event.data as {
      projectId:       string
      vercelProjectId: string
    }

    await step.sleep('wait-for-vercel-deploy', '30s')

    await step.run('fetch-and-save-url', async () => {
      const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
      await refreshVercelUrl(projectId, vercelProjectId)
    })

    return { projectId }
  },
)

// Stale GenerationEvent cleanup cron

export const purgeGenerationEventsFunction = inngest.createFunction(
  { id: 'purge-generation-events' },
  { cron: '0 2 * * *' },
  async ({ step }) => {
    const deleted = await step.run('purge-old-events', async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const result = await prisma.generationEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      })
      return result.count
    })
    return { message: `Purged ${deleted} stale GenerationEvent rows` }
  },
)

// /**
//  * codeAgentFunction.ts
//  *
//  * Core Inngest background functions for the Isotope AI code generation pipeline.
//  */

// import { createAgent, type Message } from '@inngest/agent-kit'
// import { readerModel } from '@/lib/openrouter'
// import * as Sentry from '@sentry/nextjs'

// import { inngest } from './client'
// import { getSandbox, parseAgentOutput } from './utils'
// import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
// import { prisma } from '@/lib/db'
// import type { Plan } from '@/generated/prisma'
// import {
//   FRAGMENT_TITLE_PROMPT,
//   RESPONSE_PROMPT,
//   DESIGN_LIBRARY,
//   BACKEND_AGENT_PROMPT,
//   ARCHITECTURE_MAP_PROMPT,
//   REVIEW_AGENT_PROMPT,
// } from '@/prompt'

// import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
// import { createDbEmitter } from '@/lib/generationEvents'
// import { makeEvent } from '@/streaming/events'
// import { generateTaskGraph } from '@/planning/planner'
// import { runCodeAgent } from '@/agents/codeAgent'
// import { runFixAgent } from '@/agents/fixAgent'
// import {
//   upsertFilesToVectorStore,
//   searchSimilarComponents,
//   formatComponentMatches,
//   archiveProjectMemory,
//   searchProjectMemory,
//   formatMemoryMatches,
// } from '@/lib/vector-store'

// import { TaskExecutor } from '@/execution/TaskExecutor'
// import type { Task, TaskGraph } from '@/execution/taskGraph'
// import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// // ─── helpers ──────────────────────────────────────────────────────────────────

// function buildTaskPrompt(
//   task: Task,
//   userRequest: string,
//   imageData?: { mimeType: string; base64: string },
//   contextSuffix = '',
// ): string | unknown[] {
//   const text =
//     `USER REQUEST: ${userRequest}\n\n` +
//     `YOUR TASK (${task.type}): ${task.description}\n\n` +
//     `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
//     contextSuffix

//   if (imageData) {
//     return [
//       { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
//       { type: 'text', text },
//     ]
//   }
//   return text
// }

// function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
//   switch (taskType) {
//     case 'ui':
//       return DESIGN_LIBRARY + contextSuffix
//     case 'backend':
//       return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
//     default:
//       return contextSuffix
//   }
// }

// // ─── main Inngest function ────────────────────────────────────────────────────

// export const codeAgentFunction = inngest.createFunction(
//   { id: 'code-agent', retries: 0 },
//   { event: 'code-agent/run' },
//   async ({ event, step }) => {
//     const { messageId, projectId, value, imageUrl } = event.data as {
//       messageId: string
//       projectId: string
//       value: string
//       imageUrl?: string
//       supabaseUrl?: string
//       supabaseAnonKey?: string
//     }

//     // ── 1. Check where we are in the plan/approval lifecycle ──────────────────
//     const existingMessage = await step.run('check-plan-status', async () =>
//       prisma.message.findUnique({
//         where: { id: messageId },
//         select: { planStatus: true, plan: true },
//       }),
//     )

//     // ✅ guard against re-entry — if coding already completed, stop immediately
//     if (existingMessage?.planStatus === 'completed') {
//       return { status: 'already_completed', messageId }
//     }

//     if (existingMessage?.planStatus === 'rejected') {
//       return { status: 'rejected', messageId }
//     }

//     // ════════════════════════════════════════════════════════════════════════════
//     // PLAN PHASE — generate task graph and pause for user approval
//     // ════════════════════════════════════════════════════════════════════════════

//     if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

//       const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
//         const project = await prisma.project.findUnique({
//           where: { id: projectId },
//           select: { userId: true },
//         })
//         if (!project?.userId) return { userPlan: 'free' }
//         const credits = await prisma.credits.findUnique({
//           where: { userId: project.userId },
//           select: { plan: true },
//         })
//         return { userPlan: credits?.plan ?? 'free' }
//       })

//       const planSandboxId = await step.run('plan-get-sandbox', async () => {
//         const { sandboxId } = await getOrCreateSandbox(projectId)
//         return sandboxId
//       })

//       await step.run('plan-restore-files', async () =>
//         restoreFilesIntoSandbox(projectId, planSandboxId),
//       )

//       const taskGraph = await step.run('generate-task-graph', async () =>
//         generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
//       )

//       await step.run('store-plan', async () =>
//         prisma.message.update({
//           where: { id: messageId },
//           data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
//         }),
//       )

//       return { status: 'awaiting_approval', messageId }
//     }

//     // ════════════════════════════════════════════════════════════════════════════
//     // CODING PHASE — runs after user approves the plan
//     // ════════════════════════════════════════════════════════════════════════════

//     // ✅ mark as 'approved' immediately so any duplicate events return early
//     await step.run('mark-coding-started', async () =>
//       prisma.message.update({
//         where: { id: messageId },
//         data: { planStatus: 'approved' },
//       }),
//     )

//     let taskGraphData: TaskGraph = { summary: '', tasks: [] }
//     try {
//       taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
//     } catch {
//       /* fall through — will default to single-agent mode below */
//     }
//     const tasks: Task[] = taskGraphData?.tasks ?? []

//     const emit = createDbEmitter(messageId)

//     // ── Durable setup steps (Prisma only — safe inside step.run) ─────────────

//     const sandboxId = await step.run('exec-get-sandbox', async () => {
//       const { sandboxId: id } = await getOrCreateSandbox(projectId)
//       return id
//     })

//     const restoredFiles = await step.run('exec-restore-files', async () =>
//       restoreFilesIntoSandbox(projectId, sandboxId, emit),
//     )

//     const { userPlan, userId } = await step.run('get-user-plan', async () => {
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { userId: true },
//       })
//       if (!project?.userId) return { userPlan: 'free', userId: '' }
//       const credits = await prisma.credits.findUnique({
//         where: { userId: project.userId },
//         select: { plan: true },
//       })
//       return { userPlan: credits?.plan ?? 'free', userId: project.userId }
//     })

//     const projectContext = await step.run('get-project-context', async () =>
//       prisma.project.findUnique({
//         where: { id: projectId },
//         select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
//       }),
//     )

//     const previousMessages = await step.run('get-previous-messages', async () => {
//       const all = await prisma.message.findMany({
//         where: { projectId },
//         orderBy: { createdAt: 'desc' },
//         take: 200,
//       })
//       all.reverse()

//       if (all.length > 8) {
//         const old    = all.slice(0, all.length - 6)
//         const recent = all.slice(all.length - 6)
//         const summary = old
//           .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
//           .map((m: { content: string }) => m.content.slice(0, 200))
//           .join(' | ')
//         const formatted: { type: string; role: string; content: string }[] = []
//         if (summary) {
//           formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
//         }
//         for (const m of recent) {
//           formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
//         }
//         return formatted
//       }
//       return all.map((m: { role: string; content: string }) => ({
//         type:    'text',
//         role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
//         content: m.content,
//       }))
//     })

//     const similarComponents = await step.run('search-components-for-coding', async () => {
//       if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
//       try {
//         const matches = await searchSimilarComponents({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
//         })
//         return formatComponentMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     const pastMemory = await step.run('search-project-memory', async () => {
//       if (!projectContext?.supabaseUrl) return ''
//       try {
//         const matches = await searchProjectMemory({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
//         })
//         return formatMemoryMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     // ── Build shared context suffix ────────────────────────────────────────────

//     const supabaseCtx = (() => {
//       const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
//       const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
//       if (!url || !key) return ''
//       return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
//     })()

//     const archCtx = projectContext?.contextDocument
//       ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
//       : ''

//     const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

//     let imageData: { mimeType: string; base64: string } | undefined
//     if (imageUrl) {
//       const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
//       if (match) imageData = { mimeType: match[1], base64: match[2] }
//     }

//     // ── FIX: seed allFiles from the durable step return value, not a closure.
//     // Closed-over mutable state is lost when Inngest resumes after a sleep/wait,
//     // because the function re-executes from the top and the in-memory variable
//     // resets. Using restoredFiles (a step.run return value) is safe because
//     // Inngest replays it from its durable event log on resume.
//     let allFiles: Record<string, string> = restoredFiles.files ?? {}
//     const summaries: string[] = []

//     // ── AgentRunner — called by TaskExecutor for each task ────────────────────
//     const makeRunner = (): AgentRunner => ({
//       async run(task: Task, ctx: ExecutionContext): Promise<void> {

//         if (task.type === 'search') {
//           const { runSearchAgent } = await import('@/lib/search-agent')
//           const project = await prisma.project.findUnique({
//             where: { id: projectId },
//             select: { supabaseUrl: true, supabaseAnonKey: true },
//           })
//           const result = await runSearchAgent({
//             libraryName:        task.id.replace(/^search-/, ''),
//             description:        task.description,
//             sandboxId:          ctx.sandboxId,
//             supabaseUrl:        project?.supabaseUrl ?? undefined,
//             supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
//           })
//           ctx.emit(makeEvent('log', {
//             data: {
//               description: result.fromCache
//                 ? `Loaded ${result.libraryName} docs from cache`
//                 : `Fetched and cached ${result.libraryName} docs`,
//               message: result.fromCache ? 'docs from cache' : 'docs fetched',
//             },
//           }))
//           ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
//             files:   { [result.docFilePath]: result.summary },
//             summary: `Fetched docs for ${result.libraryName}`,
//           }
//           return
//         }

//         const result = await runCodeAgent({
//           sandboxId:    ctx.sandboxId,
//           userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
//           history:      previousMessages as unknown as Message[],
//           allowedFiles: task.files.length > 0 ? task.files : undefined,
//           initialFiles: allFiles,
//           systemSuffix: buildSystemSuffix(task.type, contextSuffix),
//           emit:         ctx.emit,
//           userPlan,
//           taskType:     task.type,
//           fileCount:    task.files.length,
//           taskId:       task.id,
//         })

//         ;(task as Task & { _result?: typeof result })._result = result
//       },
//     })

//     // ── Build and run the TaskExecutor ────────────────────────────────────────
//     const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free
//     const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
//     const maxTasks = planFeatures.maxTasks

//     const rawTaskGraph: TaskGraph = tasks.length > 0
//       ? taskGraphData
//       : {
//           summary: '',
//           tasks: [{
//             id:          'task_1',
//             type:        'ui',
//             description: value,
//             files:       [],
//             dependsOn:   [],
//             priority:    1,
//           }],
//         }

//     const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
//       ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
//       : rawTaskGraph

//     const runner   = makeRunner()

//     // ── FIX: `validate` removed from TaskExecutor options.
//     // Previously validateTask ran per-task inside the executor, which meant
//     // TypeScript errors in task A could block task B even though B's files were
//     // fine. It also ran against a potentially incomplete allFiles snapshot
//     // (only tasks completed so far). We now run a single validation pass over
//     // ALL files after executor.run() finishes, giving every agent a chance to
//     // produce its files before we check types.
//     const executor = new TaskExecutor(taskGraphToRun, execContext, {
//       maxRetries: 3,
//       agents: {
//         ui:          runner,
//         backend:     runner,
//         db:          runner,
//         integration: runner,
//         search:      runner,
//       },
//       // validate: removed — see post-executor validation block below
//     })

//     executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
//       allFiles = { ...allFiles, ...result.files }
//       if (result.summary) summaries.push(result.summary)
//     })

//     let executorFailed = false
//     try {
//       await executor.run()
//     } catch (err) {
//       executorFailed = true
//       Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
//     }

//     // ── FIX: single TypeScript validation pass over ALL completed task files ──
//     // This runs once, after every agent has written its files, so the type
//     // checker sees the full picture rather than a per-task partial snapshot.
//     // It also avoids charging fix credits for errors that would have resolved
//     // naturally once a later task filled in a missing type or export.
//     let actualFixCount = 0

//     if (!executorFailed) {
//       // Collect the union of files touched by every non-search task
//       const allTaskFiles = taskGraphToRun.tasks
//         .filter((t) => t.type !== 'search' && t.files.length > 0)
//         .flatMap((t) => t.files)
//         // deduplicate
//         .filter((f, i, arr) => arr.indexOf(f) === i)

//       if (allTaskFiles.length > 0) {
//         const errors = await runTsc(sandboxId, allTaskFiles)

//         if (errors) {
//           emit(makeEvent('validation_failed', { taskId: 'post-execution', data: { errors: errors.slice(0, 300) } }))
//           actualFixCount++

//           const fixResult = await runFixAgent({
//             sandboxId,
//             existingFiles: allFiles,
//             failingFiles:  allTaskFiles,
//             emit,
//             userPlan,
//             maxLoops: planFeatures.maxFixLoops,
//           })

//           allFiles = { ...allFiles, ...fixResult.files }
//           emit(makeEvent('fix_completed', { taskId: 'post-execution' }))
//         }
//       }
//     }

//     const combinedSummary = summaries.map((s) => s.trim()).join('\n')
//     const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

//     // ── Charge credits (durable step — Prisma only) ───────────────────────────
//     await step.run('charge-credits-v2', async () => {
//       if (!userId) return 'skipped: no userId'
//       try {
//         const { consumeCreditsV2 } = await import('@/lib/usage')
//         const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
//         const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
//         const fixCount    = executorFailed ? 0 : actualFixCount
//         await consumeCreditsV2({
//           userId,
//           breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
//           reason: 'generation',
//         })
//         return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
//         console.error('[charge-credits-v2] failed:', e)
//         return `charge failed: ${e}`
//       }
//     })

//     // ── Review Agent ──────────────────────────────────────────────────────────
//     if (!isError && Object.keys(allFiles).length > 0) {
//       try {
//         const modifiedFiles = Object.keys(allFiles)
//         const fileList = modifiedFiles
//           .slice(0, 20)
//           .map((path) => {
//             const content   = allFiles[path] ?? ''
//             const truncated = content.length > 3000
//               ? content.slice(0, 3000) + '\n... (truncated)'
//               : content
//             return `<file path="${path}">\n${truncated}\n</file>`
//           })
//           .join('\n\n')

//         const reviewAgent = createAgent({
//           name:   'review-agent',
//           system: REVIEW_AGENT_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })

//         const reviewInput = [
//           `<files_modified>\n${fileList}\n</files_modified>`,
//           `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
//         ].join('\n\n')

//         const { output: reviewOutput } = await reviewAgent.run(reviewInput)

//         const reviewText = reviewOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')

//         const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
//         const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
//         console.log(reviewSummary
//           ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
//           : '[review-agent] completed (no summary emitted)',
//         )
//       } catch (err) {
//         Sentry.captureException(err, {
//           extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
//         })
//         console.error('[review-agent] failed (non-fatal):', err)
//       }
//     }

//     // ── Fragment title + assistant response ───────────────────────────────────
//     const fragmentTitleGenerator = createAgent({
//       name:   'fragment-title-generator',
//       system: FRAGMENT_TITLE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })
//     const responseGenerator = createAgent({
//       name:   'response-generator',
//       system: RESPONSE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })

//     const [titleResult, responseResult] = await Promise.all([
//       fragmentTitleGenerator.run(combinedSummary || 'No summary'),
//       responseGenerator.run(combinedSummary || 'No summary'),
//     ])

//     // ── Sandbox URL (durable step — no agents) ────────────────────────────────
//     const sandboxUrl = await step.run('get-sandbox-url', async () => {
//       const sandbox = await getSandbox(sandboxId)
//       const host    = sandbox.getHost(3000)
//       return `https://${host}`
//     })

//     // ── Persist result to DB (durable step — Prisma only) ─────────────────────
//     await step.run('save-result', async () => {
//       if (isError) {
//         return prisma.message.create({
//           data: {
//             projectId,
//             content: 'Something went wrong — please try again',
//             role:    'ASSISTANT',
//             type:    'ERROR',
//           },
//         })
//       }

//       const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
//       const requiredIntegrations: string[] = requiredIntegrationsRaw
//         ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
//         : []

//       return prisma.message.create({
//         data: {
//           projectId,
//           content:              parseAgentOutput(responseResult.output),
//           role:                 'ASSISTANT',
//           type:                 'RESULT',
//           requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
//           fragment: {
//             create: {
//               sandboxUrl,
//               title: parseAgentOutput(titleResult.output),
//               files: allFiles,
//             },
//           },
//         },
//       })
//     })

//     // ── Architecture map update ───────────────────────────────────────────────
//     if (!isError) {
//       try {
//         const mapAgent = createAgent({
//           name:   'architecture-map-agent',
//           system: ARCHITECTURE_MAP_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })
//         const fileList = Object.entries(allFiles)
//           .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
//           .join('\n')

//         const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

//         const mapText = mapOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')
//         const cleanMap = mapText.replace(/```json|```/g, '').trim()

//         await step.run('update-architecture-map', async () => {
//           await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
//           return 'architecture map updated'
//         })
//       } catch (err) {
//         Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
//       }
//     }

//     // ── Vector store upsert (durable step — no agents) ────────────────────────
//     await step.run('upsert-vector-store', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
//       try {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              allFiles,
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
//         })
//         return `upserted ${Object.keys(allFiles).length} files`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
//         return `upsert failed: ${e}`
//       }
//     })

//     // ── Project memory archive (durable step — no agents) ─────────────────────
//     await step.run('archive-project-memory', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl) return 'skipped: no supabase'
//       try {
//         await archiveProjectMemory({
//           projectId,
//           userId,
//           userPrompt:         value,
//           aiSummary:          combinedSummary ?? '',
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return 'memory archived'
//       } catch (e) {
//         console.error('[archive-project-memory] failed:', e)
//         return `failed: ${e}`
//       }
//     })

//     // ✅ mark as completed so any future duplicate events return early
//     await step.run('mark-completed', async () =>
//       prisma.message.update({
//         where: { id: messageId },
//         data: { planStatus: 'completed' },
//       }),
//     )

//     return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
//   },
// )

// // ─── Embed repo files after GitHub import ─────────────────────────────────────

// export const embedRepoFilesFunction = inngest.createFunction(
//   { id: 'embed-repo-files', retries: 2 },
//   { event: 'isotope/repo.imported' },
//   async ({ event, step }) => {
//     const { projectId, userId, owner, repo } = event.data as {
//       projectId: string
//       userId:    string
//       owner:     string
//       repo:      string
//     }

//     await step.run('mark-indexing-start', async () => {
//       await prisma.project.update({
//         where: { id: projectId },
//         data:  { isIndexing: true },
//       })
//     })

//     let files: Record<string, string> = {}
//     let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

//     try {
//       files = await step.run('fetch-repo-files', async () => {
//         const { getGitHubToken } = await import('@/lib/github-token')
//         const { getRepoFiles }   = await import('@/lib/github')
//         const tokenRecord = await getGitHubToken(userId)
//         if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
//         return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
//       })

//       const project = await step.run('get-project', async () =>
//         prisma.project.findUnique({
//           where:  { id: projectId },
//           select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
//         }),
//       )

//       if (!project?.supabaseUrl) {
//         await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
//         return 'skipped: no supabase configured'
//       }

//       processedFiles = await step.run('transform-framework-files', async () => {
//         try {
//           const analysis  = JSON.parse(project.contextDocument ?? '{}')
//           const framework = (analysis.framework ?? 'nextjs') as string

//           if (framework === 'nextjs') {
//             return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//           }

//           console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
//           const { transformToNextJs } = await import('@/lib/ai-transformer')
//           const result = await transformToNextJs(files, framework)
//           console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
//           return result
//         } catch (err) {
//           console.error('[embed-repo] transform-framework-files failed, using originals:', err)
//           return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//         }
//       })

//       await step.run('upsert-repo-files', async () => {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              processedFiles!.files,
//           supabaseUrl:        project.supabaseUrl!,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
//       })
//     } finally {
//       await step.run('mark-indexing-done', async () => {
//         await prisma.project.update({
//           where: { id: projectId },
//           data:  { isIndexing: false },
//         })
//       })
//     }

//     return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
//   },
// )

// // ─── Daily free-credit top-up cron ────────────────────────────────────────────

// export const freeCreditsResetFunction = inngest.createFunction(
//   { id: 'free-credits-reset' },
//   { cron: '0 0 * * *' },
//   async ({ step }) => {
//     const count = await step.run('reset-free-credits', async () => resetFreeCredits())
//     return { message: `Reset credits for ${count} free user(s)` }
//   },
// )

// // ─── Vercel URL refresh after GitHub merge ────────────────────────────────────

// export const refreshVercelUrlFunction = inngest.createFunction(
//   { id: 'refresh-vercel-url' },
//   { event: 'github/vercel-url-refresh' },
//   async ({ event, step }) => {
//     const { projectId, vercelProjectId } = event.data as {
//       projectId:       string
//       vercelProjectId: string
//     }

//     await step.sleep('wait-for-vercel-deploy', '30s')

//     await step.run('fetch-and-save-url', async () => {
//       const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
//       await refreshVercelUrl(projectId, vercelProjectId)
//     })

//     return { projectId }
//   },
// )

// // ─── Stale GenerationEvent cleanup cron ───────────────────────────────────────

// export const purgeGenerationEventsFunction = inngest.createFunction(
//   { id: 'purge-generation-events' },
//   { cron: '0 2 * * *' },
//   async ({ step }) => {
//     const deleted = await step.run('purge-old-events', async () => {
//       const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
//       const result = await prisma.generationEvent.deleteMany({
//         where: { createdAt: { lt: cutoff } },
//       })
//       return result.count
//     })
//     return { message: `Purged ${deleted} stale GenerationEvent rows` }
//   },
// )



// /**
//  * codeAgentFunction.ts
//  *
//  * Core Inngest background functions for the Isotope AI code generation pipeline.
//  */

// import { createAgent, type Message } from '@inngest/agent-kit'
// import { readerModel } from '@/lib/openrouter'
// import * as Sentry from '@sentry/nextjs'

// import { inngest } from './client'
// import { getSandbox, parseAgentOutput } from './utils'
// import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
// import { prisma } from '@/lib/db'
// import type { Plan } from '@/generated/prisma'
// import {
//   FRAGMENT_TITLE_PROMPT,
//   RESPONSE_PROMPT,
//   DESIGN_LIBRARY,
//   BACKEND_AGENT_PROMPT,
//   ARCHITECTURE_MAP_PROMPT,
//   REVIEW_AGENT_PROMPT,
// } from '@/prompt'

// import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
// import { createDbEmitter } from '@/lib/generationEvents'
// import { makeEvent } from '@/streaming/events'
// import { generateTaskGraph } from '@/planning/planner'
// import { runCodeAgent } from '@/agents/codeAgent'
// import { runFixAgent } from '@/agents/fixAgent'
// import {
//   upsertFilesToVectorStore,
//   searchSimilarComponents,
//   formatComponentMatches,
//   archiveProjectMemory,
//   searchProjectMemory,
//   formatMemoryMatches,
// } from '@/lib/vector-store'

// import { TaskExecutor } from '@/execution/TaskExecutor'
// import type { Task, TaskGraph } from '@/execution/taskGraph'
// import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// // ─── helpers ──────────────────────────────────────────────────────────────────

// function buildTaskPrompt(
//   task: Task,
//   userRequest: string,
//   imageData?: { mimeType: string; base64: string },
//   contextSuffix = '',
// ): string | unknown[] {
//   const text =
//     `USER REQUEST: ${userRequest}\n\n` +
//     `YOUR TASK (${task.type}): ${task.description}\n\n` +
//     `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
//     contextSuffix

//   if (imageData) {
//     return [
//       { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
//       { type: 'text', text },
//     ]
//   }
//   return text
// }

// function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
//   switch (taskType) {
//     case 'ui':
//       return DESIGN_LIBRARY + contextSuffix
//     case 'backend':
//       return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
//     default:
//       return contextSuffix
//   }
// }

// // ─── main Inngest function ────────────────────────────────────────────────────

// export const codeAgentFunction = inngest.createFunction(
//   { id: 'code-agent', retries: 0 },
//   { event: 'code-agent/run' },
//   async ({ event, step }) => {
//     const { messageId, projectId, value, imageUrl } = event.data as {
//       messageId: string
//       projectId: string
//       value: string
//       imageUrl?: string
//       supabaseUrl?: string
//       supabaseAnonKey?: string
//     }

//     // ── 1. Check where we are in the plan/approval lifecycle ──────────────────
//     const existingMessage = await step.run('check-plan-status', async () =>
//       prisma.message.findUnique({
//         where: { id: messageId },
//         select: { planStatus: true, plan: true },
//       }),
//     )

//     // ✅ FIX: guard against re-entry — if coding already completed, stop immediately
//     if (existingMessage?.planStatus === 'completed') {
//       return { status: 'already_completed', messageId }
//     }

//     if (existingMessage?.planStatus === 'rejected') {
//       return { status: 'rejected', messageId }
//     }

//     // ════════════════════════════════════════════════════════════════════════════
//     // PLAN PHASE — generate task graph and pause for user approval
//     // ════════════════════════════════════════════════════════════════════════════

//     if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

//       const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
//         const project = await prisma.project.findUnique({
//           where: { id: projectId },
//           select: { userId: true },
//         })
//         if (!project?.userId) return { userPlan: 'free' }
//         const credits = await prisma.credits.findUnique({
//           where: { userId: project.userId },
//           select: { plan: true },
//         })
//         return { userPlan: credits?.plan ?? 'free' }
//       })

//       const planSandboxId = await step.run('plan-get-sandbox', async () => {
//         const { sandboxId } = await getOrCreateSandbox(projectId)
//         return sandboxId
//       })

//       await step.run('plan-restore-files', async () =>
//         restoreFilesIntoSandbox(projectId, planSandboxId),
//       )

//       const taskGraph = await step.run('generate-task-graph', async () =>
//         generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
//       )

//       await step.run('store-plan', async () =>
//         prisma.message.update({
//           where: { id: messageId },
//           data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
//         }),
//       )

//       return { status: 'awaiting_approval', messageId }
//     }

//     // ════════════════════════════════════════════════════════════════════════════
//     // CODING PHASE — runs after user approves the plan
//     // ════════════════════════════════════════════════════════════════════════════

//     // ✅ FIX: mark as 'approved' immediately so any duplicate events return early
//     await step.run('mark-coding-started', async () =>
//       prisma.message.update({
//         where: { id: messageId },
//         data: { planStatus: 'approved' },
//       }),
//     )

//     let taskGraphData: TaskGraph = { summary: '', tasks: [] }
//     try {
//       taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
//     } catch {
//       /* fall through — will default to single-agent mode below */
//     }
//     const tasks: Task[] = taskGraphData?.tasks ?? []

//     const emit = createDbEmitter(messageId)

//     // ── Durable setup steps (Prisma only — safe inside step.run) ─────────────

//     const sandboxId = await step.run('exec-get-sandbox', async () => {
//       const { sandboxId: id } = await getOrCreateSandbox(projectId)
//       return id
//     })

//     const restoredFiles = await step.run('exec-restore-files', async () =>
//       restoreFilesIntoSandbox(projectId, sandboxId, emit),
//     )

//     const { userPlan, userId } = await step.run('get-user-plan', async () => {
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { userId: true },
//       })
//       if (!project?.userId) return { userPlan: 'free', userId: '' }
//       const credits = await prisma.credits.findUnique({
//         where: { userId: project.userId },
//         select: { plan: true },
//       })
//       return { userPlan: credits?.plan ?? 'free', userId: project.userId }
//     })

//     const projectContext = await step.run('get-project-context', async () =>
//       prisma.project.findUnique({
//         where: { id: projectId },
//         select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
//       }),
//     )

//     const previousMessages = await step.run('get-previous-messages', async () => {
//       const all = await prisma.message.findMany({
//         where: { projectId },
//         orderBy: { createdAt: 'desc' },
//         take: 200,
//       })
//       all.reverse()

//       if (all.length > 8) {
//         const old    = all.slice(0, all.length - 6)
//         const recent = all.slice(all.length - 6)
//         const summary = old
//           .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
//           .map((m: { content: string }) => m.content.slice(0, 200))
//           .join(' | ')
//         const formatted: { type: string; role: string; content: string }[] = []
//         if (summary) {
//           formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
//         }
//         for (const m of recent) {
//           formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
//         }
//         return formatted
//       }
//       return all.map((m: { role: string; content: string }) => ({
//         type:    'text',
//         role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
//         content: m.content,
//       }))
//     })

//     const similarComponents = await step.run('search-components-for-coding', async () => {
//       if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
//       try {
//         const matches = await searchSimilarComponents({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
//         })
//         return formatComponentMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     const pastMemory = await step.run('search-project-memory', async () => {
//       if (!projectContext?.supabaseUrl) return ''
//       try {
//         const matches = await searchProjectMemory({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
//         })
//         return formatMemoryMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     // ── Build shared context suffix ────────────────────────────────────────────

//     const supabaseCtx = (() => {
//       const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
//       const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
//       if (!url || !key) return ''
//       return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
//     })()

//     const archCtx = projectContext?.contextDocument
//       ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
//       : ''

//     const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

//     let imageData: { mimeType: string; base64: string } | undefined
//     if (imageUrl) {
//       const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
//       if (match) imageData = { mimeType: match[1], base64: match[2] }
//     }

//     let allFiles: Record<string, string> = restoredFiles.files ?? {}
//     const summaries: string[] = []

//     // ── AgentRunner — called by TaskExecutor for each task ────────────────────
//     const makeRunner = (): AgentRunner => ({
//       async run(task: Task, ctx: ExecutionContext): Promise<void> {

//         if (task.type === 'search') {
//           const { runSearchAgent } = await import('@/lib/search-agent')
//           const project = await prisma.project.findUnique({
//             where: { id: projectId },
//             select: { supabaseUrl: true, supabaseAnonKey: true },
//           })
//           const result = await runSearchAgent({
//             libraryName:        task.id.replace(/^search-/, ''),
//             description:        task.description,
//             sandboxId:          ctx.sandboxId,
//             supabaseUrl:        project?.supabaseUrl ?? undefined,
//             supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
//           })
//           ctx.emit(makeEvent('log', {
//             data: {
//               description: result.fromCache
//                 ? `Loaded ${result.libraryName} docs from cache`
//                 : `Fetched and cached ${result.libraryName} docs`,
//               message: result.fromCache ? 'docs from cache' : 'docs fetched',
//             },
//           }))
//           ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
//             files:   { [result.docFilePath]: result.summary },
//             summary: `Fetched docs for ${result.libraryName}`,
//           }
//           return
//         }

//         const result = await runCodeAgent({
//           sandboxId:    ctx.sandboxId,
//           userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
//           history:      previousMessages as unknown as Message[],
//           allowedFiles: task.files.length > 0 ? task.files : undefined,
//           initialFiles: allFiles,
//           systemSuffix: buildSystemSuffix(task.type, contextSuffix),
//           emit:         ctx.emit,
//           userPlan,
//           taskType:     task.type,
//           fileCount:    task.files.length,
//           taskId:       task.id,
//         })

//         ;(task as Task & { _result?: typeof result })._result = result
//       },
//     })

//     // ── Per-task TypeScript validation + auto-fix ─────────────────────────────
//     let actualFixCount = 0

//     const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free

//     const validateTask = async (task: Task, ctx: ExecutionContext): Promise<void> => {
//       if (task.files.length === 0) return

//       const errors = await runTsc(ctx.sandboxId, task.files)
//       if (!errors) return

//       emit(makeEvent('validation_failed', { taskId: task.id, data: { errors: errors.slice(0, 300) } }))
//       actualFixCount++

//       const fixResult = await runFixAgent({
//         sandboxId:     ctx.sandboxId,
//         existingFiles: allFiles,
//         failingFiles:  task.files,
//         emit:          ctx.emit,
//         userPlan,
//         maxLoops:      planFeatures.maxFixLoops,
//       })

//       allFiles = { ...allFiles, ...fixResult.files }
//       emit(makeEvent('fix_completed', { taskId: task.id }))
//     }

//     // ── Build and run the TaskExecutor ────────────────────────────────────────
//     const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
//     const maxTasks = planFeatures.maxTasks

//     const rawTaskGraph: TaskGraph = tasks.length > 0
//       ? taskGraphData
//       : {
//           summary: '',
//           tasks: [{
//             id:          'task_1',
//             type:        'ui',
//             description: value,
//             files:       [],
//             dependsOn:   [],
//             priority:    1,
//           }],
//         }

//     const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
//       ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
//       : rawTaskGraph

//     const runner   = makeRunner()
//     const executor = new TaskExecutor(taskGraphToRun, execContext, {
//       maxRetries: 3,
//       agents: {
//         ui:          runner,
//         backend:     runner,
//         db:          runner,
//         integration: runner,
//         search:      runner,
//       },
//       validate: validateTask,
//     })

//     executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
//       allFiles = { ...allFiles, ...result.files }
//       if (result.summary) summaries.push(result.summary)
//     })

//     let executorFailed = false
//     try {

//       // await step.run('execute-all-tasks', async () => {
//       //   console.log('[executor] starting task graph:', taskGraphToRun.tasks.map(t => t.id))
//       //    await executor.run()
//       // })
//       await executor.run()
//     } catch (err) {
//       executorFailed = true
//       Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
//     }

//     const combinedSummary = summaries.map((s) => s.trim()).join('\n')
//     const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

//     // ── Charge credits (durable step — Prisma only) ───────────────────────────
//     await step.run('charge-credits-v2', async () => {
//       if (!userId) return 'skipped: no userId'
//       try {
//         const { consumeCreditsV2 } = await import('@/lib/usage')
//         const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
//         const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
//         const fixCount    = executorFailed ? 0 : actualFixCount
//         await consumeCreditsV2({
//           userId,
//           breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
//           reason: 'generation',
//         })
//         return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
//         console.error('[charge-credits-v2] failed:', e)
//         return `charge failed: ${e}`
//       }
//     })

//     // ── Review Agent ──────────────────────────────────────────────────────────
//     if (!isError && Object.keys(allFiles).length > 0) {
//       try {
//         const modifiedFiles = Object.keys(allFiles)
//         const fileList = modifiedFiles
//           .slice(0, 20)
//           .map((path) => {
//             const content   = allFiles[path] ?? ''
//             const truncated = content.length > 3000
//               ? content.slice(0, 3000) + '\n... (truncated)'
//               : content
//             return `<file path="${path}">\n${truncated}\n</file>`
//           })
//           .join('\n\n')

//         const reviewAgent = createAgent({
//           name:   'review-agent',
//           system: REVIEW_AGENT_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })

//         const reviewInput = [
//           `<files_modified>\n${fileList}\n</files_modified>`,
//           `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
//         ].join('\n\n')

//         const { output: reviewOutput } = await reviewAgent.run(reviewInput)

//         const reviewText = reviewOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')

//         const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
//         const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
//         console.log(reviewSummary
//           ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
//           : '[review-agent] completed (no summary emitted)',
//         )
//       } catch (err) {
//         Sentry.captureException(err, {
//           extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
//         })
//         console.error('[review-agent] failed (non-fatal):', err)
//       }
//     }

//     // ── Fragment title + assistant response ───────────────────────────────────
//     const fragmentTitleGenerator = createAgent({
//       name:   'fragment-title-generator',
//       system: FRAGMENT_TITLE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })
//     const responseGenerator = createAgent({
//       name:   'response-generator',
//       system: RESPONSE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })

//     const [titleResult, responseResult] = await Promise.all([
//       fragmentTitleGenerator.run(combinedSummary || 'No summary'),
//       responseGenerator.run(combinedSummary || 'No summary'),
//     ])

//     // ── Sandbox URL (durable step — no agents) ────────────────────────────────
//     const sandboxUrl = await step.run('get-sandbox-url', async () => {
//       const sandbox = await getSandbox(sandboxId)
//       const host    = sandbox.getHost(3000)
//       return `https://${host}`
//     })

//     // ── Persist result to DB (durable step — Prisma only) ─────────────────────
//     await step.run('save-result', async () => {
//       if (isError) {
//         return prisma.message.create({
//           data: {
//             projectId,
//             content: 'Something went wrong — please try again',
//             role:    'ASSISTANT',
//             type:    'ERROR',
//           },
//         })
//       }

//       const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
//       const requiredIntegrations: string[] = requiredIntegrationsRaw
//         ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
//         : []

//       return prisma.message.create({
//         data: {
//           projectId,
//           content:              parseAgentOutput(responseResult.output),
//           role:                 'ASSISTANT',
//           type:                 'RESULT',
//           requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
//           fragment: {
//             create: {
//               sandboxUrl,
//               title: parseAgentOutput(titleResult.output),
//               files: allFiles,
//             },
//           },
//         },
//       })
//     })

//     // ── Architecture map update ───────────────────────────────────────────────
//     if (!isError) {
//       try {
//         const mapAgent = createAgent({
//           name:   'architecture-map-agent',
//           system: ARCHITECTURE_MAP_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })
//         const fileList = Object.entries(allFiles)
//           .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
//           .join('\n')

//         const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

//         const mapText = mapOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')
//         const cleanMap = mapText.replace(/```json|```/g, '').trim()

//         await step.run('update-architecture-map', async () => {
//           await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
//           return 'architecture map updated'
//         })
//       } catch (err) {
//         Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
//       }
//     }

//     // ── Vector store upsert (durable step — no agents) ────────────────────────
//     await step.run('upsert-vector-store', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
//       try {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              allFiles,
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
//         })
//         return `upserted ${Object.keys(allFiles).length} files`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
//         return `upsert failed: ${e}`
//       }
//     })

//     // ── Project memory archive (durable step — no agents) ─────────────────────
//     await step.run('archive-project-memory', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl) return 'skipped: no supabase'
//       try {
//         await archiveProjectMemory({
//           projectId,
//           userId,
//           userPrompt:         value,
//           aiSummary:          combinedSummary ?? '',
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return 'memory archived'
//       } catch (e) {
//         console.error('[archive-project-memory] failed:', e)
//         return `failed: ${e}`
//       }
//     })

//     // ✅ FIX: mark as completed so any future duplicate events return early
//     await step.run('mark-completed', async () =>
//       prisma.message.update({
//         where: { id: messageId },
//         data: { planStatus: 'completed' },
//       }),
//     )

//     return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
//   },
// )

// // ─── Embed repo files after GitHub import ─────────────────────────────────────

// export const embedRepoFilesFunction = inngest.createFunction(
//   { id: 'embed-repo-files', retries: 2 },
//   { event: 'isotope/repo.imported' },
//   async ({ event, step }) => {
//     const { projectId, userId, owner, repo } = event.data as {
//       projectId: string
//       userId:    string
//       owner:     string
//       repo:      string
//     }

//     await step.run('mark-indexing-start', async () => {
//       await prisma.project.update({
//         where: { id: projectId },
//         data:  { isIndexing: true },
//       })
//     })

//     let files: Record<string, string> = {}
//     let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

//     try {
//       files = await step.run('fetch-repo-files', async () => {
//         const { getGitHubToken } = await import('@/lib/github-token')
//         const { getRepoFiles }   = await import('@/lib/github')
//         const tokenRecord = await getGitHubToken(userId)
//         if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
//         return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
//       })

//       const project = await step.run('get-project', async () =>
//         prisma.project.findUnique({
//           where:  { id: projectId },
//           select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
//         }),
//       )

//       if (!project?.supabaseUrl) {
//         await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
//         return 'skipped: no supabase configured'
//       }

//       processedFiles = await step.run('transform-framework-files', async () => {
//         try {
//           const analysis  = JSON.parse(project.contextDocument ?? '{}')
//           const framework = (analysis.framework ?? 'nextjs') as string

//           if (framework === 'nextjs') {
//             return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//           }

//           console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
//           const { transformToNextJs } = await import('@/lib/ai-transformer')
//           const result = await transformToNextJs(files, framework)
//           console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
//           return result
//         } catch (err) {
//           console.error('[embed-repo] transform-framework-files failed, using originals:', err)
//           return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//         }
//       })

//       await step.run('upsert-repo-files', async () => {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              processedFiles!.files,
//           supabaseUrl:        project.supabaseUrl!,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
//       })
//     } finally {
//       await step.run('mark-indexing-done', async () => {
//         await prisma.project.update({
//           where: { id: projectId },
//           data:  { isIndexing: false },
//         })
//       })
//     }

//     return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
//   },
// )

// // ─── Daily free-credit top-up cron ────────────────────────────────────────────

// export const freeCreditsResetFunction = inngest.createFunction(
//   { id: 'free-credits-reset' },
//   { cron: '0 0 * * *' },
//   async ({ step }) => {
//     const count = await step.run('reset-free-credits', async () => resetFreeCredits())
//     return { message: `Reset credits for ${count} free user(s)` }
//   },
// )

// // ─── Vercel URL refresh after GitHub merge ────────────────────────────────────

// export const refreshVercelUrlFunction = inngest.createFunction(
//   { id: 'refresh-vercel-url' },
//   { event: 'github/vercel-url-refresh' },
//   async ({ event, step }) => {
//     const { projectId, vercelProjectId } = event.data as {
//       projectId:       string
//       vercelProjectId: string
//     }

//     await step.sleep('wait-for-vercel-deploy', '30s')

//     await step.run('fetch-and-save-url', async () => {
//       const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
//       await refreshVercelUrl(projectId, vercelProjectId)
//     })

//     return { projectId }
//   },
// )

// // ─── Stale GenerationEvent cleanup cron ───────────────────────────────────────

// export const purgeGenerationEventsFunction = inngest.createFunction(
//   { id: 'purge-generation-events' },
//   { cron: '0 2 * * *' },
//   async ({ step }) => {
//     const deleted = await step.run('purge-old-events', async () => {
//       const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
//       const result = await prisma.generationEvent.deleteMany({
//         where: { createdAt: { lt: cutoff } },
//       })
//       return result.count
//     })
//     return { message: `Purged ${deleted} stale GenerationEvent rows` }
//   },
// )


// /**
//  * codeAgentFunction.ts
//  *
//  * Core Inngest background functions for the Isotope AI code generation pipeline.
//  */

// import { createAgent, type Message } from '@inngest/agent-kit'
// import { readerModel } from '@/lib/openrouter'
// import * as Sentry from '@sentry/nextjs'

// import { inngest } from './client'
// import { getSandbox, parseAgentOutput } from './utils'
// import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
// import { prisma } from '@/lib/db'
// import type { Plan } from '@/generated/prisma'
// import {
//   FRAGMENT_TITLE_PROMPT,
//   RESPONSE_PROMPT,
//   DESIGN_LIBRARY,
//   BACKEND_AGENT_PROMPT,
//   ARCHITECTURE_MAP_PROMPT,
//   REVIEW_AGENT_PROMPT,
// } from '@/prompt'

// import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
// import { createDbEmitter } from '@/lib/generationEvents'
// import { makeEvent } from '@/streaming/events'
// import { generateTaskGraph } from '@/planning/planner'
// import { runCodeAgent } from '@/agents/codeAgent'
// import { runFixAgent } from '@/agents/fixAgent'
// import {
//   upsertFilesToVectorStore,
//   searchSimilarComponents,
//   formatComponentMatches,
//   archiveProjectMemory,
//   searchProjectMemory,
//   formatMemoryMatches,
// } from '@/lib/vector-store'

// import { TaskExecutor } from '@/execution/TaskExecutor'
// import type { Task, TaskGraph } from '@/execution/taskGraph'
// import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// // ─── helpers ──────────────────────────────────────────────────────────────────

// function buildTaskPrompt(
//   task: Task,
//   userRequest: string,
//   imageData?: { mimeType: string; base64: string },
//   contextSuffix = '',
// ): string | unknown[] {
//   const text =
//     `USER REQUEST: ${userRequest}\n\n` +
//     `YOUR TASK (${task.type}): ${task.description}\n\n` +
//     `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
//     contextSuffix

//   if (imageData) {
//     return [
//       { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
//       { type: 'text', text },
//     ]
//   }
//   return text
// }

// function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
//   switch (taskType) {
//     case 'ui':
//       return DESIGN_LIBRARY + contextSuffix
//     case 'backend':
//       return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
//     default:
//       return contextSuffix
//   }
// }

// // ─── main Inngest function ────────────────────────────────────────────────────

// export const codeAgentFunction = inngest.createFunction(
//   { id: 'code-agent' },
//   { event: 'code-agent/run' },
//   async ({ event, step }) => {
//     const { messageId, projectId, value, imageUrl } = event.data as {
//       messageId: string
//       projectId: string
//       value: string
//       imageUrl?: string
//       supabaseUrl?: string
//       supabaseAnonKey?: string
//     }

//     // ── 1. Check where we are in the plan/approval lifecycle ──────────────────
//     const existingMessage = await step.run('check-plan-status', async () =>
//       prisma.message.findUnique({
//         where: { id: messageId },
//         select: { planStatus: true, plan: true },
//       }),
//     )

//     // ════════════════════════════════════════════════════════════════════════════
//     // PLAN PHASE — generate task graph and pause for user approval
//     // ════════════════════════════════════════════════════════════════════════════

//     if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

//       const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
//         const project = await prisma.project.findUnique({
//           where: { id: projectId },
//           select: { userId: true },
//         })
//         if (!project?.userId) return { userPlan: 'free' }
//         const credits = await prisma.credits.findUnique({
//           where: { userId: project.userId },
//           select: { plan: true },
//         })
//         return { userPlan: credits?.plan ?? 'free' }
//       })

//       const planSandboxId = await step.run('plan-get-sandbox', async () => {
//         const { sandboxId } = await getOrCreateSandbox(projectId)
//         return sandboxId
//       })

//       await step.run('plan-restore-files', async () =>
//         restoreFilesIntoSandbox(projectId, planSandboxId),
//       )

//       const taskGraph = await step.run('generate-task-graph', async () =>
//         generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
//       )

//       await step.run('store-plan', async () =>
//         prisma.message.update({
//           where: { id: messageId },
//           data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
//         }),
//       )

//       return { status: 'awaiting_approval', messageId }
//     }

//     if (existingMessage.planStatus === 'rejected') {
//       return { status: 'rejected', messageId }
//     }

//     // ════════════════════════════════════════════════════════════════════════════
//     // CODING PHASE — runs after user approves the plan
//     // ════════════════════════════════════════════════════════════════════════════

//     let taskGraphData: TaskGraph = { summary: '', tasks: [] }
//     try {
//       taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
//     } catch {
//       /* fall through — will default to single-agent mode below */
//     }
//     const tasks: Task[] = taskGraphData?.tasks ?? []

//     const emit = createDbEmitter(messageId)

//     // ── Durable setup steps (Prisma only — safe inside step.run) ─────────────

//     const sandboxId = await step.run('exec-get-sandbox', async () => {
//       const { sandboxId: id } = await getOrCreateSandbox(projectId)
//       return id
//     })

//     const restoredFiles = await step.run('exec-restore-files', async () =>
//       restoreFilesIntoSandbox(projectId, sandboxId, emit),
//     )

//     const { userPlan, userId } = await step.run('get-user-plan', async () => {
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { userId: true },
//       })
//       if (!project?.userId) return { userPlan: 'free', userId: '' }
//       const credits = await prisma.credits.findUnique({
//         where: { userId: project.userId },
//         select: { plan: true },
//       })
//       return { userPlan: credits?.plan ?? 'free', userId: project.userId }
//     })

//     const projectContext = await step.run('get-project-context', async () =>
//       prisma.project.findUnique({
//         where: { id: projectId },
//         select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
//       }),
//     )

//     const previousMessages = await step.run('get-previous-messages', async () => {
//       const all = await prisma.message.findMany({
//         where: { projectId },
//         orderBy: { createdAt: 'desc' },
//         take: 200,
//       })
//       all.reverse()

//       if (all.length > 8) {
//         const old    = all.slice(0, all.length - 6)
//         const recent = all.slice(all.length - 6)
//         const summary = old
//           .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
//           .map((m: { content: string }) => m.content.slice(0, 200))
//           .join(' | ')
//         const formatted: { type: string; role: string; content: string }[] = []
//         if (summary) {
//           formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
//         }
//         for (const m of recent) {
//           formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
//         }
//         return formatted
//       }
//       return all.map((m: { role: string; content: string }) => ({
//         type:    'text',
//         role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
//         content: m.content,
//       }))
//     })

//     const similarComponents = await step.run('search-components-for-coding', async () => {
//       if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
//       try {
//         const matches = await searchSimilarComponents({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
//         })
//         return formatComponentMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     const pastMemory = await step.run('search-project-memory', async () => {
//       if (!projectContext?.supabaseUrl) return ''
//       try {
//         const matches = await searchProjectMemory({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
//         })
//         return formatMemoryMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     // ── Build shared context suffix ────────────────────────────────────────────

//     const supabaseCtx = (() => {
//       const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
//       const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
//       if (!url || !key) return ''
//       return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
//     })()

//     const archCtx = projectContext?.contextDocument
//       ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
//       : ''

//     const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

//     let imageData: { mimeType: string; base64: string } | undefined
//     if (imageUrl) {
//       const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
//       if (match) imageData = { mimeType: match[1], base64: match[2] }
//     }

//     let allFiles: Record<string, string> = restoredFiles.files ?? {}
//     const summaries: string[] = []

//     // ── AgentRunner — called by TaskExecutor for each task ────────────────────
//     const makeRunner = (): AgentRunner => ({
//       async run(task: Task, ctx: ExecutionContext): Promise<void> {

//         if (task.type === 'search') {
//           const { runSearchAgent } = await import('@/lib/search-agent')
//           const project = await prisma.project.findUnique({
//             where: { id: projectId },
//             select: { supabaseUrl: true, supabaseAnonKey: true },
//           })
//           const result = await runSearchAgent({
//             libraryName:        task.id.replace(/^search-/, ''),
//             description:        task.description,
//             sandboxId:          ctx.sandboxId,
//             supabaseUrl:        project?.supabaseUrl ?? undefined,
//             supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
//           })
//           ctx.emit(makeEvent('log', {
//             data: {
//               description: result.fromCache
//                 ? `Loaded ${result.libraryName} docs from cache`
//                 : `Fetched and cached ${result.libraryName} docs`,
//               message: result.fromCache ? 'docs from cache' : 'docs fetched',
//             },
//           }))
//           ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
//             files:   { [result.docFilePath]: result.summary },
//             summary: `Fetched docs for ${result.libraryName}`,
//           }
//           return
//         }

//         // ✅ FIX: step removed from runCodeAgent — tool handlers must NOT call
//         // step.run() as it breaks agent-kit's AsyncLocalStorage context.
//         // taskId passed so agent/network names are unique per parallel task,
//         // preventing the AUTOMATIC_PARALLEL_INDEXING warning from Inngest.
//         const result = await runCodeAgent({
//           sandboxId:    ctx.sandboxId,
//           userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
//           history:      previousMessages as unknown as Message[],
//           allowedFiles: task.files.length > 0 ? task.files : undefined,
//           initialFiles: allFiles,
//           systemSuffix: buildSystemSuffix(task.type, contextSuffix),
//           emit:         ctx.emit,
//           userPlan,
//           taskType:     task.type,
//           fileCount:    task.files.length,
//           taskId:       task.id,
//         })

//         ;(task as Task & { _result?: typeof result })._result = result
//       },
//     })

//     // ── Per-task TypeScript validation + auto-fix ─────────────────────────────
//     let actualFixCount = 0

//     const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free

//     const validateTask = async (task: Task, ctx: ExecutionContext): Promise<void> => {
//       if (task.files.length === 0) return

//       const errors = await runTsc(ctx.sandboxId, task.files)
//       if (!errors) return

//       emit(makeEvent('validation_failed', { taskId: task.id, data: { errors: errors.slice(0, 300) } }))
//       actualFixCount++

//       // ✅ FIX: step removed from runFixAgent — same reason as above.
//       const fixResult = await runFixAgent({
//         sandboxId:     ctx.sandboxId,
//         existingFiles: allFiles,
//         failingFiles:  task.files,
//         emit:          ctx.emit,
//         userPlan,
//         maxLoops:      planFeatures.maxFixLoops,
//       })

//       allFiles = { ...allFiles, ...fixResult.files }
//       emit(makeEvent('fix_completed', { taskId: task.id }))
//     }

//     // ── Build and run the TaskExecutor ────────────────────────────────────────
//     const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
//     const maxTasks = planFeatures.maxTasks

//     const rawTaskGraph: TaskGraph = tasks.length > 0
//       ? taskGraphData
//       : {
//           summary: '',
//           tasks: [{
//             id:          'task_1',
//             type:        'ui',
//             description: value,
//             files:       [],
//             dependsOn:   [],
//             priority:    1,
//           }],
//         }

//     const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
//       ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
//       : rawTaskGraph

//     const runner   = makeRunner()
//     const executor = new TaskExecutor(taskGraphToRun, execContext, {
//       maxRetries: 3,
//       agents: {
//         ui:          runner,
//         backend:     runner,
//         db:          runner,
//         integration: runner,
//         search:      runner,
//       },
//       validate: validateTask,
//     })

//     executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
//       allFiles = { ...allFiles, ...result.files }
//       if (result.summary) summaries.push(result.summary)
//     })

//     let executorFailed = false
//     try {
//       await executor.run()
//     } catch (err) {
//       executorFailed = true
//       Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
//     }

//     const combinedSummary = summaries.map((s) => s.trim()).join('\n')
//     const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

//     // ── Charge credits (durable step — Prisma only) ───────────────────────────
//     await step.run('charge-credits-v2', async () => {
//       if (!userId) return 'skipped: no userId'
//       try {
//         const { consumeCreditsV2 } = await import('@/lib/usage')
//         const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
//         const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
//         const fixCount    = executorFailed ? 0 : actualFixCount
//         await consumeCreditsV2({
//           userId,
//           breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
//           reason: 'generation',
//         })
//         return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
//         console.error('[charge-credits-v2] failed:', e)
//         return `charge failed: ${e}`
//       }
//     })

//     // ── Review Agent ──────────────────────────────────────────────────────────
//     if (!isError && Object.keys(allFiles).length > 0) {
//       try {
//         const modifiedFiles = Object.keys(allFiles)
//         const fileList = modifiedFiles
//           .slice(0, 20)
//           .map((path) => {
//             const content   = allFiles[path] ?? ''
//             const truncated = content.length > 3000
//               ? content.slice(0, 3000) + '\n... (truncated)'
//               : content
//             return `<file path="${path}">\n${truncated}\n</file>`
//           })
//           .join('\n\n')

//         const reviewAgent = createAgent({
//           name:   'review-agent',
//           system: REVIEW_AGENT_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })

//         const reviewInput = [
//           `<files_modified>\n${fileList}\n</files_modified>`,
//           `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
//         ].join('\n\n')

//         const { output: reviewOutput } = await reviewAgent.run(reviewInput)

//         const reviewText = reviewOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')

//         const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
//         const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
//         console.log(reviewSummary
//           ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
//           : '[review-agent] completed (no summary emitted)',
//         )
//       } catch (err) {
//         Sentry.captureException(err, {
//           extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
//         })
//         console.error('[review-agent] failed (non-fatal):', err)
//       }
//     }

//     // ── Fragment title + assistant response ───────────────────────────────────
//     const fragmentTitleGenerator = createAgent({
//       name:   'fragment-title-generator',
//       system: FRAGMENT_TITLE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })
//     const responseGenerator = createAgent({
//       name:   'response-generator',
//       system: RESPONSE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })

//     const [titleResult, responseResult] = await Promise.all([
//       fragmentTitleGenerator.run(combinedSummary || 'No summary'),
//       responseGenerator.run(combinedSummary || 'No summary'),
//     ])

//     // ── Sandbox URL (durable step — no agents) ────────────────────────────────
//     const sandboxUrl = await step.run('get-sandbox-url', async () => {
//       const sandbox = await getSandbox(sandboxId)
//       const host    = sandbox.getHost(3000)
//       return `https://${host}`
//     })

//     // ── Persist result to DB (durable step — Prisma only) ─────────────────────
//     await step.run('save-result', async () => {
//       if (isError) {
//         return prisma.message.create({
//           data: {
//             projectId,
//             content: 'Something went wrong — please try again',
//             role:    'ASSISTANT',
//             type:    'ERROR',
//           },
//         })
//       }

//       const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
//       const requiredIntegrations: string[] = requiredIntegrationsRaw
//         ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
//         : []

//       return prisma.message.create({
//         data: {
//           projectId,
//           content:              parseAgentOutput(responseResult.output),
//           role:                 'ASSISTANT',
//           type:                 'RESULT',
//           requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
//           fragment: {
//             create: {
//               sandboxUrl,
//               title: parseAgentOutput(titleResult.output),
//               files: allFiles,
//             },
//           },
//         },
//       })
//     })

//     // ── Architecture map update ───────────────────────────────────────────────
//     if (!isError) {
//       try {
//         const mapAgent = createAgent({
//           name:   'architecture-map-agent',
//           system: ARCHITECTURE_MAP_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })
//         const fileList = Object.entries(allFiles)
//           .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
//           .join('\n')

//         const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

//         const mapText = mapOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')
//         const cleanMap = mapText.replace(/```json|```/g, '').trim()

//         await step.run('update-architecture-map', async () => {
//           await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
//           return 'architecture map updated'
//         })
//       } catch (err) {
//         Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
//       }
//     }

//     // ── Vector store upsert (durable step — no agents) ────────────────────────
//     await step.run('upsert-vector-store', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
//       try {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              allFiles,
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
//         })
//         return `upserted ${Object.keys(allFiles).length} files`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
//         return `upsert failed: ${e}`
//       }
//     })

//     // ── Project memory archive (durable step — no agents) ─────────────────────
//     await step.run('archive-project-memory', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl) return 'skipped: no supabase'
//       try {
//         await archiveProjectMemory({
//           projectId,
//           userId,
//           userPrompt:         value,
//           aiSummary:          combinedSummary ?? '',
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return 'memory archived'
//       } catch (e) {
//         console.error('[archive-project-memory] failed:', e)
//         return `failed: ${e}`
//       }
//     })

//     return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
//   },
// )

// // ─── Embed repo files after GitHub import ─────────────────────────────────────

// export const embedRepoFilesFunction = inngest.createFunction(
//   { id: 'embed-repo-files', retries: 2 },
//   { event: 'isotope/repo.imported' },
//   async ({ event, step }) => {
//     const { projectId, userId, owner, repo } = event.data as {
//       projectId: string
//       userId:    string
//       owner:     string
//       repo:      string
//     }

//     await step.run('mark-indexing-start', async () => {
//       await prisma.project.update({
//         where: { id: projectId },
//         data:  { isIndexing: true },
//       })
//     })

//     let files: Record<string, string> = {}
//     let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

//     try {
//       files = await step.run('fetch-repo-files', async () => {
//         const { getGitHubToken } = await import('@/lib/github-token')
//         const { getRepoFiles }   = await import('@/lib/github')
//         const tokenRecord = await getGitHubToken(userId)
//         if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
//         return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
//       })

//       const project = await step.run('get-project', async () =>
//         prisma.project.findUnique({
//           where:  { id: projectId },
//           select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
//         }),
//       )

//       if (!project?.supabaseUrl) {
//         await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
//         return 'skipped: no supabase configured'
//       }

//       processedFiles = await step.run('transform-framework-files', async () => {
//         try {
//           const analysis  = JSON.parse(project.contextDocument ?? '{}')
//           const framework = (analysis.framework ?? 'nextjs') as string

//           if (framework === 'nextjs') {
//             return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//           }

//           console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
//           const { transformToNextJs } = await import('@/lib/ai-transformer')
//           const result = await transformToNextJs(files, framework)
//           console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
//           return result
//         } catch (err) {
//           console.error('[embed-repo] transform-framework-files failed, using originals:', err)
//           return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//         }
//       })

//       await step.run('upsert-repo-files', async () => {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              processedFiles!.files,
//           supabaseUrl:        project.supabaseUrl!,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
//       })
//     } finally {
//       await step.run('mark-indexing-done', async () => {
//         await prisma.project.update({
//           where: { id: projectId },
//           data:  { isIndexing: false },
//         })
//       })
//     }

//     return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
//   },
// )

// // ─── Daily free-credit top-up cron ────────────────────────────────────────────

// export const freeCreditsResetFunction = inngest.createFunction(
//   { id: 'free-credits-reset' },
//   { cron: '0 0 * * *' },
//   async ({ step }) => {
//     const count = await step.run('reset-free-credits', async () => resetFreeCredits())
//     return { message: `Reset credits for ${count} free user(s)` }
//   },
// )

// // ─── Vercel URL refresh after GitHub merge ────────────────────────────────────

// export const refreshVercelUrlFunction = inngest.createFunction(
//   { id: 'refresh-vercel-url' },
//   { event: 'github/vercel-url-refresh' },
//   async ({ event, step }) => {
//     const { projectId, vercelProjectId } = event.data as {
//       projectId:       string
//       vercelProjectId: string
//     }

//     await step.sleep('wait-for-vercel-deploy', '30s')

//     await step.run('fetch-and-save-url', async () => {
//       const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
//       await refreshVercelUrl(projectId, vercelProjectId)
//     })

//     return { projectId }
//   },
// )

// // ─── Stale GenerationEvent cleanup cron ───────────────────────────────────────

// export const purgeGenerationEventsFunction = inngest.createFunction(
//   { id: 'purge-generation-events' },
//   { cron: '0 2 * * *' },
//   async ({ step }) => {
//     const deleted = await step.run('purge-old-events', async () => {
//       const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
//       const result = await prisma.generationEvent.deleteMany({
//         where: { createdAt: { lt: cutoff } },
//       })
//       return result.count
//     })
//     return { message: `Purged ${deleted} stale GenerationEvent rows` }
//   },
// )







// /**
//  * codeAgentFunction.ts
//  *
//  * Core Inngest background functions for the Isotope AI code generation pipeline.
//  */

// import { createAgent, type Message } from '@inngest/agent-kit'
// import { readerModel } from '@/lib/openrouter'
// import * as Sentry from '@sentry/nextjs'

// import { inngest } from './client'
// import { getSandbox, parseAgentOutput } from './utils'
// import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
// import { prisma } from '@/lib/db'
// import type { Plan } from '@/generated/prisma'
// import {
//   FRAGMENT_TITLE_PROMPT,
//   RESPONSE_PROMPT,
//   DESIGN_LIBRARY,
//   BACKEND_AGENT_PROMPT,
//   ARCHITECTURE_MAP_PROMPT,
//   REVIEW_AGENT_PROMPT,
// } from '@/prompt'

// import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
// import { createDbEmitter } from '@/lib/generationEvents'
// import { makeEvent } from '@/streaming/events'
// import { generateTaskGraph } from '@/planning/planner'
// import { runCodeAgent } from '@/agents/codeAgent'
// import { runFixAgent } from '@/agents/fixAgent'
// import {
//   upsertFilesToVectorStore,
//   searchSimilarComponents,
//   formatComponentMatches,
//   archiveProjectMemory,
//   searchProjectMemory,
//   formatMemoryMatches,
// } from '@/lib/vector-store'

// import { TaskExecutor } from '@/execution/TaskExecutor'
// import type { Task, TaskGraph } from '@/execution/taskGraph'
// import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// // ─── helpers ──────────────────────────────────────────────────────────────────

// function buildTaskPrompt(
//   task: Task,
//   userRequest: string,
//   imageData?: { mimeType: string; base64: string },
//   contextSuffix = '',
// ): string | unknown[] {
//   const text =
//     `USER REQUEST: ${userRequest}\n\n` +
//     `YOUR TASK (${task.type}): ${task.description}\n\n` +
//     `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
//     contextSuffix

//   if (imageData) {
//     return [
//       { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
//       { type: 'text', text },
//     ]
//   }
//   return text
// }

// function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
//   switch (taskType) {
//     case 'ui':
//       return DESIGN_LIBRARY + contextSuffix
//     case 'backend':
//       return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
//     default:
//       return contextSuffix
//   }
// }

// // ─── main Inngest function ────────────────────────────────────────────────────

// export const codeAgentFunction = inngest.createFunction(
//   { id: 'code-agent' },
//   { event: 'code-agent/run' },
//   async ({ event, step }) => {
//     const { messageId, projectId, value, imageUrl } = event.data as {
//       messageId: string
//       projectId: string
//       value: string
//       imageUrl?: string
//       supabaseUrl?: string
//       supabaseAnonKey?: string
//     }

//     // ── 1. Check where we are in the plan/approval lifecycle ──────────────────
//     const existingMessage = await step.run('check-plan-status', async () =>
//       prisma.message.findUnique({
//         where: { id: messageId },
//         select: { planStatus: true, plan: true },
//       }),
//     )

//     // ════════════════════════════════════════════════════════════════════════════
//     // PLAN PHASE — generate task graph and pause for user approval
//     // ════════════════════════════════════════════════════════════════════════════

//     if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

//       const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
//         const project = await prisma.project.findUnique({
//           where: { id: projectId },
//           select: { userId: true },
//         })
//         if (!project?.userId) return { userPlan: 'free' }
//         const credits = await prisma.credits.findUnique({
//           where: { userId: project.userId },
//           select: { plan: true },
//         })
//         return { userPlan: credits?.plan ?? 'free' }
//       })

//       const planSandboxId = await step.run('plan-get-sandbox', async () => {
//         const { sandboxId } = await getOrCreateSandbox(projectId)
//         return sandboxId
//       })

//       await step.run('plan-restore-files', async () =>
//         restoreFilesIntoSandbox(projectId, planSandboxId),
//       )

//       const taskGraph = await step.run('generate-task-graph', async () =>
//         generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
//       )

//       await step.run('store-plan', async () =>
//         prisma.message.update({
//           where: { id: messageId },
//           data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
//         }),
//       )

//       return { status: 'awaiting_approval', messageId }
//     }

//     if (existingMessage.planStatus === 'rejected') {
//       return { status: 'rejected', messageId }
//     }

//     // ════════════════════════════════════════════════════════════════════════════
//     // CODING PHASE — runs after user approves the plan
//     // ════════════════════════════════════════════════════════════════════════════

//     let taskGraphData: TaskGraph = { summary: '', tasks: [] }
//     try {
//       taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
//     } catch {
//       /* fall through — will default to single-agent mode below */
//     }
//     const tasks: Task[] = taskGraphData?.tasks ?? []

//     const emit = createDbEmitter(messageId)

//     // ── Durable setup steps (Prisma only — safe inside step.run) ─────────────

//     const sandboxId = await step.run('exec-get-sandbox', async () => {
//       const { sandboxId: id } = await getOrCreateSandbox(projectId)
//       return id
//     })

//     const restoredFiles = await step.run('exec-restore-files', async () =>
//       restoreFilesIntoSandbox(projectId, sandboxId, emit),
//     )

//     const { userPlan, userId } = await step.run('get-user-plan', async () => {
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { userId: true },
//       })
//       if (!project?.userId) return { userPlan: 'free', userId: '' }
//       const credits = await prisma.credits.findUnique({
//         where: { userId: project.userId },
//         select: { plan: true },
//       })
//       return { userPlan: credits?.plan ?? 'free', userId: project.userId }
//     })

//     const projectContext = await step.run('get-project-context', async () =>
//       prisma.project.findUnique({
//         where: { id: projectId },
//         select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
//       }),
//     )

//     const previousMessages = await step.run('get-previous-messages', async () => {
//       const all = await prisma.message.findMany({
//         where: { projectId },
//         orderBy: { createdAt: 'desc' },
//         take: 200,
//       })
//       all.reverse()

//       if (all.length > 8) {
//         const old    = all.slice(0, all.length - 6)
//         const recent = all.slice(all.length - 6)
//         const summary = old
//           .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
//           .map((m: { content: string }) => m.content.slice(0, 200))
//           .join(' | ')
//         const formatted: { type: string; role: string; content: string }[] = []
//         if (summary) {
//           formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
//         }
//         for (const m of recent) {
//           formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
//         }
//         return formatted
//       }
//       return all.map((m: { role: string; content: string }) => ({
//         type:    'text',
//         role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
//         content: m.content,
//       }))
//     })

//     const similarComponents = await step.run('search-components-for-coding', async () => {
//       if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
//       try {
//         const matches = await searchSimilarComponents({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
//         })
//         return formatComponentMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     const pastMemory = await step.run('search-project-memory', async () => {
//       if (!projectContext?.supabaseUrl) return ''
//       try {
//         const matches = await searchProjectMemory({
//           projectId,
//           query:              value,
//           supabaseUrl:        projectContext.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
//         })
//         return formatMemoryMatches(matches)
//       } catch {
//         return ''
//       }
//     })

//     // ── Build shared context suffix ────────────────────────────────────────────

//     const supabaseCtx = (() => {
//       const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
//       const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
//       if (!url || !key) return ''
//       return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
//     })()

//     const archCtx = projectContext?.contextDocument
//       ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
//       : ''

//     const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

//     let imageData: { mimeType: string; base64: string } | undefined
//     if (imageUrl) {
//       const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
//       if (match) imageData = { mimeType: match[1], base64: match[2] }
//     }

//     let allFiles: Record<string, string> = restoredFiles.files ?? {}
//     const summaries: string[] = []

//     // ── AgentRunner — called by TaskExecutor for each task ────────────────────
//     const makeRunner = (): AgentRunner => ({
//       async run(task: Task, ctx: ExecutionContext): Promise<void> {

//         if (task.type === 'search') {
//           const { runSearchAgent } = await import('@/lib/search-agent')
//           const project = await prisma.project.findUnique({
//             where: { id: projectId },
//             select: { supabaseUrl: true, supabaseAnonKey: true },
//           })
//           const result = await runSearchAgent({
//             libraryName:        task.id.replace(/^search-/, ''),
//             description:        task.description,
//             sandboxId:          ctx.sandboxId,
//             supabaseUrl:        project?.supabaseUrl ?? undefined,
//             supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
//           })
//           ctx.emit(makeEvent('log', {
//             data: {
//               description: result.fromCache
//                 ? `Loaded ${result.libraryName} docs from cache`
//                 : `Fetched and cached ${result.libraryName} docs`,
//               message: result.fromCache ? 'docs from cache' : 'docs fetched',
//             },
//           }))
//           ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
//             files:   { [result.docFilePath]: result.summary },
//             summary: `Fetched docs for ${result.libraryName}`,
//           }
//           return
//         }

//         const result = await runCodeAgent({
//           sandboxId:    ctx.sandboxId,
//           userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
//           history:      previousMessages as unknown as Message[],
//           allowedFiles: task.files.length > 0 ? task.files : undefined,
//           initialFiles: allFiles,
//           systemSuffix: buildSystemSuffix(task.type, contextSuffix),
//           emit:         ctx.emit,
//           userPlan,
//           taskType:     task.type,
//           fileCount:    task.files.length,
//           taskId:       task.id,
//         })

//         ;(task as Task & { _result?: typeof result })._result = result
//       },
//     })

//     // ── Per-task TypeScript validation + auto-fix ─────────────────────────────
//     let actualFixCount = 0

//     const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free

//     const validateTask = async (task: Task, ctx: ExecutionContext): Promise<void> => {
//       if (task.files.length === 0) return

//       const errors = await runTsc(ctx.sandboxId, task.files)
//       if (!errors) return

//       emit(makeEvent('validation_failed', { taskId: task.id, data: { errors: errors.slice(0, 300) } }))
//       actualFixCount++

//       const fixResult = await runFixAgent({
//         sandboxId:     ctx.sandboxId,
//         existingFiles: allFiles,
//         failingFiles:  task.files,
//         emit:          ctx.emit,
//         userPlan,
//         maxLoops:      planFeatures.maxFixLoops,
//         step,
//       })

//       allFiles = { ...allFiles, ...fixResult.files }
//       emit(makeEvent('fix_completed', { taskId: task.id }))
//     }

//     // ── Build and run the TaskExecutor ────────────────────────────────────────
//     const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
//     const maxTasks = planFeatures.maxTasks

//     const rawTaskGraph: TaskGraph = tasks.length > 0
//       ? taskGraphData
//       : {
//           summary: '',
//           tasks: [{
//             id:          'task_1',
//             type:        'ui',
//             description: value,
//             files:       [],
//             dependsOn:   [],
//             priority:    1,
//           }],
//         }

//     const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
//       ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
//       : rawTaskGraph

//     const runner   = makeRunner()
//     const executor = new TaskExecutor(taskGraphToRun, execContext, {
//       maxRetries: 3,
//       agents: {
//         ui:          runner,
//         backend:     runner,
//         db:          runner,
//         integration: runner,
//         search:      runner,
//       },
//       validate: validateTask,
//     })

//     executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
//       allFiles = { ...allFiles, ...result.files }
//       if (result.summary) summaries.push(result.summary)
//     })

//     let executorFailed = false
//     try {
//       await executor.run()
//     } catch (err) {
//       executorFailed = true
//       Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
//     }

//     const combinedSummary = summaries.map((s) => s.trim()).join('\n')
//     const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

//     // ── Charge credits (durable step — Prisma only) ───────────────────────────
//     await step.run('charge-credits-v2', async () => {
//       if (!userId) return 'skipped: no userId'
//       try {
//         const { consumeCreditsV2 } = await import('@/lib/usage')
//         const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
//         const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
//         const fixCount    = executorFailed ? 0 : actualFixCount
//         await consumeCreditsV2({
//           userId,
//           breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
//           reason: 'generation',
//         })
//         return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
//         console.error('[charge-credits-v2] failed:', e)
//         return `charge failed: ${e}`
//       }
//     })

//     // ── Review Agent ──────────────────────────────────────────────────────────
//     if (!isError && Object.keys(allFiles).length > 0) {
//       try {
//         const modifiedFiles = Object.keys(allFiles)
//         const fileList = modifiedFiles
//           .slice(0, 20)
//           .map((path) => {
//             const content   = allFiles[path] ?? ''
//             const truncated = content.length > 3000
//               ? content.slice(0, 3000) + '\n... (truncated)'
//               : content
//             return `<file path="${path}">\n${truncated}\n</file>`
//           })
//           .join('\n\n')

//         const reviewAgent = createAgent({
//           name:   'review-agent',
//           system: REVIEW_AGENT_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })

//         const reviewInput = [
//           `<files_modified>\n${fileList}\n</files_modified>`,
//           `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
//         ].join('\n\n')

//         const { output: reviewOutput } = await reviewAgent.run(reviewInput)

//         const reviewText = reviewOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')

//         const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
//         const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
//         console.log(reviewSummary
//           ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
//           : '[review-agent] completed (no summary emitted)',
//         )
//       } catch (err) {
//         Sentry.captureException(err, {
//           extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
//         })
//         console.error('[review-agent] failed (non-fatal):', err)
//       }
//     }

//     // ── Fragment title + assistant response ───────────────────────────────────
//     const fragmentTitleGenerator = createAgent({
//       name:   'fragment-title-generator',
//       system: FRAGMENT_TITLE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })
//     const responseGenerator = createAgent({
//       name:   'response-generator',
//       system: RESPONSE_PROMPT,
//       model:  (readerModel as unknown) as any,
//     })

//     const [titleResult, responseResult] = await Promise.all([
//       fragmentTitleGenerator.run(combinedSummary || 'No summary'),
//       responseGenerator.run(combinedSummary || 'No summary'),
//     ])

//     // ── Sandbox URL (durable step — no agents) ────────────────────────────────
//     const sandboxUrl = await step.run('get-sandbox-url', async () => {
//       const sandbox = await getSandbox(sandboxId)
//       const host    = sandbox.getHost(3000)
//       return `https://${host}`
//     })

//     // ── Persist result to DB (durable step — Prisma only) ─────────────────────
//     await step.run('save-result', async () => {
//       if (isError) {
//         return prisma.message.create({
//           data: {
//             projectId,
//             content: 'Something went wrong — please try again',
//             role:    'ASSISTANT',
//             type:    'ERROR',
//           },
//         })
//       }

//       const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
//       const requiredIntegrations: string[] = requiredIntegrationsRaw
//         ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
//         : []

//       return prisma.message.create({
//         data: {
//           projectId,
//           content:              parseAgentOutput(responseResult.output),
//           role:                 'ASSISTANT',
//           type:                 'RESULT',
//           requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
//           fragment: {
//             create: {
//               sandboxUrl,
//               title: parseAgentOutput(titleResult.output),
//               files: allFiles,
//             },
//           },
//         },
//       })
//     })

//     // ── Architecture map update ───────────────────────────────────────────────
//     if (!isError) {
//       try {
//         const mapAgent = createAgent({
//           name:   'architecture-map-agent',
//           system: ARCHITECTURE_MAP_PROMPT,
//           model:  (readerModel as unknown) as any,
//         })
//         const fileList = Object.entries(allFiles)
//           .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
//           .join('\n')

//         const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

//         const mapText = mapOutput
//           .filter((m) => (m as any).type === 'text')
//           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
//           .join('')
//         const cleanMap = mapText.replace(/```json|```/g, '').trim()

//         await step.run('update-architecture-map', async () => {
//           await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
//           return 'architecture map updated'
//         })
//       } catch (err) {
//         Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
//       }
//     }

//     // ── Vector store upsert (durable step — no agents) ────────────────────────
//     await step.run('upsert-vector-store', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
//       try {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              allFiles,
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
//         })
//         return `upserted ${Object.keys(allFiles).length} files`
//       } catch (e) {
//         Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
//         return `upsert failed: ${e}`
//       }
//     })

//     // ── Project memory archive (durable step — no agents) ─────────────────────
//     await step.run('archive-project-memory', async () => {
//       if (isError) return 'skipped: error state'
//       const project = await prisma.project.findUnique({
//         where: { id: projectId },
//         select: { supabaseUrl: true, supabaseAnonKey: true },
//       })
//       if (!project?.supabaseUrl) return 'skipped: no supabase'
//       try {
//         await archiveProjectMemory({
//           projectId,
//           userId,
//           userPrompt:         value,
//           aiSummary:          combinedSummary ?? '',
//           supabaseUrl:        project.supabaseUrl,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return 'memory archived'
//       } catch (e) {
//         console.error('[archive-project-memory] failed:', e)
//         return `failed: ${e}`
//       }
//     })

//     return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
//   },
// )

// // ─── Embed repo files after GitHub import ─────────────────────────────────────

// export const embedRepoFilesFunction = inngest.createFunction(
//   { id: 'embed-repo-files', retries: 2 },
//   { event: 'isotope/repo.imported' },
//   async ({ event, step }) => {
//     const { projectId, userId, owner, repo } = event.data as {
//       projectId: string
//       userId:    string
//       owner:     string
//       repo:      string
//     }

//     await step.run('mark-indexing-start', async () => {
//       await prisma.project.update({
//         where: { id: projectId },
//         data:  { isIndexing: true },
//       })
//     })

//     let files: Record<string, string> = {}
//     let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

//     try {
//       files = await step.run('fetch-repo-files', async () => {
//         const { getGitHubToken } = await import('@/lib/github-token')
//         const { getRepoFiles }   = await import('@/lib/github')
//         const tokenRecord = await getGitHubToken(userId)
//         if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
//         return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
//       })

//       const project = await step.run('get-project', async () =>
//         prisma.project.findUnique({
//           where:  { id: projectId },
//           select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
//         }),
//       )

//       if (!project?.supabaseUrl) {
//         await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
//         return 'skipped: no supabase configured'
//       }

//       processedFiles = await step.run('transform-framework-files', async () => {
//         try {
//           const analysis  = JSON.parse(project.contextDocument ?? '{}')
//           const framework = (analysis.framework ?? 'nextjs') as string

//           if (framework === 'nextjs') {
//             return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//           }

//           console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
//           const { transformToNextJs } = await import('@/lib/ai-transformer')
//           const result = await transformToNextJs(files, framework)
//           console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
//           return result
//         } catch (err) {
//           console.error('[embed-repo] transform-framework-files failed, using originals:', err)
//           return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
//         }
//       })

//       await step.run('upsert-repo-files', async () => {
//         await upsertFilesToVectorStore({
//           projectId,
//           files:              processedFiles!.files,
//           supabaseUrl:        project.supabaseUrl!,
//           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
//         })
//         return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
//       })
//     } finally {
//       await step.run('mark-indexing-done', async () => {
//         await prisma.project.update({
//           where: { id: projectId },
//           data:  { isIndexing: false },
//         })
//       })
//     }

//     return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
//   },
// )

// // ─── Daily free-credit top-up cron ────────────────────────────────────────────

// export const freeCreditsResetFunction = inngest.createFunction(
//   { id: 'free-credits-reset' },
//   { cron: '0 0 * * *' },
//   async ({ step }) => {
//     const count = await step.run('reset-free-credits', async () => resetFreeCredits())
//     return { message: `Reset credits for ${count} free user(s)` }
//   },
// )

// // ─── Vercel URL refresh after GitHub merge ────────────────────────────────────

// export const refreshVercelUrlFunction = inngest.createFunction(
//   { id: 'refresh-vercel-url' },
//   { event: 'github/vercel-url-refresh' },
//   async ({ event, step }) => {
//     const { projectId, vercelProjectId } = event.data as {
//       projectId:       string
//       vercelProjectId: string
//     }

//     await step.sleep('wait-for-vercel-deploy', '30s')

//     await step.run('fetch-and-save-url', async () => {
//       const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
//       await refreshVercelUrl(projectId, vercelProjectId)
//     })

//     return { projectId }
//   },
// )

// // ─── Stale GenerationEvent cleanup cron ───────────────────────────────────────

// export const purgeGenerationEventsFunction = inngest.createFunction(
//   { id: 'purge-generation-events' },
//   { cron: '0 2 * * *' },
//   async ({ step }) => {
//     const deleted = await step.run('purge-old-events', async () => {
//       const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
//       const result = await prisma.generationEvent.deleteMany({
//         where: { createdAt: { lt: cutoff } },
//       })
//       return result.count
//     })
//     return { message: `Purged ${deleted} stale GenerationEvent rows` }
//   },
// )





// // /**
// //  * codeAgentFunction.ts
// //  *
// //  * Core Inngest background functions for the Isotope AI code generation pipeline.
// //  */

// // import { createAgent, type Message } from '@inngest/agent-kit'
// // import { readerModel } from '@/lib/openrouter'
// // import * as Sentry from '@sentry/nextjs'

// // import { inngest } from './client'
// // import { getSandbox, parseAgentOutput } from './utils'
// // import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
// // import { prisma } from '@/lib/db'
// // import type { Plan } from '@/generated/prisma'
// // import {
// //   FRAGMENT_TITLE_PROMPT,
// //   RESPONSE_PROMPT,
// //   DESIGN_LIBRARY,
// //   BACKEND_AGENT_PROMPT,
// //   ARCHITECTURE_MAP_PROMPT,
// //   REVIEW_AGENT_PROMPT,
// // } from '@/prompt'

// // import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
// // import { createDbEmitter } from '@/lib/generationEvents'
// // import { makeEvent } from '@/streaming/events'
// // import { generateTaskGraph } from '@/planning/planner'
// // import { runCodeAgent } from '@/agents/codeAgent'
// // import { runFixAgent } from '@/agents/fixAgent'
// // import {
// //   upsertFilesToVectorStore,
// //   searchSimilarComponents,
// //   formatComponentMatches,
// //   archiveProjectMemory,
// //   searchProjectMemory,
// //   formatMemoryMatches,
// // } from '@/lib/vector-store'

// // import { TaskExecutor } from '@/execution/TaskExecutor'
// // import type { Task, TaskGraph } from '@/execution/taskGraph'
// // import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// // // ─── helpers ──────────────────────────────────────────────────────────────────

// // function buildTaskPrompt(
// //   task: Task,
// //   userRequest: string,
// //   imageData?: { mimeType: string; base64: string },
// //   contextSuffix = '',
// // ): string | unknown[] {
// //   const text =
// //     `USER REQUEST: ${userRequest}\n\n` +
// //     `YOUR TASK (${task.type}): ${task.description}\n\n` +
// //     `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
// //     contextSuffix

// //   if (imageData) {
// //     return [
// //       { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
// //       { type: 'text', text },
// //     ]
// //   }
// //   return text
// // }

// // function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
// //   switch (taskType) {
// //     case 'ui':
// //       return DESIGN_LIBRARY + contextSuffix
// //     case 'backend':
// //       return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
// //     default:
// //       return contextSuffix
// //   }
// // }

// // // ─── main Inngest function ────────────────────────────────────────────────────

// // export const codeAgentFunction = inngest.createFunction(
// //   { id: 'code-agent' },
// //   { event: 'code-agent/run' },
// //   async ({ event, step }) => {
// //     const { messageId, projectId, value, imageUrl } = event.data as {
// //       messageId: string
// //       projectId: string
// //       value: string
// //       imageUrl?: string
// //       supabaseUrl?: string
// //       supabaseAnonKey?: string
// //     }

// //     // ── 1. Check where we are in the plan/approval lifecycle ──────────────────
// //     const existingMessage = await step.run('check-plan-status', async () =>
// //       prisma.message.findUnique({
// //         where: { id: messageId },
// //         select: { planStatus: true, plan: true },
// //       }),
// //     )

// //     // ════════════════════════════════════════════════════════════════════════════
// //     // PLAN PHASE — generate task graph and pause for user approval
// //     // ════════════════════════════════════════════════════════════════════════════

// //     if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

// //       const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
// //         const project = await prisma.project.findUnique({
// //           where: { id: projectId },
// //           select: { userId: true },
// //         })
// //         if (!project?.userId) return { userPlan: 'free' }
// //         const credits = await prisma.credits.findUnique({
// //           where: { userId: project.userId },
// //           select: { plan: true },
// //         })
// //         return { userPlan: credits?.plan ?? 'free' }
// //       })

// //       const planSandboxId = await step.run('plan-get-sandbox', async () => {
// //         const { sandboxId } = await getOrCreateSandbox(projectId)
// //         return sandboxId
// //       })

// //       await step.run('plan-restore-files', async () =>
// //         restoreFilesIntoSandbox(projectId, planSandboxId),
// //       )

// //       const taskGraph = await step.run('generate-task-graph', async () =>
// //         generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
// //       )

// //       await step.run('store-plan', async () =>
// //         prisma.message.update({
// //           where: { id: messageId },
// //           data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
// //         }),
// //       )

// //       return { status: 'awaiting_approval', messageId }
// //     }

// //     if (existingMessage.planStatus === 'rejected') {
// //       return { status: 'rejected', messageId }
// //     }

// //     // ════════════════════════════════════════════════════════════════════════════
// //     // CODING PHASE — runs after user approves the plan
// //     // ════════════════════════════════════════════════════════════════════════════

// //     let taskGraphData: TaskGraph = { summary: '', tasks: [] }
// //     try {
// //       taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
// //     } catch {
// //       /* fall through — will default to single-agent mode below */
// //     }
// //     const tasks: Task[] = taskGraphData?.tasks ?? []

// //     const emit = createDbEmitter(messageId)

// //     // ── Durable setup steps (Prisma only — safe inside step.run) ─────────────

// //     const sandboxId = await step.run('exec-get-sandbox', async () => {
// //       const { sandboxId: id } = await getOrCreateSandbox(projectId)
// //       return id
// //     })

// //     const restoredFiles = await step.run('exec-restore-files', async () =>
// //       restoreFilesIntoSandbox(projectId, sandboxId, emit),
// //     )

// //     const { userPlan, userId } = await step.run('get-user-plan', async () => {
// //       const project = await prisma.project.findUnique({
// //         where: { id: projectId },
// //         select: { userId: true },
// //       })
// //       if (!project?.userId) return { userPlan: 'free', userId: '' }
// //       const credits = await prisma.credits.findUnique({
// //         where: { userId: project.userId },
// //         select: { plan: true },
// //       })
// //       return { userPlan: credits?.plan ?? 'free', userId: project.userId }
// //     })

// //     const projectContext = await step.run('get-project-context', async () =>
// //       prisma.project.findUnique({
// //         where: { id: projectId },
// //         select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
// //       }),
// //     )

// //     const previousMessages = await step.run('get-previous-messages', async () => {
// //       const all = await prisma.message.findMany({
// //         where: { projectId },
// //         orderBy: { createdAt: 'desc' },
// //         take: 200,
// //       })
// //       all.reverse()

// //       if (all.length > 8) {
// //         const old    = all.slice(0, all.length - 6)
// //         const recent = all.slice(all.length - 6)
// //         const summary = old
// //           .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
// //           .map((m: { content: string }) => m.content.slice(0, 200))
// //           .join(' | ')
// //         const formatted: { type: string; role: string; content: string }[] = []
// //         if (summary) {
// //           formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
// //         }
// //         for (const m of recent) {
// //           formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
// //         }
// //         return formatted
// //       }
// //       return all.map((m: { role: string; content: string }) => ({
// //         type:    'text',
// //         role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
// //         content: m.content,
// //       }))
// //     })

// //     const similarComponents = await step.run('search-components-for-coding', async () => {
// //       if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
// //       try {
// //         const matches = await searchSimilarComponents({
// //           projectId,
// //           query:              value,
// //           supabaseUrl:        projectContext.supabaseUrl,
// //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
// //         })
// //         return formatComponentMatches(matches)
// //       } catch {
// //         return ''
// //       }
// //     })

// //     const pastMemory = await step.run('search-project-memory', async () => {
// //       if (!projectContext?.supabaseUrl) return ''
// //       try {
// //         const matches = await searchProjectMemory({
// //           projectId,
// //           query:              value,
// //           supabaseUrl:        projectContext.supabaseUrl,
// //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
// //         })
// //         return formatMemoryMatches(matches)
// //       } catch {
// //         return ''
// //       }
// //     })

// //     // ── Build shared context suffix ────────────────────────────────────────────

// //     const supabaseCtx = (() => {
// //       const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
// //       const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
// //       if (!url || !key) return ''
// //       return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
// //     })()

// //     const archCtx = projectContext?.contextDocument
// //       ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
// //       : ''

// //     const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

// //     let imageData: { mimeType: string; base64: string } | undefined
// //     if (imageUrl) {
// //       const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
// //       if (match) imageData = { mimeType: match[1], base64: match[2] }
// //     }

// //     let allFiles: Record<string, string> = restoredFiles.files ?? {}
// //     const summaries: string[] = []

// //     // ── AgentRunner — called by TaskExecutor for each task ────────────────────
// //     const makeRunner = (): AgentRunner => ({
// //       async run(task: Task, ctx: ExecutionContext): Promise<void> {

// //         if (task.type === 'search') {
// //           const { runSearchAgent } = await import('@/lib/search-agent')
// //           const project = await prisma.project.findUnique({
// //             where: { id: projectId },
// //             select: { supabaseUrl: true, supabaseAnonKey: true },
// //           })
// //           const result = await runSearchAgent({
// //             libraryName:        task.id.replace(/^search-/, ''),
// //             description:        task.description,
// //             sandboxId:          ctx.sandboxId,
// //             supabaseUrl:        project?.supabaseUrl ?? undefined,
// //             supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
// //           })
// //           ctx.emit(makeEvent('log', {
// //             data: {
// //               description: result.fromCache
// //                 ? `Loaded ${result.libraryName} docs from cache`
// //                 : `Fetched and cached ${result.libraryName} docs`,
// //               message: result.fromCache ? 'docs from cache' : 'docs fetched',
// //             },
// //           }))
// //           ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
// //             files:   { [result.docFilePath]: result.summary },
// //             summary: `Fetched docs for ${result.libraryName}`,
// //           }
// //           return
// //         }

// //         // ✅ FIX: step removed from runCodeAgent — tool handlers must NOT call
// //         // step.run() as it breaks agent-kit's AsyncLocalStorage context.
// //         // See createTools.ts for full explanation.
// //         const result = await runCodeAgent({
// //           sandboxId:    ctx.sandboxId,
// //           userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
// //           history:      previousMessages as unknown as Message[],
// //           allowedFiles: task.files.length > 0 ? task.files : undefined,
// //           initialFiles: allFiles,
// //           systemSuffix: buildSystemSuffix(task.type, contextSuffix),
// //           emit:         ctx.emit,
// //           userPlan,
// //           taskType:     task.type,
// //           fileCount:    task.files.length,
// //         })

// //         ;(task as Task & { _result?: typeof result })._result = result
// //       },
// //     })

// //     // ── Per-task TypeScript validation + auto-fix ─────────────────────────────
// //     let actualFixCount = 0

// //     const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free

// //     const validateTask = async (task: Task, ctx: ExecutionContext): Promise<void> => {
// //       if (task.files.length === 0) return

// //       const errors = await runTsc(ctx.sandboxId, task.files)
// //       if (!errors) return

// //       emit(makeEvent('validation_failed', { taskId: task.id, data: { errors: errors.slice(0, 300) } }))
// //       actualFixCount++

// //       // ✅ FIX: step removed from runFixAgent — same reason as above.
// //       const fixResult = await runFixAgent({
// //         sandboxId:     ctx.sandboxId,
// //         existingFiles: allFiles,
// //         failingFiles:  task.files,
// //         emit:          ctx.emit,
// //         userPlan,
// //         maxLoops:      planFeatures.maxFixLoops,
// //       })

// //       allFiles = { ...allFiles, ...fixResult.files }
// //       emit(makeEvent('fix_completed', { taskId: task.id }))
// //     }

// //     // ── Build and run the TaskExecutor ────────────────────────────────────────
// //     const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
// //     const maxTasks = planFeatures.maxTasks

// //     const rawTaskGraph: TaskGraph = tasks.length > 0
// //       ? taskGraphData
// //       : {
// //           summary: '',
// //           tasks: [{
// //             id:          'task_1',
// //             type:        'ui',
// //             description: value,
// //             files:       [],
// //             dependsOn:   [],
// //             priority:    1,
// //           }],
// //         }

// //     const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
// //       ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
// //       : rawTaskGraph

// //     const runner   = makeRunner()
// //     const executor = new TaskExecutor(taskGraphToRun, execContext, {
// //       maxRetries: 3,
// //       agents: {
// //         ui:          runner,
// //         backend:     runner,
// //         db:          runner,
// //         integration: runner,
// //         search:      runner,
// //       },
// //       validate: validateTask,
// //     })

// //     executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
// //       allFiles = { ...allFiles, ...result.files }
// //       if (result.summary) summaries.push(result.summary)
// //     })

// //     let executorFailed = false
// //     try {
// //       await executor.run()
// //     } catch (err) {
// //       executorFailed = true
// //       Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
// //     }

// //     const combinedSummary = summaries.map((s) => s.trim()).join('\n')
// //     const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

// //     // ── Charge credits (durable step — Prisma only) ───────────────────────────
// //     await step.run('charge-credits-v2', async () => {
// //       if (!userId) return 'skipped: no userId'
// //       try {
// //         const { consumeCreditsV2 } = await import('@/lib/usage')
// //         const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
// //         const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
// //         const fixCount    = executorFailed ? 0 : actualFixCount
// //         await consumeCreditsV2({
// //           userId,
// //           breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
// //           reason: 'generation',
// //         })
// //         return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
// //       } catch (e) {
// //         Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
// //         console.error('[charge-credits-v2] failed:', e)
// //         return `charge failed: ${e}`
// //       }
// //     })

// //     // ── Review Agent ──────────────────────────────────────────────────────────
// //     if (!isError && Object.keys(allFiles).length > 0) {
// //       try {
// //         const modifiedFiles = Object.keys(allFiles)
// //         const fileList = modifiedFiles
// //           .slice(0, 20)
// //           .map((path) => {
// //             const content   = allFiles[path] ?? ''
// //             const truncated = content.length > 3000
// //               ? content.slice(0, 3000) + '\n... (truncated)'
// //               : content
// //             return `<file path="${path}">\n${truncated}\n</file>`
// //           })
// //           .join('\n\n')

// //         const reviewAgent = createAgent({
// //           name:   'review-agent',
// //           system: REVIEW_AGENT_PROMPT,
// //           model:  (readerModel as unknown) as any,
// //         })

// //         const reviewInput = [
// //           `<files_modified>\n${fileList}\n</files_modified>`,
// //           `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
// //         ].join('\n\n')

// //         const { output: reviewOutput } = await reviewAgent.run(reviewInput)

// //         const reviewText = reviewOutput
// //           .filter((m) => (m as any).type === 'text')
// //           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
// //           .join('')

// //         const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
// //         const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
// //         console.log(reviewSummary
// //           ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
// //           : '[review-agent] completed (no summary emitted)',
// //         )
// //       } catch (err) {
// //         Sentry.captureException(err, {
// //           extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
// //         })
// //         console.error('[review-agent] failed (non-fatal):', err)
// //       }
// //     }

// //     // ── Fragment title + assistant response ───────────────────────────────────
// //     const fragmentTitleGenerator = createAgent({
// //       name:   'fragment-title-generator',
// //       system: FRAGMENT_TITLE_PROMPT,
// //       model:  (readerModel as unknown) as any,
// //     })
// //     const responseGenerator = createAgent({
// //       name:   'response-generator',
// //       system: RESPONSE_PROMPT,
// //       model:  (readerModel as unknown) as any,
// //     })

// //     const [titleResult, responseResult] = await Promise.all([
// //       fragmentTitleGenerator.run(combinedSummary || 'No summary'),
// //       responseGenerator.run(combinedSummary || 'No summary'),
// //     ])

// //     // ── Sandbox URL (durable step — no agents) ────────────────────────────────
// //     const sandboxUrl = await step.run('get-sandbox-url', async () => {
// //       const sandbox = await getSandbox(sandboxId)
// //       const host    = sandbox.getHost(3000)
// //       return `https://${host}`
// //     })

// //     // ── Persist result to DB (durable step — Prisma only) ─────────────────────
// //     await step.run('save-result', async () => {
// //       if (isError) {
// //         return prisma.message.create({
// //           data: {
// //             projectId,
// //             content: 'Something went wrong — please try again',
// //             role:    'ASSISTANT',
// //             type:    'ERROR',
// //           },
// //         })
// //       }

// //       const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
// //       const requiredIntegrations: string[] = requiredIntegrationsRaw
// //         ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
// //         : []

// //       return prisma.message.create({
// //         data: {
// //           projectId,
// //           content:              parseAgentOutput(responseResult.output),
// //           role:                 'ASSISTANT',
// //           type:                 'RESULT',
// //           requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
// //           fragment: {
// //             create: {
// //               sandboxUrl,
// //               title: parseAgentOutput(titleResult.output),
// //               files: allFiles,
// //             },
// //           },
// //         },
// //       })
// //     })

// //     // ── Architecture map update ───────────────────────────────────────────────
// //     if (!isError) {
// //       try {
// //         const mapAgent = createAgent({
// //           name:   'architecture-map-agent',
// //           system: ARCHITECTURE_MAP_PROMPT,
// //           model:  (readerModel as unknown) as any,
// //         })
// //         const fileList = Object.entries(allFiles)
// //           .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
// //           .join('\n')

// //         const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

// //         const mapText = mapOutput
// //           .filter((m) => (m as any).type === 'text')
// //           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
// //           .join('')
// //         const cleanMap = mapText.replace(/```json|```/g, '').trim()

// //         await step.run('update-architecture-map', async () => {
// //           await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
// //           return 'architecture map updated'
// //         })
// //       } catch (err) {
// //         Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
// //       }
// //     }

// //     // ── Vector store upsert (durable step — no agents) ────────────────────────
// //     await step.run('upsert-vector-store', async () => {
// //       if (isError) return 'skipped: error state'
// //       const project = await prisma.project.findUnique({
// //         where: { id: projectId },
// //         select: { supabaseUrl: true, supabaseAnonKey: true },
// //       })
// //       if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
// //       try {
// //         await upsertFilesToVectorStore({
// //           projectId,
// //           files:              allFiles,
// //           supabaseUrl:        project.supabaseUrl,
// //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
// //         })
// //         return `upserted ${Object.keys(allFiles).length} files`
// //       } catch (e) {
// //         Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
// //         return `upsert failed: ${e}`
// //       }
// //     })

// //     // ── Project memory archive (durable step — no agents) ─────────────────────
// //     await step.run('archive-project-memory', async () => {
// //       if (isError) return 'skipped: error state'
// //       const project = await prisma.project.findUnique({
// //         where: { id: projectId },
// //         select: { supabaseUrl: true, supabaseAnonKey: true },
// //       })
// //       if (!project?.supabaseUrl) return 'skipped: no supabase'
// //       try {
// //         await archiveProjectMemory({
// //           projectId,
// //           userId,
// //           userPrompt:         value,
// //           aiSummary:          combinedSummary ?? '',
// //           supabaseUrl:        project.supabaseUrl,
// //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
// //         })
// //         return 'memory archived'
// //       } catch (e) {
// //         console.error('[archive-project-memory] failed:', e)
// //         return `failed: ${e}`
// //       }
// //     })

// //     return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
// //   },
// // )

// // // ─── Embed repo files after GitHub import ─────────────────────────────────────

// // export const embedRepoFilesFunction = inngest.createFunction(
// //   { id: 'embed-repo-files', retries: 2 },
// //   { event: 'isotope/repo.imported' },
// //   async ({ event, step }) => {
// //     const { projectId, userId, owner, repo } = event.data as {
// //       projectId: string
// //       userId:    string
// //       owner:     string
// //       repo:      string
// //     }

// //     await step.run('mark-indexing-start', async () => {
// //       await prisma.project.update({
// //         where: { id: projectId },
// //         data:  { isIndexing: true },
// //       })
// //     })

// //     let files: Record<string, string> = {}
// //     let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

// //     try {
// //       files = await step.run('fetch-repo-files', async () => {
// //         const { getGitHubToken } = await import('@/lib/github-token')
// //         const { getRepoFiles }   = await import('@/lib/github')
// //         const tokenRecord = await getGitHubToken(userId)
// //         if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
// //         return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
// //       })

// //       const project = await step.run('get-project', async () =>
// //         prisma.project.findUnique({
// //           where:  { id: projectId },
// //           select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
// //         }),
// //       )

// //       if (!project?.supabaseUrl) {
// //         await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
// //         return 'skipped: no supabase configured'
// //       }

// //       processedFiles = await step.run('transform-framework-files', async () => {
// //         try {
// //           const analysis  = JSON.parse(project.contextDocument ?? '{}')
// //           const framework = (analysis.framework ?? 'nextjs') as string

// //           if (framework === 'nextjs') {
// //             return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
// //           }

// //           console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
// //           const { transformToNextJs } = await import('@/lib/ai-transformer')
// //           const result = await transformToNextJs(files, framework)
// //           console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
// //           return result
// //         } catch (err) {
// //           console.error('[embed-repo] transform-framework-files failed, using originals:', err)
// //           return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
// //         }
// //       })

// //       await step.run('upsert-repo-files', async () => {
// //         await upsertFilesToVectorStore({
// //           projectId,
// //           files:              processedFiles!.files,
// //           supabaseUrl:        project.supabaseUrl!,
// //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
// //         })
// //         return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
// //       })
// //     } finally {
// //       await step.run('mark-indexing-done', async () => {
// //         await prisma.project.update({
// //           where: { id: projectId },
// //           data:  { isIndexing: false },
// //         })
// //       })
// //     }

// //     return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
// //   },
// // )

// // // ─── Daily free-credit top-up cron ────────────────────────────────────────────

// // export const freeCreditsResetFunction = inngest.createFunction(
// //   { id: 'free-credits-reset' },
// //   { cron: '0 0 * * *' },
// //   async ({ step }) => {
// //     const count = await step.run('reset-free-credits', async () => resetFreeCredits())
// //     return { message: `Reset credits for ${count} free user(s)` }
// //   },
// // )

// // // ─── Vercel URL refresh after GitHub merge ────────────────────────────────────

// // export const refreshVercelUrlFunction = inngest.createFunction(
// //   { id: 'refresh-vercel-url' },
// //   { event: 'github/vercel-url-refresh' },
// //   async ({ event, step }) => {
// //     const { projectId, vercelProjectId } = event.data as {
// //       projectId:       string
// //       vercelProjectId: string
// //     }

// //     await step.sleep('wait-for-vercel-deploy', '30s')

// //     await step.run('fetch-and-save-url', async () => {
// //       const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
// //       await refreshVercelUrl(projectId, vercelProjectId)
// //     })

// //     return { projectId }
// //   },
// // )

// // // ─── Stale GenerationEvent cleanup cron ───────────────────────────────────────

// // export const purgeGenerationEventsFunction = inngest.createFunction(
// //   { id: 'purge-generation-events' },
// //   { cron: '0 2 * * *' },
// //   async ({ step }) => {
// //     const deleted = await step.run('purge-old-events', async () => {
// //       const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
// //       const result = await prisma.generationEvent.deleteMany({
// //         where: { createdAt: { lt: cutoff } },
// //       })
// //       return result.count
// //     })
// //     return { message: `Purged ${deleted} stale GenerationEvent rows` }
// //   },
// // )






// // // /**
// // //  * codeAgentFunction.ts
// // //  *
// // //  * Core Inngest background functions for the Isotope AI code generation pipeline.
// // //  */

// // // import { createAgent, type Message } from '@inngest/agent-kit'
// // // import { readerModel } from '@/lib/openrouter'
// // // import * as Sentry from '@sentry/nextjs'

// // // import { inngest } from './client'
// // // import { getSandbox, parseAgentOutput } from './utils'
// // // import { resetFreeCredits, PLAN_FEATURES } from '@/lib/usage'
// // // import { prisma } from '@/lib/db'
// // // import type { Plan } from '@/generated/prisma'
// // // import {
// // //   FRAGMENT_TITLE_PROMPT,
// // //   RESPONSE_PROMPT,
// // //   DESIGN_LIBRARY,
// // //   BACKEND_AGENT_PROMPT,
// // //   ARCHITECTURE_MAP_PROMPT,
// // //   REVIEW_AGENT_PROMPT,
// // // } from '@/prompt'

// // // import { getOrCreateSandbox, restoreFilesIntoSandbox, runTsc } from '@/sandbox/sandboxManager'
// // // import { createDbEmitter } from '@/lib/generationEvents'
// // // import { makeEvent } from '@/streaming/events'
// // // import { generateTaskGraph } from '@/planning/planner'
// // // import { runCodeAgent } from '@/agents/codeAgent'
// // // import { runFixAgent } from '@/agents/fixAgent'
// // // import {
// // //   upsertFilesToVectorStore,
// // //   searchSimilarComponents,
// // //   formatComponentMatches,
// // //   archiveProjectMemory,
// // //   searchProjectMemory,
// // //   formatMemoryMatches,
// // // } from '@/lib/vector-store'

// // // import { TaskExecutor } from '@/execution/TaskExecutor'
// // // import type { Task, TaskGraph } from '@/execution/taskGraph'
// // // import type { AgentRunner, ExecutionContext } from '@/execution/TaskExecutor'

// // // // ─── helpers ──────────────────────────────────────────────────────────────────

// // // function buildTaskPrompt(
// // //   task: Task,
// // //   userRequest: string,
// // //   imageData?: { mimeType: string; base64: string },
// // //   contextSuffix = '',
// // // ): string | unknown[] {
// // //   const text =
// // //     `USER REQUEST: ${userRequest}\n\n` +
// // //     `YOUR TASK (${task.type}): ${task.description}\n\n` +
// // //     `ALLOWED FILES — modify only these paths:\n${task.files.map((f) => `- ${f}`).join('\n') || '(none specified — use judgment)'}\n\n` +
// // //     contextSuffix

// // //   if (imageData) {
// // //     return [
// // //       { type: 'image', image: imageData.base64, mimeType: imageData.mimeType },
// // //       { type: 'text', text },
// // //     ]
// // //   }
// // //   return text
// // // }

// // // function buildSystemSuffix(taskType: Task['type'], contextSuffix: string): string {
// // //   switch (taskType) {
// // //     case 'ui':
// // //       return DESIGN_LIBRARY + contextSuffix
// // //     case 'backend':
// // //       return '\n\n' + BACKEND_AGENT_PROMPT + contextSuffix
// // //     default:
// // //       return contextSuffix
// // //   }
// // // }

// // // // ─── main Inngest function ────────────────────────────────────────────────────

// // // export const codeAgentFunction = inngest.createFunction(
// // //   { id: 'code-agent' },
// // //   { event: 'code-agent/run' },
// // //   async ({ event, step }) => {
// // //     const { messageId, projectId, value, imageUrl } = event.data as {
// // //       messageId: string
// // //       projectId: string
// // //       value: string
// // //       imageUrl?: string
// // //       supabaseUrl?: string
// // //       supabaseAnonKey?: string
// // //     }

// // //     // ── 1. Check where we are in the plan/approval lifecycle ──────────────────
// // //     const existingMessage = await step.run('check-plan-status', async () =>
// // //       prisma.message.findUnique({
// // //         where: { id: messageId },
// // //         select: { planStatus: true, plan: true },
// // //       }),
// // //     )

// // //     // ════════════════════════════════════════════════════════════════════════════
// // //     // PLAN PHASE — generate task graph and pause for user approval
// // //     // ════════════════════════════════════════════════════════════════════════════

// // //     if (!existingMessage?.planStatus || existingMessage.planStatus === 'pending') {

// // //       const { userPlan: planPhaseUserPlan } = await step.run('plan-get-user-plan', async () => {
// // //         const project = await prisma.project.findUnique({
// // //           where: { id: projectId },
// // //           select: { userId: true },
// // //         })
// // //         if (!project?.userId) return { userPlan: 'free' }
// // //         const credits = await prisma.credits.findUnique({
// // //           where: { userId: project.userId },
// // //           select: { plan: true },
// // //         })
// // //         return { userPlan: credits?.plan ?? 'free' }
// // //       })

// // //       const planSandboxId = await step.run('plan-get-sandbox', async () => {
// // //         const { sandboxId } = await getOrCreateSandbox(projectId)
// // //         return sandboxId
// // //       })

// // //       await step.run('plan-restore-files', async () =>
// // //         restoreFilesIntoSandbox(projectId, planSandboxId),
// // //       )

// // //       const taskGraph = await step.run('generate-task-graph', async () =>
// // //         generateTaskGraph({ sandboxId: planSandboxId, userRequest: value, userPlan: planPhaseUserPlan }),
// // //       )

// // //       await step.run('store-plan', async () =>
// // //         prisma.message.update({
// // //           where: { id: messageId },
// // //           data: { plan: JSON.stringify(taskGraph), planStatus: 'pending' },
// // //         }),
// // //       )

// // //       return { status: 'awaiting_approval', messageId }
// // //     }

// // //     if (existingMessage.planStatus === 'rejected') {
// // //       return { status: 'rejected', messageId }
// // //     }

// // //     // ════════════════════════════════════════════════════════════════════════════
// // //     // CODING PHASE — runs after user approves the plan
// // //     // ════════════════════════════════════════════════════════════════════════════

// // //     let taskGraphData: TaskGraph = { summary: '', tasks: [] }
// // //     try {
// // //       taskGraphData = JSON.parse(existingMessage.plan ?? '{}') as TaskGraph
// // //     } catch {
// // //       /* fall through — will default to single-agent mode below */
// // //     }
// // //     const tasks: Task[] = taskGraphData?.tasks ?? []

// // //     const emit = createDbEmitter(messageId)

// // //     // ── Durable setup steps (Prisma only — safe inside step.run) ─────────────

// // //     const sandboxId = await step.run('exec-get-sandbox', async () => {
// // //       const { sandboxId: id } = await getOrCreateSandbox(projectId)
// // //       return id
// // //     })

// // //     const restoredFiles = await step.run('exec-restore-files', async () =>
// // //       restoreFilesIntoSandbox(projectId, sandboxId, emit),
// // //     )

// // //     const { userPlan, userId } = await step.run('get-user-plan', async () => {
// // //       const project = await prisma.project.findUnique({
// // //         where: { id: projectId },
// // //         select: { userId: true },
// // //       })
// // //       if (!project?.userId) return { userPlan: 'free', userId: '' }
// // //       const credits = await prisma.credits.findUnique({
// // //         where: { userId: project.userId },
// // //         select: { plan: true },
// // //       })
// // //       return { userPlan: credits?.plan ?? 'free', userId: project.userId }
// // //     })

// // //     const projectContext = await step.run('get-project-context', async () =>
// // //       prisma.project.findUnique({
// // //         where: { id: projectId },
// // //         select: { contextDocument: true, supabaseUrl: true, supabaseAnonKey: true },
// // //       }),
// // //     )

// // //     const previousMessages = await step.run('get-previous-messages', async () => {
// // //       const all = await prisma.message.findMany({
// // //         where: { projectId },
// // //         orderBy: { createdAt: 'desc' },
// // //         take: 200,
// // //       })
// // //       all.reverse()

// // //       if (all.length > 8) {
// // //         const old    = all.slice(0, all.length - 6)
// // //         const recent = all.slice(all.length - 6)
// // //         const summary = old
// // //           .filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
// // //           .map((m: { content: string }) => m.content.slice(0, 200))
// // //           .join(' | ')
// // //         const formatted: { type: string; role: string; content: string }[] = []
// // //         if (summary) {
// // //           formatted.push({ type: 'text', role: 'user', content: `[Earlier context: ${summary}]` })
// // //         }
// // //         for (const m of recent) {
// // //           formatted.push({ type: 'text', role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content })
// // //         }
// // //         return formatted
// // //       }
// // //       return all.map((m: { role: string; content: string }) => ({
// // //         type:    'text',
// // //         role:    m.role === 'ASSISTANT' ? 'assistant' : 'user',
// // //         content: m.content,
// // //       }))
// // //     })

// // //     const similarComponents = await step.run('search-components-for-coding', async () => {
// // //       if (!projectContext?.supabaseUrl || !projectContext?.supabaseAnonKey) return ''
// // //       try {
// // //         const matches = await searchSimilarComponents({
// // //           projectId,
// // //           query:              value,
// // //           supabaseUrl:        projectContext.supabaseUrl,
// // //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey,
// // //         })
// // //         return formatComponentMatches(matches)
// // //       } catch {
// // //         return ''
// // //       }
// // //     })

// // //     const pastMemory = await step.run('search-project-memory', async () => {
// // //       if (!projectContext?.supabaseUrl) return ''
// // //       try {
// // //         const matches = await searchProjectMemory({
// // //           projectId,
// // //           query:              value,
// // //           supabaseUrl:        projectContext.supabaseUrl,
// // //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? projectContext.supabaseAnonKey ?? '',
// // //         })
// // //         return formatMemoryMatches(matches)
// // //       } catch {
// // //         return ''
// // //       }
// // //     })

// // //     // ── Build shared context suffix ────────────────────────────────────────────

// // //     const supabaseCtx = (() => {
// // //       const url = projectContext?.supabaseUrl ?? (event.data as Record<string, string>).supabaseUrl
// // //       const key = projectContext?.supabaseAnonKey ?? (event.data as Record<string, string>).supabaseAnonKey
// // //       if (!url || !key) return ''
// // //       return `\n\nSupabase is available:\n- NEXT_PUBLIC_SUPABASE_URL="${url}"\n- NEXT_PUBLIC_SUPABASE_ANON_KEY="${key}"\nUse @supabase/supabase-js. Install with terminal if needed.`
// // //     })()

// // //     const archCtx = projectContext?.contextDocument
// // //       ? `\n\n<architecture_map>\n${projectContext.contextDocument}\n</architecture_map>`
// // //       : ''

// // //     const contextSuffix = supabaseCtx + archCtx + (similarComponents ?? '') + (pastMemory ?? '')

// // //     let imageData: { mimeType: string; base64: string } | undefined
// // //     if (imageUrl) {
// // //       const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
// // //       if (match) imageData = { mimeType: match[1], base64: match[2] }
// // //     }

// // //     let allFiles: Record<string, string> = restoredFiles.files ?? {}
// // //     const summaries: string[] = []

// // //     // ── AgentRunner — called by TaskExecutor for each task ────────────────────
// // //     const makeRunner = (): AgentRunner => ({
// // //       async run(task: Task, ctx: ExecutionContext): Promise<void> {

// // //         if (task.type === 'search') {
// // //           const { runSearchAgent } = await import('@/lib/search-agent')
// // //           const project = await prisma.project.findUnique({
// // //             where: { id: projectId },
// // //             select: { supabaseUrl: true, supabaseAnonKey: true },
// // //           })
// // //           const result = await runSearchAgent({
// // //             libraryName:        task.id.replace(/^search-/, ''),
// // //             description:        task.description,
// // //             sandboxId:          ctx.sandboxId,
// // //             supabaseUrl:        project?.supabaseUrl ?? undefined,
// // //             supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project?.supabaseAnonKey ?? undefined,
// // //           })
// // //           ctx.emit(makeEvent('log', {
// // //             data: {
// // //               description: result.fromCache
// // //                 ? `Loaded ${result.libraryName} docs from cache`
// // //                 : `Fetched and cached ${result.libraryName} docs`,
// // //               message: result.fromCache ? 'docs from cache' : 'docs fetched',
// // //             },
// // //           }))
// // //           ;(task as Task & { _result?: { files: Record<string, string>; summary: string } })._result = {
// // //             files:   { [result.docFilePath]: result.summary },
// // //             summary: `Fetched docs for ${result.libraryName}`,
// // //           }
// // //           return
// // //         }

// // //         const result = await runCodeAgent({
// // //           sandboxId:    ctx.sandboxId,
// // //           userPrompt:   buildTaskPrompt(task, value, imageData, contextSuffix),
// // //           history:      previousMessages as unknown as Message[],
// // //           allowedFiles: task.files.length > 0 ? task.files : undefined,
// // //           initialFiles: allFiles,
// // //           systemSuffix: buildSystemSuffix(task.type, contextSuffix),
// // //           emit:         ctx.emit,
// // //           userPlan,
// // //           taskType:     task.type,
// // //           fileCount:    task.files.length,
// // //           step,
// // //         })

// // //         ;(task as Task & { _result?: typeof result })._result = result
// // //       },
// // //     })

// // //     // ── Per-task TypeScript validation + auto-fix ─────────────────────────────
// // //     let actualFixCount = 0

// // //     const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free

// // //     const validateTask = async (task: Task, ctx: ExecutionContext): Promise<void> => {
// // //       if (task.files.length === 0) return

// // //       const errors = await runTsc(ctx.sandboxId, task.files)
// // //       if (!errors) return

// // //       emit(makeEvent('validation_failed', { taskId: task.id, data: { errors: errors.slice(0, 300) } }))
// // //       actualFixCount++

// // //       const fixResult = await runFixAgent({
// // //         sandboxId:     ctx.sandboxId,
// // //         existingFiles: allFiles,
// // //         failingFiles:  task.files,
// // //         emit:          ctx.emit,
// // //         userPlan,
// // //         maxLoops:      planFeatures.maxFixLoops,
// // //         step,
// // //       })

// // //       allFiles = { ...allFiles, ...fixResult.files }
// // //       emit(makeEvent('fix_completed', { taskId: task.id }))
// // //     }

// // //     // ── Build and run the TaskExecutor ────────────────────────────────────────
// // //     const execContext: ExecutionContext = { sandboxId, tools: {}, emit, step }
// // //     const maxTasks = planFeatures.maxTasks

// // //     const rawTaskGraph: TaskGraph = tasks.length > 0
// // //       ? taskGraphData
// // //       : {
// // //           summary: '',
// // //           tasks: [{
// // //             id:          'task_1',
// // //             type:        'ui',
// // //             description: value,
// // //             files:       [],
// // //             dependsOn:   [],
// // //             priority:    1,
// // //           }],
// // //         }

// // //     const taskGraphToRun: TaskGraph = rawTaskGraph.tasks.length > maxTasks
// // //       ? { ...rawTaskGraph, tasks: rawTaskGraph.tasks.slice(0, maxTasks) }
// // //       : rawTaskGraph

// // //     const runner   = makeRunner()
// // //     const executor = new TaskExecutor(taskGraphToRun, execContext, {
// // //       maxRetries: 3,
// // //       agents: {
// // //         ui:          runner,
// // //         backend:     runner,
// // //         db:          runner,
// // //         integration: runner,
// // //         search:      runner,
// // //       },
// // //       validate: validateTask,
// // //     })

// // //     executor.on('task:result', ({ result }: { taskId: string; result: { files: Record<string, string>; summary: string } }) => {
// // //       allFiles = { ...allFiles, ...result.files }
// // //       if (result.summary) summaries.push(result.summary)
// // //     })

// // //     let executorFailed = false
// // //     try {
// // //       await executor.run()
// // //     } catch (err) {
// // //       executorFailed = true
// // //       Sentry.captureException(err, { extra: { context: 'TaskExecutor.run', projectId } })
// // //     }

// // //     const combinedSummary = summaries.map((s) => s.trim()).join('\n')
// // //     const isError = executorFailed || summaries.length === 0 || Object.keys(allFiles).length === 0

// // //     // ── Charge credits (durable step — Prisma only) ───────────────────────────
// // //     await step.run('charge-credits-v2', async () => {
// // //       if (!userId) return 'skipped: no userId'
// // //       try {
// // //         const { consumeCreditsV2 } = await import('@/lib/usage')
// // //         const taskCount   = taskGraphToRun.tasks.filter(t => t.type !== 'search').length
// // //         const searchCount = taskGraphToRun.tasks.filter(t => t.type === 'search').length
// // //         const fixCount    = executorFailed ? 0 : actualFixCount
// // //         await consumeCreditsV2({
// // //           userId,
// // //           breakdown: { tasks: taskCount, searches: searchCount, fixes: fixCount },
// // //           reason: 'generation',
// // //         })
// // //         return `charged: ${taskCount} tasks, ${searchCount} searches, ${fixCount} fixes`
// // //       } catch (e) {
// // //         Sentry.captureException(e, { extra: { context: 'charge-credits-v2', userId, projectId } })
// // //         console.error('[charge-credits-v2] failed:', e)
// // //         return `charge failed: ${e}`
// // //       }
// // //     })

// // //     // ── Review Agent ──────────────────────────────────────────────────────────
// // //     if (!isError && Object.keys(allFiles).length > 0) {
// // //       try {
// // //         const modifiedFiles = Object.keys(allFiles)
// // //         const fileList = modifiedFiles
// // //           .slice(0, 20)
// // //           .map((path) => {
// // //             const content   = allFiles[path] ?? ''
// // //             const truncated = content.length > 3000
// // //               ? content.slice(0, 3000) + '\n... (truncated)'
// // //               : content
// // //             return `<file path="${path}">\n${truncated}\n</file>`
// // //           })
// // //           .join('\n\n')

// // //         const reviewAgent = createAgent({
// // //           name:   'review-agent',
// // //           system: REVIEW_AGENT_PROMPT,
// // //           model:  (readerModel as unknown) as any,
// // //         })

// // //         const reviewInput = [
// // //           `<files_modified>\n${fileList}\n</files_modified>`,
// // //           `<task_summary>${combinedSummary || 'No summary available'}</task_summary>`,
// // //         ].join('\n\n')

// // //         const { output: reviewOutput } = await reviewAgent.run(reviewInput)

// // //         const reviewText = reviewOutput
// // //           .filter((m) => (m as any).type === 'text')
// // //           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
// // //           .join('')

// // //         const summaryMatch  = reviewText.match(/<task_summary>([\s\S]*?)<\/task_summary>/)
// // //         const reviewSummary = summaryMatch?.[1]?.trim() ?? ''
// // //         console.log(reviewSummary
// // //           ? `[review-agent] summary: ${reviewSummary.slice(0, 200)}`
// // //           : '[review-agent] completed (no summary emitted)',
// // //         )
// // //       } catch (err) {
// // //         Sentry.captureException(err, {
// // //           extra: { context: 'review-code', projectId, filesCount: Object.keys(allFiles).length },
// // //         })
// // //         console.error('[review-agent] failed (non-fatal):', err)
// // //       }
// // //     }

// // //     // ── Fragment title + assistant response ───────────────────────────────────
// // //     const fragmentTitleGenerator = createAgent({
// // //       name:   'fragment-title-generator',
// // //       system: FRAGMENT_TITLE_PROMPT,
// // //       model:  (readerModel as unknown) as any,
// // //     })
// // //     const responseGenerator = createAgent({
// // //       name:   'response-generator',
// // //       system: RESPONSE_PROMPT,
// // //       model:  (readerModel as unknown) as any,
// // //     })

// // //     const [titleResult, responseResult] = await Promise.all([
// // //       fragmentTitleGenerator.run(combinedSummary || 'No summary'),
// // //       responseGenerator.run(combinedSummary || 'No summary'),
// // //     ])

// // //     // ── Sandbox URL (durable step — no agents) ────────────────────────────────
// // //     const sandboxUrl = await step.run('get-sandbox-url', async () => {
// // //       const sandbox = await getSandbox(sandboxId)
// // //       const host    = sandbox.getHost(3000)
// // //       return `https://${host}`
// // //     })

// // //     // ── Persist result to DB (durable step — Prisma only) ─────────────────────
// // //     await step.run('save-result', async () => {
// // //       if (isError) {
// // //         return prisma.message.create({
// // //           data: {
// // //             projectId,
// // //             content: 'Something went wrong — please try again',
// // //             role:    'ASSISTANT',
// // //             type:    'ERROR',
// // //           },
// // //         })
// // //       }

// // //       const requiredIntegrationsRaw = combinedSummary.match(/<required_integrations>([\s\S]*?)<\/required_integrations>/)?.[1]
// // //       const requiredIntegrations: string[] = requiredIntegrationsRaw
// // //         ? requiredIntegrationsRaw.split(',').map((s) => s.trim()).filter(Boolean)
// // //         : []

// // //       return prisma.message.create({
// // //         data: {
// // //           projectId,
// // //           content:              parseAgentOutput(responseResult.output),
// // //           role:                 'ASSISTANT',
// // //           type:                 'RESULT',
// // //           requiredIntegrations: requiredIntegrations.length > 0 ? JSON.stringify(requiredIntegrations) : null,
// // //           fragment: {
// // //             create: {
// // //               sandboxUrl,
// // //               title: parseAgentOutput(titleResult.output),
// // //               files: allFiles,
// // //             },
// // //           },
// // //         },
// // //       })
// // //     })

// // //     // ── Architecture map update ───────────────────────────────────────────────
// // //     if (!isError) {
// // //       try {
// // //         const mapAgent = createAgent({
// // //           name:   'architecture-map-agent',
// // //           system: ARCHITECTURE_MAP_PROMPT,
// // //           model:  (readerModel as unknown) as any,
// // //         })
// // //         const fileList = Object.entries(allFiles)
// // //           .map(([path, content]) => `<file path="${path}">\n${content.slice(0, 2000)}\n</file>`)
// // //           .join('\n')

// // //         const { output: mapOutput } = await mapAgent.run(`<files>\n${fileList}\n</files>`)

// // //         const mapText = mapOutput
// // //           .filter((m) => (m as any).type === 'text')
// // //           .map((m: any) => (Array.isArray(m.content) ? m.content.map((c: any) => c.text).join('') : m.content))
// // //           .join('')
// // //         const cleanMap = mapText.replace(/```json|```/g, '').trim()

// // //         await step.run('update-architecture-map', async () => {
// // //           await prisma.project.update({ where: { id: projectId }, data: { contextDocument: cleanMap } })
// // //           return 'architecture map updated'
// // //         })
// // //       } catch (err) {
// // //         Sentry.captureException(err, { extra: { context: 'architecture-map', projectId } })
// // //       }
// // //     }

// // //     // ── Vector store upsert (durable step — no agents) ────────────────────────
// // //     await step.run('upsert-vector-store', async () => {
// // //       if (isError) return 'skipped: error state'
// // //       const project = await prisma.project.findUnique({
// // //         where: { id: projectId },
// // //         select: { supabaseUrl: true, supabaseAnonKey: true },
// // //       })
// // //       if (!project?.supabaseUrl || !project?.supabaseAnonKey) return 'skipped: no supabase'
// // //       try {
// // //         await upsertFilesToVectorStore({
// // //           projectId,
// // //           files:              allFiles,
// // //           supabaseUrl:        project.supabaseUrl,
// // //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey,
// // //         })
// // //         return `upserted ${Object.keys(allFiles).length} files`
// // //       } catch (e) {
// // //         Sentry.captureException(e, { extra: { context: 'upsert-vector-store', projectId } })
// // //         return `upsert failed: ${e}`
// // //       }
// // //     })

// // //     // ── Project memory archive (durable step — no agents) ─────────────────────
// // //     await step.run('archive-project-memory', async () => {
// // //       if (isError) return 'skipped: error state'
// // //       const project = await prisma.project.findUnique({
// // //         where: { id: projectId },
// // //         select: { supabaseUrl: true, supabaseAnonKey: true },
// // //       })
// // //       if (!project?.supabaseUrl) return 'skipped: no supabase'
// // //       try {
// // //         await archiveProjectMemory({
// // //           projectId,
// // //           userId,
// // //           userPrompt:         value,
// // //           aiSummary:          combinedSummary ?? '',
// // //           supabaseUrl:        project.supabaseUrl,
// // //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
// // //         })
// // //         return 'memory archived'
// // //       } catch (e) {
// // //         console.error('[archive-project-memory] failed:', e)
// // //         return `failed: ${e}`
// // //       }
// // //     })

// // //     return { url: sandboxUrl, files: allFiles, summary: combinedSummary }
// // //   },
// // // )

// // // // ─── Embed repo files after GitHub import ─────────────────────────────────────

// // // export const embedRepoFilesFunction = inngest.createFunction(
// // //   { id: 'embed-repo-files', retries: 2 },
// // //   { event: 'isotope/repo.imported' },
// // //   async ({ event, step }) => {
// // //     const { projectId, userId, owner, repo } = event.data as {
// // //       projectId: string
// // //       userId:    string
// // //       owner:     string
// // //       repo:      string
// // //     }

// // //     await step.run('mark-indexing-start', async () => {
// // //       await prisma.project.update({
// // //         where: { id: projectId },
// // //         data:  { isIndexing: true },
// // //       })
// // //     })

// // //     let files: Record<string, string> = {}
// // //     let processedFiles: { files: Record<string, string>; transformedCount: number; skippedCount: number } | undefined

// // //     try {
// // //       files = await step.run('fetch-repo-files', async () => {
// // //         const { getGitHubToken } = await import('@/lib/github-token')
// // //         const { getRepoFiles }   = await import('@/lib/github')
// // //         const tokenRecord = await getGitHubToken(userId)
// // //         if (!tokenRecord?.accessToken) throw new Error('No GitHub token found')
// // //         return getRepoFiles({ accessToken: tokenRecord.accessToken, owner, repo })
// // //       })

// // //       const project = await step.run('get-project', async () =>
// // //         prisma.project.findUnique({
// // //           where:  { id: projectId },
// // //           select: { supabaseUrl: true, supabaseAnonKey: true, contextDocument: true },
// // //         }),
// // //       )

// // //       if (!project?.supabaseUrl) {
// // //         await prisma.project.update({ where: { id: projectId }, data: { isIndexing: false } })
// // //         return 'skipped: no supabase configured'
// // //       }

// // //       processedFiles = await step.run('transform-framework-files', async () => {
// // //         try {
// // //           const analysis  = JSON.parse(project.contextDocument ?? '{}')
// // //           const framework = (analysis.framework ?? 'nextjs') as string

// // //           if (framework === 'nextjs') {
// // //             return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
// // //           }

// // //           console.log(`[embed-repo] Transforming ${Object.keys(files).length} files from ${framework} → Next.js`)
// // //           const { transformToNextJs } = await import('@/lib/ai-transformer')
// // //           const result = await transformToNextJs(files, framework)
// // //           console.log(`[embed-repo] Transformed ${result.transformedCount} files, kept ${result.skippedCount} as-is`)
// // //           return result
// // //         } catch (err) {
// // //           console.error('[embed-repo] transform-framework-files failed, using originals:', err)
// // //           return { files, transformedCount: 0, skippedCount: Object.keys(files).length }
// // //         }
// // //       })

// // //       await step.run('upsert-repo-files', async () => {
// // //         await upsertFilesToVectorStore({
// // //           projectId,
// // //           files:              processedFiles!.files,
// // //           supabaseUrl:        project.supabaseUrl!,
// // //           supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? project.supabaseAnonKey ?? '',
// // //         })
// // //         return `embedded ${Object.keys(processedFiles!.files).length} files (${processedFiles!.transformedCount} converted)`
// // //       })
// // //     } finally {
// // //       await step.run('mark-indexing-done', async () => {
// // //         await prisma.project.update({
// // //           where: { id: projectId },
// // //           data:  { isIndexing: false },
// // //         })
// // //       })
// // //     }

// // //     return { projectId, fileCount: Object.keys(processedFiles?.files ?? files).length }
// // //   },
// // // )

// // // // ─── Daily free-credit top-up cron ────────────────────────────────────────────

// // // export const freeCreditsResetFunction = inngest.createFunction(
// // //   { id: 'free-credits-reset' },
// // //   { cron: '0 0 * * *' },
// // //   async ({ step }) => {
// // //     const count = await step.run('reset-free-credits', async () => resetFreeCredits())
// // //     return { message: `Reset credits for ${count} free user(s)` }
// // //   },
// // // )

// // // // ─── Vercel URL refresh after GitHub merge ────────────────────────────────────

// // // export const refreshVercelUrlFunction = inngest.createFunction(
// // //   { id: 'refresh-vercel-url' },
// // //   { event: 'github/vercel-url-refresh' },
// // //   async ({ event, step }) => {
// // //     const { projectId, vercelProjectId } = event.data as {
// // //       projectId:       string
// // //       vercelProjectId: string
// // //     }

// // //     await step.sleep('wait-for-vercel-deploy', '30s')

// // //     await step.run('fetch-and-save-url', async () => {
// // //       const { refreshVercelUrl } = await import('@/app/api/github/webhook/route')
// // //       await refreshVercelUrl(projectId, vercelProjectId)
// // //     })

// // //     return { projectId }
// // //   },
// // // )

// // // // ─── Stale GenerationEvent cleanup cron ───────────────────────────────────────

// // // export const purgeGenerationEventsFunction = inngest.createFunction(
// // //   { id: 'purge-generation-events' },
// // //   { cron: '0 2 * * *' },
// // //   async ({ step }) => {
// // //     const deleted = await step.run('purge-old-events', async () => {
// // //       const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
// // //       const result = await prisma.generationEvent.deleteMany({
// // //         where: { createdAt: { lt: cutoff } },
// // //       })
// // //       return result.count
// // //     })
// // //     return { message: `Purged ${deleted} stale GenerationEvent rows` }
// // //   },
// // // )


