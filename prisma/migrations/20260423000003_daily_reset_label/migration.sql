-- Rename monthly_reset → daily_reset in CreditEventReason enum
-- The cron runs daily at midnight UTC, not monthly — this corrects the label

ALTER TYPE "CreditEventReason" RENAME VALUE 'monthly_reset' TO 'daily_reset';
