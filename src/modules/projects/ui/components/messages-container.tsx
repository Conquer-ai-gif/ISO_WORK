'use client'

import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
// import { GenerationProgress } from "./generation-progress";
// import { GenerationProgress } from "src/app/components/generation-progress";
import {GenerationProgress} from '@/components/generation-progress'
import { useEffect, useRef, useCallback } from "react";
import { Fragment as PrismaFragment } from "@/generated/prisma/client";

interface Props {
  projectId: string;
  activeFragment: PrismaFragment | null;
  setActiveFragment: (fragment: PrismaFragment | null) => void;
  elementContext?: string | null;
  onElementContextUsed?: () => void;
  onSuggestionSelect?: (prompt: string) => void;
  suggestionPrompt?: string | null;
  onSuggestionUsed?: () => void;
}

export const MessagesContainer = ({
  projectId,
  activeFragment,
  setActiveFragment,
  elementContext,
  onElementContextUsed,
  onSuggestionSelect,
  suggestionPrompt,
  onSuggestionUsed,
}: Props) => {
  const trpc = useTRPC()
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null)

  const { data: messages, refetch } = useSuspenseQuery(trpc.messages.getMany.queryOptions(
    { projectId },
    { refetchInterval: 5000 }
  ))

  useEffect(() => {
    const lastAssistantMessage = messages.findLast(
      (message) => message.role === 'ASSISTANT'
    );
    if (
      lastAssistantMessage?.fragment &&
      lastAssistantMessage.id !== lastAssistantMessageIdRef.current
    ) {
      setActiveFragment(lastAssistantMessage.fragment);
      lastAssistantMessageIdRef.current = lastAssistantMessage.id
    }
  }, [messages, setActiveFragment])

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages.length]);

  const lastMessageWithPlan = [...messages].reverse().find(m => m.role === 'ASSISTANT' && m.type === 'RESULT' && m.plan)
  const lastMessageWithPlanExists = !!lastMessageWithPlan
  const lastAssistantResultId = [...messages].reverse()
    .find((m) => m.role === 'ASSISTANT' && m.type === 'RESULT')?.id;

  // The ASSISTANT message Inngest is currently working on —
  // identified by having no fragment yet (fragment is only created on completion)
  const streamingMessageId = [...messages].reverse()
    .find((m) => m.role === 'ASSISTANT' && m.type === 'RESULT' && !m.fragment)?.id ?? null

  // Fired by GenerationProgress when status === 'completed'
  // Triggers an immediate refetch so the fragment appears without the 5s wait
  const handleGenerationComplete = useCallback(() => {
    refetch()
  }, [refetch])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-2 pr-1">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              content={message.content}
              role={message.role}
              fragment={message.fragment}
              createdAt={message.createdAt}
              isActiveFragment={activeFragment?.id === message.fragment?.id}
              onFragmentClick={(f) => setActiveFragment(f)}
              type={message.type}
              projectId={projectId}
              imageUrl={message.imageUrl}
              isLatest={message.id === lastAssistantResultId}
              onSuggestionSelect={onSuggestionSelect}
              messageId={message.id}
              plan={message.plan}
              planStatus={message.planStatus}
            />
          ))}

          {/* GenerationProgress stays rendered after completion (isFrozen state)
              so the user can still expand the log to see what was built.
              It only shows during active generation OR while frozen/done.
              Once the fragment arrives it sits above the MessageCard naturally. */}
          {(streamingMessageId || !lastMessageWithPlanExists) && (
            <GenerationProgress
              messageId={streamingMessageId}
              onComplete={handleGenerationComplete}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>
      <div className="relative p-3 pt-1">
        <div className="absolute -top-6 left-0 right-0 bg-gradient-to-b from-transparent to-background/70 pointer-events-none" />
        <MessageForm
          projectId={projectId}
          elementContext={elementContext}
          onElementContextUsed={onElementContextUsed}
          suggestionPrompt={suggestionPrompt}
          onSuggestionUsed={onSuggestionUsed}
        />
      </div>
    </div>
  )
}





