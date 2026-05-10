-- AlterEnum: add custom to IntegrationProvider
ALTER TYPE "IntegrationProvider" ADD VALUE 'custom';

-- AlterTable: add customEnvVar to IntegrationConfig
ALTER TABLE "IntegrationConfig" ADD COLUMN "customEnvVar" TEXT;

-- AlterTable: add requiredIntegrations to Message
ALTER TABLE "Message" ADD COLUMN "requiredIntegrations" TEXT;
