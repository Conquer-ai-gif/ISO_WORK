'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { MessagesContainer } from '../components/messages-container'
import { Suspense, useState } from 'react'
import { Fragment as PrismaFragment } from '@/generated/prisma/client'
import { ProjectHeader } from '../components/project-header'
import { FragmentWeb } from '../components/fragment-web'
import { EyeIcon, CodeIcon, CrownIcon, MessageSquareIcon, ClockIcon, KanbanIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { FileExplorer } from '@/components/file-explorer'
import { UserControl } from '@/components/user-control'
import { useAuth } from '@clerk/nextjs'
import { ErrorBoundary } from 'react-error-boundary'
import { ConflictBanner } from '@/components/github-push-button'
import { SupabaseButton } from '@/components/supabase-button'
import { VersionHistory } from '../components/version-history'
import { ContextDocumentButton } from '@/components/context-document'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useTRPC } from '@/trpc/client'
import { VisualEditPanel } from '@/components/visual-edit-panel'
import { TaskBoard } from '../components/task-board-wrapper'

interface Props { projectId: string }

export const ProjectView = ({ projectId }: Props) => {
  const { has } = useAuth()
  const hasProAccess = has?.({ plan: 'pro' })

  const [activeFragment, setActiveFragment] = useState<PrismaFragment | null>(null)
  const [tabState, setTabState] = useState<'preview' | 'code' | 'tasks'>('preview')
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'preview'>('chat')
  const [showHistory, setShowHistory] = useState(false)
  // Visual element selection — passed down to MessageForm
  const [elementContext, setElementContext] = useState<string | null>(null)
  // AI suggestion chips — fills the message form when clicked
  const [suggestionPrompt, setSuggestionPrompt] = useState<string | null>(null)

  const handleElementSelected = (description: string) => {
    setElementContext(description)
    setMobilePanel('chat')
  }

  return (
    <div className="h-screen flex flex-col">

      {/* ── Mobile layout ───────────────────────────────────────────── */}
      <div className="flex flex-col h-full md:hidden">
        <ErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <ProjectHeader projectId={projectId} activeFragment={activeFragment} />
          </Suspense>
        </ErrorBoundary>
        <ConflictBanner projectId={projectId} />

        <div className="flex border-b">
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${mobilePanel === 'chat' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
            onClick={() => setMobilePanel('chat')}
          >
            <MessageSquareIcon className="size-4" /> Chat
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${mobilePanel === 'preview' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
            onClick={() => setMobilePanel('preview')}
          >
            <EyeIcon className="size-4" /> Preview
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {mobilePanel === 'chat' ? (
            <ErrorBoundary fallback={null}>
              <Suspense fallback={null}>
                <MessagesContainer
                  projectId={projectId}
                  activeFragment={activeFragment}
                  setActiveFragment={(f) => { setActiveFragment(f); setMobilePanel('preview') }}
                  elementContext={elementContext}
                  onElementContextUsed={() => setElementContext(null)}
                  onSuggestionSelect={(p) => { setSuggestionPrompt(p); setMobilePanel('chat') }}
                  suggestionPrompt={suggestionPrompt}
                  onSuggestionUsed={() => setSuggestionPrompt(null)}
                />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 p-2 border-b">
                <Tabs value={tabState} onValueChange={(v) => setTabState(v as 'preview' | 'code')} className="flex-1">
                  <TabsList className="h-auto p-0">
                    <TabsTrigger value="preview" className="text-xs"><EyeIcon className="size-3" /> Demo</TabsTrigger>
                    <TabsTrigger value="code" className="text-xs"><CodeIcon className="size-3" /> Code</TabsTrigger>
                  </TabsList>
                </Tabs>
                <UserControl />
              </div>
              <div className="flex-1 min-h-0">
                {tabState === 'preview' && activeFragment
                  ? <FragmentWeb data={activeFragment} onElementSelected={handleElementSelected} />
                  : tabState === 'code' && activeFragment?.files
                    ? <FileExplorer files={activeFragment.files as { [path: string]: string }} fragmentId={activeFragment.id} />
                    : <div className="flex items-center justify-center h-full text-sm text-muted-foreground">No preview yet</div>
                }
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop layout ──────────────────────────────────────────── */}
      <div className="hidden md:flex flex-col h-full">
        <ResizablePanelGroup orientation="horizontal" className="flex-1">

          {/* Left: chat */}
          <ResizablePanel defaultSize={35} minSize={20} className="flex flex-col min-h-0">
            <ErrorBoundary fallback={null}>
              <Suspense fallback={null}>
                <ProjectHeader projectId={projectId} activeFragment={activeFragment} />
              </Suspense>
            </ErrorBoundary>
            <ConflictBanner projectId={projectId} />
            <ErrorBoundary fallback={null}>
              <Suspense fallback={null}>
                <MessagesContainer
                  projectId={projectId}
                  activeFragment={activeFragment}
                  setActiveFragment={setActiveFragment}
                  elementContext={elementContext}
                  onElementContextUsed={() => setElementContext(null)}
                  onSuggestionSelect={setSuggestionPrompt}
                  suggestionPrompt={suggestionPrompt}
                  onSuggestionUsed={() => setSuggestionPrompt(null)}
                />
              </Suspense>
            </ErrorBoundary>
          </ResizablePanel>

          <ResizableHandle className="hover:bg-primary transition-colors" />

          {/* Right: preview + optional version history panel */}
          <ResizablePanel defaultSize={65} minSize={50}>
            <div className="flex h-full">
              <div className="flex-1 flex flex-col min-w-0">
                <Tabs className="h-full gap-y-0 flex flex-col" defaultValue="preview" value={tabState}
                  onValueChange={(v) => setTabState(v as 'preview' | 'code' | 'tasks')}>
                  <div className="w-full flex items-center p-2 border-b gap-x-2">
                    <TabsList className="h-0 p-0 rounded-md">
                      <TabsTrigger value="preview" className="rounded-md"><EyeIcon /><span>Demo</span></TabsTrigger>
                      <TabsTrigger value="code" className="rounded-md"><CodeIcon /><span>Code</span></TabsTrigger>
                      <TabsTrigger value="tasks" className="rounded-md"><KanbanIcon className="size-3.5" /><span>Tasks</span></TabsTrigger>
                    </TabsList>

                    <div className="ml-auto flex items-center gap-x-1.5">
                      {/* Visual Edit — only shown when there's an active fragment */}
                      {activeFragment && tabState === 'preview' && (
                        <VisualEditPanel projectId={projectId} messageId={activeFragment.messageId} />
                      )}
                      {/* Version history toggle */}
                      <Button
                        size="sm" variant={showHistory ? 'default' : 'outline'}
                        className="h-8"
                        onClick={() => setShowHistory((p) => !p)}
                        title="Version history"
                      >
                        <ClockIcon className="size-4" />
                      </Button>

                      {/* Context document */}
                      <ErrorBoundary fallback={null}>
                        <Suspense fallback={null}>
                          <ContextProjectControls projectId={projectId} />
                        </Suspense>
                      </ErrorBoundary>

                      {/* Supabase */}
                      <ErrorBoundary fallback={null}>
                        <Suspense fallback={null}>
                          <SupabaseProjectControls projectId={projectId} />
                        </Suspense>
                      </ErrorBoundary>

                      {!hasProAccess && (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/pricing"><CrownIcon /> Upgrade</Link>
                        </Button>
                      )}
                      <UserControl />
                    </div>
                  </div>

                  <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
                    {activeFragment
                      ? <FragmentWeb data={activeFragment} onElementSelected={handleElementSelected} />
                      : <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Generate something to see a preview</div>
                    }
                  </TabsContent>
                  <TabsContent value="code" className="flex-1 overflow-hidden">
                    {activeFragment?.files && <FileExplorer files={activeFragment.files as { [path: string]: string }} fragmentId={activeFragment.id} />}
                  </TabsContent>
                  <TabsContent value="tasks" className="flex-1 overflow-hidden p-4">
                    <ErrorBoundary fallback={null}>
                      <Suspense fallback={null}>
                        <TaskBoard projectId={projectId} />
                      </Suspense>
                    </ErrorBoundary>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Version history sidebar */}
              {showHistory && (
                <div className="w-64 flex-shrink-0 border-l">
                  <ErrorBoundary fallback={null}>
                    <Suspense fallback={null}>
                      <VersionHistory
                        projectId={projectId}
                        activeFragment={activeFragment}
                        onSelectFragment={setActiveFragment}
                        onClose={() => setShowHistory(false)}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

function SupabaseProjectControls({ projectId }: { projectId: string }) {
  const trpc = useTRPC()
  const { data: project } = useSuspenseQuery(trpc.projects.getOne.queryOptions({ id: projectId }))
  return <SupabaseButton projectId={projectId} supabaseUrl={project.supabaseUrl} supabaseAnonKey={project.supabaseAnonKey} />
}

function ContextProjectControls({ projectId }: { projectId: string }) {
  const trpc = useTRPC()
  const { data: project } = useSuspenseQuery(trpc.projects.getOne.queryOptions({ id: projectId }))
  return <ContextDocumentButton projectId={projectId} currentContext={project.contextDocument} />
}
