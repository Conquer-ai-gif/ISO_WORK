import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { codeAgentFunction, freeCreditsResetFunction, embedRepoFilesFunction, purgeGenerationEventsFunction, refreshVercelUrlFunction } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    codeAgentFunction,
    freeCreditsResetFunction,
    embedRepoFilesFunction,
    purgeGenerationEventsFunction,
    refreshVercelUrlFunction,
  ],
});