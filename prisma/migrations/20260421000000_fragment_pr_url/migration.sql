-- Add prUrl to Fragment for storing the GitHub PR link after manual push
ALTER TABLE "Fragment" ADD COLUMN "prUrl" TEXT;
