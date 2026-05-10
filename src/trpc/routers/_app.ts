import { projectsRouter } from '@/modules/projects/server/procedures';
import { createTRPCRouter } from '../init';
import { messageRouter } from '@/modules/messages/server/procedures';
import { usageRouter } from '@/modules/usage/server/procedures';
import { adminRouter } from '@/modules/admin/server/procedures';
import { workspaceRouter } from '@/modules/workspaces/server/procedures';
import { referralRouter } from '@/modules/referral/server/procedures';
import { feedbackRouter } from '@/modules/feedback/server/procedures';
import { marketplaceRouter } from '@/modules/marketplace/server/procedures';
import { changelogRouter } from '@/modules/changelog/server/procedures';
import { taskBoardRouter } from '@/modules/taskboard/server/procedures';
import { integrationsRouter } from '@/modules/integrations/server/procedures';
import { findWorkRouter } from '@/modules/find-work/server/procedures';

export const appRouter = createTRPCRouter({
  messages:     messageRouter,
  projects:     projectsRouter,
  usage:        usageRouter,
  admin:        adminRouter,
  workspaces:   workspaceRouter,
  referral:     referralRouter,
  feedback:     feedbackRouter,
  marketplace:  marketplaceRouter,
  changelog:    changelogRouter,
  taskBoard:    taskBoardRouter,
  integrations: integrationsRouter,
  findWork:     findWorkRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
