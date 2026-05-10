// Supabase Management API helpers
// Docs: https://supabase.com/docs/reference/api/introduction
// Used to auto-provision a Supabase project for each Isotope project.
// The generated app gets its own isolated Supabase project with auth + DB.

const SUPABASE_MGMT_API = 'https://api.supabase.com/v1';

function mgmtHeaders() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function createSupabaseProject({
  name,
  organizationId,
  region = 'us-east-1',
  plan = 'free',
}: {
  name: string;
  organizationId: string;
  region?: string;
  plan?: string;
}): Promise<{ id: string; url: string; anonKey: string }> {
  // Create the project
  const res = await fetch(`${SUPABASE_MGMT_API}/projects`, {
    method: 'POST',
    headers: mgmtHeaders(),
    body: JSON.stringify({
      name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40),
      organization_id: organizationId,
      region,
      plan,
      db_pass: crypto.randomUUID().replace(/-/g, ''),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? `Failed to create Supabase project: ${res.statusText}`);
  }

  const project = await res.json();

  // Poll until project is ready (can take ~30s)
  const projectUrl = `https://${project.id}.supabase.co`;
  let attempts = 0;
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const healthRes = await fetch(`${projectUrl}/rest/v1/`, {
        headers: { apikey: 'placeholder' },
      });
      if (healthRes.status !== 503) break;
    } catch {}
    attempts++;
  }

  // Fetch the anon key
  const keysRes = await fetch(`${SUPABASE_MGMT_API}/projects/${project.id}/api-keys`, {
    headers: mgmtHeaders(),
  });

  if (!keysRes.ok) throw new Error('Failed to fetch Supabase API keys');

  const keys = await keysRes.json();
  const anonKey = keys.find((k: any) => k.name === 'anon')?.api_key ?? '';

  return { id: project.id, url: projectUrl, anonKey };
}

export async function deleteSupabaseProject(projectId: string): Promise<void> {
  await fetch(`${SUPABASE_MGMT_API}/projects/${projectId}`, {
    method: 'DELETE',
    headers: mgmtHeaders(),
  });
}

export async function getSupabaseOrganizationId(): Promise<string> {
  const res = await fetch(`${SUPABASE_MGMT_API}/organizations`, {
    headers: mgmtHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch Supabase organizations');
  const orgs = await res.json();
  if (!orgs.length) throw new Error('No Supabase organizations found');
  return orgs[0].id;
}
