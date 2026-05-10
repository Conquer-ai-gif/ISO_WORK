// Vercel API helpers
// Docs: https://vercel.com/docs/rest-api

const VERCEL_API = 'https://api.vercel.com';

function vercelHeaders() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ── Create a Vercel project linked to a GitHub repo ──────────────────────────
// This is the one-time setup. After this, every push to the GitHub repo
// triggers a Vercel deployment automatically — no further API calls needed.
export async function createVercelProject({
  name,
  githubOwner,
  githubRepo,
  framework = 'nextjs',
}: {
  name: string;
  githubOwner: string;
  githubRepo: string;
  framework?: string;
}): Promise<{ projectId: string; deployUrl: string }> {
  const res = await fetch(`${VERCEL_API}/v9/projects`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({
      name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 52),
      framework,
      gitRepository: {
        type: 'github',
        repo: `${githubOwner}/${githubRepo}`,
      },
      // Build settings for Next.js
      buildCommand: 'npm run build',
      outputDirectory: '.next',
      installCommand: 'npm install',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message ?? 'Failed to create Vercel project');
  }

  const project = await res.json();

  // Trigger the first deployment so the live URL is available immediately
  const deployRes = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({
      name: project.name,
      gitSource: {
        type: 'github',
        ref: 'main',
        repoId: project.link?.repoId,
      },
      projectId: project.id,
      target: 'production',
    }),
  });

  let deployUrl = `https://${project.name}.vercel.app`;

  if (deployRes.ok) {
    const deploy = await deployRes.json();
    deployUrl = `https://${deploy.url ?? project.name + '.vercel.app'}`;
  }

  return { projectId: project.id, deployUrl };
}

// ── Get the latest production deployment URL for a project ───────────────────
export async function getLatestDeployUrl(vercelProjectId: string): Promise<string | null> {
  const res = await fetch(
    `${VERCEL_API}/v6/deployments?projectId=${vercelProjectId}&target=production&limit=1`,
    { headers: vercelHeaders() },
  );

  if (!res.ok) return null;

  const data = await res.json();
  const latest = data.deployments?.[0];
  if (!latest) return null;

  return `https://${latest.url}`;
}

// ── Delete a Vercel project (called on unbind) ───────────────────────────────
export async function deleteVercelProject(vercelProjectId: string): Promise<void> {
  await fetch(`${VERCEL_API}/v9/projects/${vercelProjectId}`, {
    method: 'DELETE',
    headers: vercelHeaders(),
  });
}

// ── Check if a Vercel project name is available ──────────────────────────────
export async function vercelProjectExists(name: string): Promise<boolean> {
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 52);
  const res = await fetch(`${VERCEL_API}/v9/projects/${safeName}`, {
    headers: vercelHeaders(),
  });
  return res.ok;
}

// Typed Vercel domain verification record
interface VercelVerification {
  type:   string
  domain: string
  value:  string
  reason: string
}

// ── Add a custom domain to a Vercel project ──────────────────────────────────
export async function addCustomDomain(
  vercelProjectId: string,
  domain: string,
): Promise<{ name: string; verified: boolean; verification: VercelVerification[] }> {
  const res = await fetch(`${VERCEL_API}/v10/projects/${vercelProjectId}/domains`, {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify({ name: domain }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Failed to add domain: ${res.statusText}`);
  }

  return res.json();
}

// ── Remove a custom domain from a Vercel project ─────────────────────────────
export async function removeCustomDomain(
  vercelProjectId: string,
  domain: string,
): Promise<void> {
  await fetch(`${VERCEL_API}/v9/projects/${vercelProjectId}/domains/${domain}`, {
    method: 'DELETE',
    headers: vercelHeaders(),
  });
}

// ── Get domain verification status ───────────────────────────────────────────
export async function getDomainStatus(
  vercelProjectId: string,
  domain: string,
): Promise<{ verified: boolean; verification: VercelVerification[] } | null> {
  const res = await fetch(
    `${VERCEL_API}/v9/projects/${vercelProjectId}/domains/${domain}`,
    { headers: vercelHeaders() },
  );
  if (!res.ok) return null;
  return res.json();
}
