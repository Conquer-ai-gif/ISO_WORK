import { Sandbox } from '@e2b/code-interpreter'
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/db'
import { SANDBOX_TIMEOUT } from '@/inngest/types'
import { makeEvent, type EventEmitterFn } from '@/streaming/events'

const TEMPLATE_ID = 'isotope-git'

export interface SandboxManager {
  sandboxId: string
  sandbox: Sandbox
}

async function connectOrCreate(existingId: string | null): Promise<Sandbox> {
  if (existingId) {
    try {
      const sandbox = await Sandbox.connect(existingId)
      await sandbox.setTimeout(SANDBOX_TIMEOUT)
      return sandbox
    } catch {
      // Sandbox expired or unreachable — fall through to create
    }
  }

  const sandbox = await Sandbox.create(TEMPLATE_ID)
  await sandbox.setTimeout(SANDBOX_TIMEOUT)
  return sandbox
}

export async function getOrCreateSandbox(projectId: string): Promise<SandboxManager> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sandboxId: true },
    })

    const sandbox = await connectOrCreate(project?.sandboxId ?? null)
    const sandboxId = sandbox.sandboxId

    if (project?.sandboxId !== sandboxId) {
      await prisma.project.update({
        where: { id: projectId },
        data: { sandboxId },
      })
    }

    return { sandboxId, sandbox }
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'getOrCreateSandbox', projectId } })
    throw err
  }
}

export async function getSandbox(sandboxId: string): Promise<Sandbox> {
  const sandbox = await Sandbox.connect(sandboxId)
  await sandbox.setTimeout(SANDBOX_TIMEOUT)
  return sandbox
}

export async function restoreFilesIntoSandbox(
  projectId: string,
  sandboxId: string,
  emit?: EventEmitterFn,
): Promise<{ restoredCount: number; files: Record<string, string> }> {
  // ── Priority 1: restore from the last Isotope-generated fragment ─────────
  const lastFragment = await prisma.fragment.findFirst({
    where: { message: { projectId } },
    orderBy: { createdAt: 'desc' },
  })

  if (lastFragment?.files) {
    const files = lastFragment.files as Record<string, string>
    const entries = Object.entries(files).filter(([, v]) => typeof v === 'string')
    const fileMap = Object.fromEntries(entries)

    const description = `Restoring ${entries.length} files from last generation…`
    emit?.(makeEvent('log', { data: { description, message: description } }))

    const sandbox = await getSandbox(sandboxId)
    for (const [path, content] of entries) {
      await sandbox.files.write(path, content)
    }

    return { restoredCount: entries.length, files: fileMap }
  }

  // ── Priority 2: no prior generation — seed from connected GitHub repo ────
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { repoOwner: true, repoName: true, userId: true },
    })

    if (!project?.repoOwner || !project?.repoName) {
      return { restoredCount: 0, files: {} }
    }

    const { getGitHubToken } = await import('@/lib/github-token')
    const { getRepoFiles } = await import('@/lib/github')

    const tokenRecord = await getGitHubToken(project.userId)
    if (!tokenRecord?.accessToken) return { restoredCount: 0, files: {} }

    const description = `Seeding from GitHub — ${project.repoOwner}/${project.repoName}…`
    emit?.(makeEvent('log', { data: { description, message: description } }))

    const repoFiles = await getRepoFiles({
      accessToken: tokenRecord.accessToken,
      owner: project.repoOwner,
      repo: project.repoName,
    })

    const entries = Object.entries(repoFiles).filter(([, v]) => typeof v === 'string')
    if (entries.length === 0) return { restoredCount: 0, files: {} }

    const sandbox = await getSandbox(sandboxId)
    for (const [path, content] of entries) {
      await sandbox.files.write(path, content)
    }

    return { restoredCount: entries.length, files: repoFiles }
  } catch (err) {
    Sentry.captureException(err, { extra: { context: 'restoreFilesIntoSandbox-github-seed', projectId } })
    return { restoredCount: 0, files: {} }
  }
}

/**
 * Run TypeScript type-checking inside the sandbox.
 *
 * When `files` is provided, only errors from those paths are returned.
 * When `files` is empty, all TypeScript errors are returned.
 *
 * Returns an empty string when there are no errors.
 */
export async function runTsc(sandboxId: string, files: string[] = []): Promise<string> {
  try {
    const sandbox = await getSandbox(sandboxId)

    const result = await sandbox.commands.run(
      'npx tsc --noEmit 2>&1 | head -60 || true',
      { timeout: 30000 },
    )

    const output = result.stdout.trim()
    if (!output) return ''

    if (files.length === 0) return output

    // TypeScript error lines start with the file path, e.g.:
    //   src/components/foo.tsx(10,5): error TS2339: Property 'x' does not exist
    // Keep only lines that reference one of the task's files.
    const relevant = output
      .split('\n')
      .filter((line) => files.some((f) => line.includes(f)))
      .join('\n')
      .trim()

    return relevant
  } catch {
    return ''
  }
}
