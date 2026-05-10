-- Add missing index on Message.projectId
-- Every chat load queries messages by projectId — without this index it's a full table scan
CREATE INDEX "Message_projectId_idx" ON "Message"("projectId");

-- Composite index for paginated chat queries (projectId + createdAt ordering)
CREATE INDEX "Message_projectId_createdAt_idx" ON "Message"("projectId", "createdAt");
