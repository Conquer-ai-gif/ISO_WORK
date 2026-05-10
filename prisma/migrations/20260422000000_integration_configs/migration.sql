-- Create IntegrationProvider enum
CREATE TYPE "IntegrationProvider" AS ENUM (
  'resend',
  'supabase_url',
  'supabase_anon_key',
  'supabase_service_key',
  'stripe_secret_key',
  'stripe_publishable_key',
  'openai_api_key'
);

-- Create IntegrationConfig table
CREATE TABLE "IntegrationConfig" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "provider"     "IntegrationProvider" NOT NULL,
  "encryptedKey" TEXT NOT NULL,
  "iv"           TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one config per provider per project
ALTER TABLE "IntegrationConfig"
  ADD CONSTRAINT "IntegrationConfig_projectId_provider_key"
  UNIQUE ("projectId", "provider");

-- Indexes
CREATE INDEX "IntegrationConfig_projectId_idx" ON "IntegrationConfig"("projectId");

-- Foreign key
ALTER TABLE "IntegrationConfig"
  ADD CONSTRAINT "IntegrationConfig_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
