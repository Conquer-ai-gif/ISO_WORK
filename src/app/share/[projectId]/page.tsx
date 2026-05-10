import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { ForkButton } from './fork-button';

interface Props { params: Promise<{ projectId: string }> }

export default async function SharePage({ params }: Props) {
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId, isPublic: true },
    include: {
      messages: {
        where: { role: 'ASSISTANT', type: 'RESULT' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { fragment: true },
      },
    },
  });

  if (!project) notFound();

  const fragment = project.messages[0]?.fragment;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b flex-shrink-0">
        <Image src="/logo.svg" alt="Isotope" width={22} height={22} />
        <span className="font-semibold text-sm truncate">{project.name}</span>
        <span className="text-muted-foreground text-xs hidden sm:block">· Shared via Isotope</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Fork button — client component that handles auth */}
          <ForkButton projectId={projectId} projectName={project.name} />

          {fragment?.deployUrl && (
            <a
              href={fragment.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              View live →
            </a>
          )}
        </div>
      </header>

      {/* Preview */}
      {fragment ? (
        <iframe
          className="flex-1 w-full border-none"
          src={`/api/preview/${fragment.id}`}
          sandbox="allow-forms allow-scripts allow-same-origin allow-modals"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No preview available for this project.
        </div>
      )}

      {/* Footer */}
      <div className="border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground flex-shrink-0">
        <span>Built with Isotope AI</span>
        <a href="/" className="hover:text-foreground transition-colors">Build your own →</a>
      </div>
    </div>
  );
}
