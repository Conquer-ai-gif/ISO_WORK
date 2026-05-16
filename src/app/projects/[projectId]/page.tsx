import { ProjectView } from "@/modules/projects/ui/views/project-view";
import { getQueryClient, trpc } from "@/trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { ProjectErrorBoundaryWrapper } from "./error-boundary-wrapper";

interface Props {
  params: Promise<{
    projectId: string;
  }>;
}

function ProjectLoadingFallback() {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Loading project…</p>
      </div>
    </div>
  );
}

const Page = async ({ params }: Props) => {
  const { projectId } = await params;

  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(trpc.messages.getMany.queryOptions({ projectId })),
    queryClient.prefetchQuery(trpc.projects.getOne.queryOptions({ id: projectId })),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectErrorBoundaryWrapper>
        <Suspense fallback={<ProjectLoadingFallback />}>
          <ProjectView projectId={projectId} />
        </Suspense>
      </ProjectErrorBoundaryWrapper>
    </HydrationBoundary>
  );
};

export default Page;
