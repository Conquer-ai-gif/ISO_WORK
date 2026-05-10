'use client'

import { CopyCheckIcon, CopyIcon, SaveIcon, Loader2Icon, PencilIcon, EyeIcon } from 'lucide-react'
import { useState, useMemo, useCallback, Fragment } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Hint } from '@/components/hint'
import { CodeView } from '@/components/code-view'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList,
  BreadcrumbSeparator, BreadcrumbPage, BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb'
import { TreeView } from './tree-view'
import { convertFilesToTreeItems } from '@/lib/utils'
import { useTRPC } from '@/trpc/client'

type FileCollection = { [path: string]: string }

const getLanguage = (filename: string): string =>
  filename.split('.').pop()?.toLowerCase() || 'text'

interface FileBreadcrumbProps { filePath: string }

const FileBreadcrumb = ({ filePath }: FileBreadcrumbProps) => {
  const segments = filePath.split('/')
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.length <= 3
          ? segments.map((seg, i) => (
            <Fragment key={i}>
              <BreadcrumbItem>
                {i === segments.length - 1
                  ? <BreadcrumbPage className="font-medium">{seg}</BreadcrumbPage>
                  : <span className="text-muted-foreground">{seg}</span>
                }
              </BreadcrumbItem>
              {i < segments.length - 1 && <BreadcrumbSeparator />}
            </Fragment>
          ))
          : (
            <>
              <BreadcrumbItem><span className="text-muted-foreground">{segments[0]}</span></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage className="font-medium">{segments[segments.length - 1]}</BreadcrumbPage></BreadcrumbItem>
            </>
          )
        }
      </BreadcrumbList>
    </Breadcrumb>
  )
}

interface FileExplorerProps {
  files: FileCollection
  fragmentId?: string   // if provided, enables save-to-DB
  onFilesChange?: (files: FileCollection) => void
}

export const FileExplorer = ({ files, fragmentId, onFilesChange }: FileExplorerProps) => {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    const keys = Object.keys(files)
    // Default to page.tsx if it exists, otherwise first file
    return keys.find((k) => k.endsWith('page.tsx')) ?? keys[0] ?? null
  })

  // Local edits — keyed by file path
  const [localEdits, setLocalEdits] = useState<FileCollection>({})
  const [editMode, setEditMode] = useState(false)
  const [copied, setCopied] = useState(false)

  const treeData = useMemo(() => convertFilesToTreeItems(files), [files])

  // Merge saved files with local edits
  const activeFiles = useMemo(
    () => ({ ...files, ...localEdits }),
    [files, localEdits],
  )

  const currentContent = selectedFile ? (activeFiles[selectedFile] ?? '') : ''
  const isDirty = selectedFile ? localEdits[selectedFile] !== undefined : false
  const hasAnyEdits = Object.keys(localEdits).length > 0

  const handleFileSelect = useCallback((path: string) => {
    if (activeFiles[path] !== undefined) setSelectedFile(path)
  }, [activeFiles])

  const handleEdit = useCallback((newContent: string) => {
    if (!selectedFile) return
    setLocalEdits((prev) => ({ ...prev, [selectedFile]: newContent }))
  }, [selectedFile])

  const handleCopy = useCallback(() => {
    if (selectedFile) {
      navigator.clipboard.writeText(currentContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [selectedFile, currentContent])

  // Save edits back to the fragment in DB
  const saveEdits = useMutation(
    trpc.projects.saveFileEdits.mutationOptions({
      onSuccess: () => {
        toast.success('Changes saved')
        onFilesChange?.({ ...files, ...localEdits })
        setLocalEdits({})
        queryClient.invalidateQueries(trpc.messages.getMany.queryOptions)
      },
      onError: (e) => toast.error(e.message),
    }),
  )

  const handleSave = () => {
    if (!fragmentId || !hasAnyEdits) return
    saveEdits.mutate({ fragmentId, files: localEdits })
  }

  const handleDiscardEdits = () => {
    setLocalEdits({})
    setEditMode(false)
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* File tree */}
      <ResizablePanel defaultSize={28} minSize={20} className="bg-sidebar">
        <TreeView data={treeData} value={selectedFile} onSelect={handleFileSelect} />
      </ResizablePanel>

      <ResizableHandle className="hover:bg-primary transition-colors" />

      {/* Editor / viewer */}
      <ResizablePanel defaultSize={72} minSize={40}>
        {selectedFile && activeFiles[selectedFile] !== undefined ? (
          <div className="h-full w-full flex flex-col">
            {/* Toolbar */}
            <div className="border-b bg-sidebar px-3 py-1.5 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileBreadcrumb filePath={selectedFile} />
                {isDirty && (
                  <span className="size-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Unsaved changes" />
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Edit / view toggle */}
                <Hint text={editMode ? 'Switch to view mode' : 'Edit this file'} side="bottom">
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                    onClick={() => setEditMode((p) => !p)}
                  >
                    {editMode
                      ? <EyeIcon className="size-3.5" />
                      : <PencilIcon className="size-3.5" />
                    }
                  </Button>
                </Hint>

                {/* Copy */}
                <Hint text="Copy to clipboard" side="bottom">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleCopy}>
                    {copied ? <CopyCheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                  </Button>
                </Hint>

                {/* Save (only shown if fragmentId + edits exist) */}
                {fragmentId && hasAnyEdits && (
                  <>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                      onClick={handleDiscardEdits}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm" variant="default" className="h-7 px-2 text-xs gap-1"
                      disabled={saveEdits.isPending}
                      onClick={handleSave}
                    >
                      {saveEdits.isPending
                        ? <Loader2Icon className="size-3 animate-spin" />
                        : <SaveIcon className="size-3" />
                      }
                      Save
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-auto">
              {editMode ? (
                <textarea
                  className="w-full h-full resize-none bg-background text-xs font-mono p-3 outline-none border-none leading-relaxed"
                  value={currentContent}
                  onChange={(e) => handleEdit(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
              ) : (
                <CodeView
                  code={currentContent}
                  lang={getLanguage(selectedFile)}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a file to view its contents
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
