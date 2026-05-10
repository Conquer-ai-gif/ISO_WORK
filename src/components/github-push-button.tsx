'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GithubIcon,
  LinkIcon,
  UnlinkIcon,
  PlusIcon,
  FolderIcon,
} from 'lucide-react';

import { useTRPC } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Fragment as PrismaFragment } from '@/generated/prisma/client';

interface Props {
  projectId: string;
  activeFragment: PrismaFragment | null;
  repoOwner?: string | null;
  repoName?: string | null;
}

export const GitHubPushButton = ({ projectId, activeFragment, repoOwner, repoName }: Props) => {
  const { user } = useUser();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [bindOpen, setBindOpen] = useState(false);

  const isGitHubConnected = user?.externalAccounts?.some((a) => a.provider === 'github');
  const ghUsername = user?.externalAccounts?.find((a) => a.provider === 'github')?.username ?? '';
  const isBound = !!(repoOwner && repoName);

  const connectGitHub = () =>
    user?.createExternalAccount({
      strategy: 'oauth_github',
      redirectUrl: window.location.href,
    });

  // Bind repo — creates it if needed, pushes existing fragment, registers webhook
  const bind = useMutation(
    trpc.projects.bindRepo.mutationOptions({
      onSuccess: () => {
        const msg = createRepo
          ? `Created & bound "${repo}" — first build pushed, auto-sync enabled`
          : `Bound to "${repo}" — first build pushed, auto-sync enabled`;
        toast.success(msg);
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }));
        setBindOpen(false);
        setRepo('');
        setCreateRepo(true);
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // Unbind repo — removes webhook
  const unbind = useMutation(
    trpc.projects.unbindRepo.mutationOptions({
      onSuccess: () => {
        toast.success('Repo unbound — auto-sync disabled');
        queryClient.invalidateQueries(trpc.projects.getOne.queryOptions({ id: projectId }));
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!isGitHubConnected) {
    return (
      <Button size="sm" variant="outline" onClick={connectGitHub}>
        <GithubIcon className="size-4" />
        Connect GitHub
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-x-1">

      {/* Bind / unbind for auto two-way sync */}
      {isBound ? (
        <Button
          size="sm"
          variant="outline"
          disabled={unbind.isPending}
          onClick={() => unbind.mutate({ projectId })}
          title={`Auto-sync active: ${repoOwner}/${repoName} — click to unbind`}
        >
          <UnlinkIcon className="size-4" />
          {repoName}
        </Button>
      ) : (
        <Dialog open={bindOpen} onOpenChange={setBindOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <LinkIcon className="size-4" />
              Bind repo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bind a GitHub repo</DialogTitle>
            </DialogHeader>

            {/* Create new vs use existing toggle */}
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <Switch
                id="create-repo"
                checked={createRepo}
                onCheckedChange={setCreateRepo}
              />
              <div>
                <Label htmlFor="create-repo" className="text-sm font-medium cursor-pointer">
                  {createRepo ? (
                    <span className="flex items-center gap-1.5">
                      <PlusIcon className="size-3.5" /> Create a new repo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <FolderIcon className="size-3.5" /> Use an existing repo
                    </span>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {createRepo
                    ? 'Isotope will create a private repo on your GitHub account'
                    : 'The repo must already exist on GitHub'}
                </p>
              </div>
            </div>

            <Input
              placeholder={createRepo ? 'my-new-repo-name' : 'existing-repo-name'}
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && repo) {
                  bind.mutate({ projectId, owner: ghUsername, repo, createRepo });
                }
              }}
            />

            {repo && (
              <p className="text-xs text-muted-foreground -mt-2">
                {createRepo ? 'Will create' : 'Will bind to'}{' '}
                <span className="font-mono font-medium">
                  github.com/{ghUsername}/{repo}
                </span>
              </p>
            )}

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">What happens when you bind:</p>
              <p>✓ Your current generated code is pushed immediately</p>
              <p>✓ Every future AI generation auto-pushes to this repo</p>
              <p>✓ Commits you push to GitHub sync back into Isotope</p>
              <p>✓ Conflicts are surfaced in the UI for you to resolve</p>
              {process.env.NEXT_PUBLIC_VERCEL_ENABLED === 'true' && (
                <p>✓ A Vercel project is created and linked — goes live automatically on every push</p>
              )}
            </div>

            <Button
              disabled={!repo || bind.isPending}
              onClick={() => bind.mutate({ projectId, owner: ghUsername, repo, createRepo })}
            >
              {bind.isPending
                ? createRepo ? 'Creating & binding...' : 'Binding...'
                : createRepo ? 'Create repo & enable sync' : 'Bind & enable sync'}
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Conflict banner — shown above the chat when there are unresolved sync conflicts
export const ConflictBanner = ({ projectId }: { projectId: string }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: conflicts } = useQuery(trpc.projects.getConflicts.queryOptions({ projectId }));

  const resolve = useMutation(
    trpc.projects.resolveConflict.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.projects.getConflicts.queryOptions({ projectId })),
      onError: (e) => toast.error(e.message),
    }),
  );

  if (!conflicts || conflicts.length === 0) return null;

  return (
    <div className="border-b bg-yellow-50 dark:bg-yellow-950/30 px-3 py-2 flex-shrink-0">
      <div className="flex items-center gap-2 text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-2">
        <AlertTriangleIcon className="size-3.5" />
        {conflicts.length} sync conflict{conflicts.length > 1 ? 's' : ''} — choose which version to keep
      </div>
      <div className="space-y-1">
        {conflicts.map((conflict) => (
          <div
            key={conflict.id}
            className="flex items-center justify-between gap-2 rounded bg-white dark:bg-black/20 border px-2 py-1"
          >
            <span className="text-xs font-mono text-muted-foreground truncate">
              {conflict.filePath}
            </span>
            <div className="flex gap-1 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: conflict.id, resolvedBy: 'isotope' })}
              >
                Keep Isotope
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: conflict.id, resolvedBy: 'github' })}
              >
                Keep GitHub
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
