import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { inngest } from '@/inngest/client'
import { getGitHubToken } from '@/lib/github-token'
import { getRepoFiles } from '@/lib/github'
import { getLatestDeployUrl } from '@/lib/vercel'

function verifySignature(secret: string, body: string, sig: string) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

// Merge changed files from GitHub into the latest Fragment in Prisma.
// This is the core of the two-way sync — sandbox is always restored from Prisma,
// so updating Fragment.files here is all that's needed to keep the sandbox in sync.
async function syncFilesToFragment(
  projectId: string,
  incomingFiles: Record<string, string>,
) {
  const latestFragment = await prisma.fragment.findFirst({
    where: { message: { projectId } },
    orderBy: { createdAt: 'desc' },
  })

  if (!latestFragment) return

  const existingFiles = (latestFragment.files ?? {}) as Record<string, string>

  await prisma.fragment.update({
    where: { id: latestFragment.id },
    data: { files: { ...existingFiles, ...incomingFiles } },
  })
}

// Refresh Vercel deploy URL after a merge lands on main.
// Called via Inngest after a short delay — NOT inline in the webhook handler.
// The webhook handler must respond in <5s or GitHub will retry.
export async function refreshVercelUrl(projectId: string, vercelProjectId: string) {
  try {
    const deployUrl = await getLatestDeployUrl(vercelProjectId)
    if (!deployUrl) return

    await prisma.project.update({
      where: { id: projectId },
      data: { vercelDeployUrl: deployUrl },
    })
  } catch (e) {
    console.error('[github-webhook] Failed to refresh Vercel URL:', e)
  }
}

    // Also update the latest fragment's deployUrl
    const latestMsg = await prisma.message.findFirst({
      where: { projectId, role: 'ASSISTANT', type: 'RESULT' },
      orderBy: { createdAt: 'desc' },
      include: { fragment: true },
    })
    if (latestMsg?.fragment) {
      await prisma.fragment.update({
        where: { id: latestMsg.fragment.id },
        data: { deployUrl },
      })
    }
  } catch (e) {
    console.error('[webhook] Vercel URL refresh failed:', e)
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('x-hub-signature-256') ?? ''
  const githubEvent = req.headers.get('x-github-event')

  // Only handle push and pull_request events
  if (githubEvent !== 'push' && githubEvent !== 'pull_request') {
    return new Response('Ignored', { status: 200 })
  }

  const payload = JSON.parse(body)
  const repoOwner = payload.repository?.owner?.login
  const repoName = payload.repository?.name

  if (!repoOwner || !repoName) return new Response('Bad payload', { status: 400 })

  const project = await prisma.project.findFirst({
    where: { repoOwner, repoName },
    include: {
      messages: {
        where: { role: 'ASSISTANT', type: 'RESULT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { fragment: true },
      },
    },
  })

  if (!project) return new Response('No bound project', { status: 200 })

  // Verify per-project webhook secret
  const secret = project.repoWebhookSecret
  if (!secret || !verifySignature(secret, body, sig)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const githubToken = await getGitHubToken(project.userId)
  if (!githubToken) return new Response('No token', { status: 200 })

  // ─────────────────────────────────────────────────────────────────────────
  // DIRECTION: GitHub → Isotope (inbound)
  // Developer pushes directly to main outside Isotope.
  // Fetch changed files → update Fragment.files in Prisma.
  // Sandbox picks them up automatically on next generation via restoreFilesIntoSandbox.
  // ─────────────────────────────────────────────────────────────────────────
  if (githubEvent === 'push') {
    const pushedBranch = (payload.ref as string)?.replace('refs/heads/', '')
    const defaultBranch = payload.repository?.default_branch ?? 'main'

    // Only process pushes to the default branch (main/master)
    if (pushedBranch !== defaultBranch) {
      return new Response('Ignored — not default branch', { status: 200 })
    }

    // Skip if this push came from an isotope/ branch merge
    // (that is handled by the pull_request closed handler below)
    const headCommitMessage: string = payload.head_commit?.message ?? ''
    if (headCommitMessage.includes('Merge') && payload.commits?.length === 0) {
      return new Response('Ignored — merge commit handled by PR event', { status: 200 })
    }

    // Collect only the changed file paths from commit payloads
    const changedPaths = new Set<string>()
    for (const commit of payload.commits ?? []) {
      ;[...(commit.added ?? []), ...(commit.modified ?? [])].forEach((p: string) =>
        changedPaths.add(p),
      )
    }

    if (changedPaths.size === 0) return new Response('No files changed', { status: 200 })

    try {
      const allFiles = await getRepoFiles({
        accessToken: githubToken.accessToken,
        owner: repoOwner,
        repo: repoName,
        branch: defaultBranch,
      })

      const incomingFiles: Record<string, string> = {}
      for (const p of changedPaths) {
        if (allFiles[p] !== undefined) incomingFiles[p] = allFiles[p]
      }

      if (Object.keys(incomingFiles).length > 0) {
        await syncFilesToFragment(project.id, incomingFiles)
      }
    } catch (e) {
      console.error('[webhook] Failed to fetch files for push sync:', e)
      return new Response('Failed to fetch files', { status: 500 })
    }

    // Handle sync conflicts (file exists in both Isotope and GitHub with different content)
    const latestFragment = project.messages[0]?.fragment
    if (latestFragment) {
      const isotopeFiles = (latestFragment.files ?? {}) as Record<string, string>
      const conflicts: { path: string; isotope: string; github: string }[] = []

      for (const [path, githubContent] of Object.entries(
        await getRepoFiles({
          accessToken: githubToken.accessToken,
          owner: repoOwner,
          repo: repoName,
        }),
      )) {
        const isotopeContent = isotopeFiles[path]
        if (isotopeContent && isotopeContent !== githubContent) {
          conflicts.push({ path, isotope: isotopeContent, github: githubContent })
        }
      }

      if (conflicts.length > 0) {
        await prisma.syncConflict.createMany({
          data: conflicts.map((c) => ({
            projectId: project.id,
            filePath: c.path,
            isotopeContent: c.isotope,
            githubContent: c.github,
          })),
          skipDuplicates: true,
        })
      }
    }

    await prisma.project.update({ where: { id: project.id }, data: { lastSyncedAt: new Date() } })
    return new Response('OK', { status: 200 })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DIRECTION: Isotope → GitHub (outbound, post-merge)
  // Platform auto-merged the isotope/ PR.
  // On merge: update Fragment.files in Prisma + refresh Vercel URL.
  // ─────────────────────────────────────────────────────────────────────────
  if (githubEvent === 'pull_request') {
    const action: string = payload.action
    const merged: boolean = payload.pull_request?.merged === true
    const branchName: string = payload.pull_request?.head?.ref ?? ''
    const defaultBranch: string = payload.repository?.default_branch ?? 'main'

    // Only handle merged isotope/ PRs
    if (action !== 'closed' || !merged || !branchName.startsWith('isotope/')) {
      return new Response('Ignored', { status: 200 })
    }

    try {
      // Fetch the full file tree from main now that the merge is complete
      const mergedFiles = await getRepoFiles({
        accessToken: githubToken.accessToken,
        owner: repoOwner,
        repo: repoName,
        branch: defaultBranch,
      })

      // Update Fragment.files — this is the single source of truth for the sandbox
      const latestFragment = project.messages[0]?.fragment
      if (latestFragment) {
        await prisma.fragment.update({
          where: { id: latestFragment.id },
          data: {
            files: mergedFiles,
            branchMerged: true,
          },
        })
      }

      // Mark project as synced
      await prisma.project.update({
        where: { id: project.id },
        data: { lastSyncedAt: new Date() },
      })

      // Trigger Vercel URL refresh via Inngest — adds a 30s delay so Vercel
      // has time to start the deploy. Never block the webhook response.
      if (project.vercelProjectId) {
        await inngest.send({
          name: 'github/vercel-url-refresh',
          data: { projectId: project.id, vercelProjectId: project.vercelProjectId },
        })
      }
    } catch (e) {
      console.error('[webhook] Failed to handle PR merge:', e)
      return new Response('Failed to process merge', { status: 500 })
    }

    return new Response('OK', { status: 200 })
  }

  return new Response('Ignored', { status: 200 })
}
