import * as Sentry from '@sentry/nextjs'
import { TASK_GRAPH_PLAN_PROMPT } from '@/prompt'
import { retryValidatePlan } from './validation'
import { getSandbox } from '@/sandbox/sandboxManager'
import { openRouterModel } from '@/lib/openrouter'
import { PLAN_FEATURES } from '@/lib/usage'
import type { TaskGraph } from '@/execution/taskGraph'
import type { Plan } from '@/generated/prisma'

export interface PlannerOptions {
  sandboxId:   string
  userRequest: string
  userPlan?:   string  // used to inject correct task limit into the prompt
}

// Max files to read raw — beyond this we rely on the architecture map
const MAX_FILES_FULL_READ = 30
// Max chars per file — keeps each file from dominating the context
const MAX_CHARS_PER_FILE  = 4000  // reduced from 8000 to fit more files safely
// Max total chars across all files — ~24K tokens, leaves room for prompt + response
const MAX_TOTAL_CHARS     = 96000

async function scanExistingFiles(sandboxId: string): Promise<string> {
  try {
    const sandbox = await getSandbox(sandboxId)

    const findResult = await sandbox.commands.run(
      'find /home/user -type f ' +
        '! -path "*/node_modules/*" ' +
        '! -path "*/.next/*" ' +
        '! -path "*/.git/*" ' +
        '! -name "*.lock" ' +
        '! -name "*.ico" ' +
        '! -name "*.png" ' +
        '! -name "*.jpg" ' +
        '! -name "*.svg" ' +
        '| sort',
      { timeout: 10000 },
    )

    const filePaths = findResult.stdout
      .split('\n')
      .map((p: string) => p.trim())
      .filter(Boolean)

    if (filePaths.length === 0) return '<existing_files>none</existing_files>'

    // If the project is large, only read the most important files
    // to avoid overflowing Qwen's ~32K context window
    const isLargeProject = filePaths.length > MAX_FILES_FULL_READ
    const pathsToRead = isLargeProject
      ? filePaths
          .filter((p: string) =>
            // Prioritise: pages, layouts, routes, key config files
            p.includes('page.tsx') ||
            p.includes('layout.tsx') ||
            p.includes('route.ts') ||
            p.includes('schema.prisma') ||
            p.includes('package.json') ||
            p.includes('tsconfig.json') ||
            p.endsWith('middleware.ts'),
          )
          .slice(0, MAX_FILES_FULL_READ)
      : filePaths

    const fileContents: string[] = []
    let totalChars = 0

    for (const filePath of pathsToRead) {
      if (totalChars >= MAX_TOTAL_CHARS) {
        fileContents.push('<note>Additional files omitted — context limit reached. Architecture map available in <architecture_map>.</note>')
        break
      }
      try {
        const content = await sandbox.files.read(filePath)
        const truncated = content.length > MAX_CHARS_PER_FILE
          ? content.slice(0, MAX_CHARS_PER_FILE) + '\n... (truncated)'
          : content
        fileContents.push(`<file path="${filePath}">\n${truncated}\n</file>`)
        totalChars += truncated.length
      } catch {
        // Unreadable — skip
      }
    }

    if (isLargeProject) {
      fileContents.unshift(
        `<note>Large project (${filePaths.length} files total). Showing ${pathsToRead.length} key files. Full structure available in <architecture_map>.</note>`,
      )
    }

    return `<existing_files>\n${fileContents.join('\n\n')}\n</existing_files>`
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'scanExistingFiles', sandboxId } })
    return '<existing_files>error reading files</existing_files>'
  }
}

export async function generateTaskGraph(options: PlannerOptions): Promise<TaskGraph> {
  const { sandboxId, userRequest, userPlan = 'free' } = options

  const planFeatures = PLAN_FEATURES[userPlan as Plan] ?? PLAN_FEATURES.free
  const maxTasks     = planFeatures.maxTasks

  // For large projects use the architecture map to avoid context overflow.
  // scanExistingFiles reads ALL files at 8000 chars each — safe for small projects
  // but easily exceeds Qwen's 32K context on projects with 20+ files.
  const existingFilesContext = await scanExistingFiles(sandboxId)

  // Inject the user's actual task limit so the planner doesn't generate
  // 15 tasks for a free user who can only run 3.
  // Using a regex so minor whitespace/punctuation edits to prompt.ts don't break this.
  const planPromptWithLimit = TASK_GRAPH_PLAN_PROMPT.replace(
    /Keep total tasks between \d+ and \d+\.?/,
    `Keep total tasks between 1 and ${maxTasks}. The user's plan allows a maximum of ${maxTasks} task${maxTasks === 1 ? '' : 's'} — do not exceed this.`,
  )

  const generateRaw = async (): Promise<string> => {
    const planInput = `${existingFilesContext}\n\n<user_request>\n${userRequest}\n</user_request>`
    const messages = [
      { role: 'system', content: planPromptWithLimit },
      { role: 'user', content: planInput },
    ]
    return await openRouterModel.run(messages)
  }

  return retryValidatePlan(generateRaw)
}
