-- Add isIndexing flag to Project
ALTER TABLE "Project" ADD COLUMN "isIndexing" BOOLEAN NOT NULL DEFAULT false;

-- Create ChatMemory table
CREATE TABLE "ChatMemory" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "content"   TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMemory_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "ChatMemory_projectId_idx"          ON "ChatMemory"("projectId");
CREATE INDEX "ChatMemory_projectId_createdAt_idx" ON "ChatMemory"("projectId", "createdAt");