// 'use client'

// import { useTRPC } from "@/trpc/client";
// import { useSuspenseQuery } from "@tanstack/react-query";
// import { MessageCard } from "./message-card";
// import { MessageForm } from "./message-form";
// import { MessageLoading } from "./message-loading";
// import { useEffect, useRef } from "react";
// import { Fragment as PrismaFragment } from "@/generated/prisma/client";

// interface Props {
//   projectId: string;
//   activeFragment: PrismaFragment | null;
//   setActiveFragment: (fragment: PrismaFragment | null) => void;
//   elementContext?: string | null;
//   onElementContextUsed?: () => void;
//   onSuggestionSelect?: (prompt: string) => void;
//   suggestionPrompt?: string | null;
//   onSuggestionUsed?: () => void;
// }

// export const MessagesContainer = ({
//   projectId,
//   activeFragment,
//   setActiveFragment,
//   elementContext,
//   onElementContextUsed,
//   onSuggestionSelect,
//   suggestionPrompt,
//   onSuggestionUsed,
// }: Props) => {
//   const trpc = useTRPC()
//   const bottomRef = useRef<HTMLDivElement>(null);
//   const lastAssistantMessageIdRef = useRef<string | null>(null)

//   const { data: messages } = useSuspenseQuery(trpc.messages.getMany.queryOptions(
//     { projectId },
//     { refetchInterval: 5000 }
//   ))

//   useEffect(() => {
//     const lastAssistantMessage = messages.findLast(
//       (message) => message.role === 'ASSISTANT'
//     );
//     if (
//       lastAssistantMessage?.fragment &&
//       lastAssistantMessage.id !== lastAssistantMessageIdRef.current
//     ) {
//       setActiveFragment(lastAssistantMessage.fragment);
//       lastAssistantMessageIdRef.current = lastAssistantMessage.id
//     }
//   }, [messages, setActiveFragment])

//   useEffect(() => {
//     bottomRef.current?.scrollIntoView();
//   }, [messages.length]);

//   const lastMessage = messages[messages.length - 1]
//   const lastMessageWithPlan = [...messages].reverse().find(m => m.role === 'ASSISTANT' && m.type === 'RESULT' && m.plan)
//   const lastMessageWithPlanExists = !!lastMessageWithPlan
//   const lastAssistantResultId = [...messages].reverse()
//     .find((m) => m.role === 'ASSISTANT' && m.type === 'RESULT')?.id;

//   return (
//     <div className="flex flex-col flex-1 min-h-0">
//       <div className="flex-1 min-h-0 overflow-y-auto">
//         <div className="pt-2 pr-1">
//           {messages.map((message) => (
//             <MessageCard
//               key={message.id}
//               content={message.content}
//               role={message.role}
//               fragment={message.fragment}
//               createdAt={message.createdAt}
//               isActiveFragment={activeFragment?.id === message.fragment?.id}
//               onFragmentClick={(f) => setActiveFragment(f)}
//               type={message.type}
//               projectId={projectId}
//               imageUrl={message.imageUrl}
//               isLatest={message.id === lastAssistantResultId}
//               onSuggestionSelect={onSuggestionSelect}
//               messageId={message.id}
//               plan={message.plan}
//               planStatus={message.planStatus}
//             />
//           ))}
//           {!lastMessageWithPlanExists && <MessageLoading planReady={lastMessageWithPlanExists} />}
//           <div ref={bottomRef} />
//         </div>
//       </div>
//       <div className="relative p-3 pt-1">
//         <div className="absolute -top-6 left-0 right-0 bg-gradient-to-b from-transparent to-background/70 pointer-events-none" />
//         <MessageForm
//           projectId={projectId}
//           elementContext={elementContext}
//           onElementContextUsed={onElementContextUsed}
//           suggestionPrompt={suggestionPrompt}
//           onSuggestionUsed={onSuggestionUsed}
//         />
//       </div>
//     </div>
//   )
// }
