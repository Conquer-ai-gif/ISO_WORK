# FIXED.md - Codebase Issues and Fixes

This document tracks all issues found in the codebase and how they were fixed.

## Date: April 10, 2026

---

## CRITICAL ISSUES FIXED

### 1. Database Schema Field Name Mismatch ✅ FIXED
**Issue:** Schema defines `lunoContent` field but code tries to save `isotopeContent`
**Location:** `prisma/schema.prisma` SyncConflict model vs `src/app/api/github/webhook/route.ts`
**Impact:** Sync conflicts won't persist to database
**Fix:** Renamed `lunoContent` to `isotopeContent` in schema

**Before:**
```prisma
model SyncConflict {
  lunoContent   String
  githubContent String
}
```

**After:**
```prisma
model SyncConflict {
  isotopeContent String
  githubContent  String
}
```

### 2. Database Schema Field Name Typo ✅ FIXED
**Issue:** `createAt` instead of `createdAt` in Message and Fragment models
**Location:** `prisma/schema.prisma` lines 102 and 122
**Impact:** Inconsistent naming convention across schema
**Fix:** Changed `createAt` to `createdAt` in both models

**Before:**
```prisma
model Message {
  createAt  DateTime @default(now())
}

model Fragment {
  createAt  DateTime @default(now())
}
```

**After:**
```prisma
model Message {
  createdAt DateTime @default(now())
}

model Fragment {
  createdAt DateTime @default(now())
}
```

### 4. Database Field Name References Fixed ✅ FIXED
**Issue:** 23+ locations in code still referenced old `createAt` field name after schema change
**Locations:** All backend procedures, frontend components, and inngest functions
**Impact:** Runtime database errors when querying Message and Fragment tables
**Fix:** Updated all references from `createAt` to `createdAt` in:

**Backend Files (12 locations):**
- `src/modules/projects/server/procedures.ts` (4 instances)
- `src/modules/admin/server/procedures.ts` (3 instances) 
- `src/sandbox/sandboxManager.ts` (1 instance)
- `src/app/api/github/webhook/route.ts` (1 instance)
- `src/modules/workspaces/server/procedures.ts` (1 instance)
- `src/modules/messages/server/procedures.ts` (1 instance)
- `src/modules/marketplace/server/procedures.ts` (1 instance)
- `src/inngest/functions.ts` (3 instances)
- `src/modules/usage/server/procedures.ts` (4 instances)

**Frontend Files (3 locations):**
- `src/app/share/[projectId]/page.tsx` (1 instance)
- `src/modules/projects/ui/components/messages-container.tsx` (1 instance)
- `src/modules/projects/ui/components/version-history.tsx` (1 instance)

### 3. Silent Error Swallowing ✅ FIXED
**Issue:** Multiple `.catch(() => {})` handlers that ignore errors
**Locations:**
- `src/app/api/clerk/webhook/route.ts`: Credit initialization failures
- `src/modules/projects/server/procedures.ts`: Vercel deletion failures
- `src/lib/generationEvents.ts`: Database operation failures
**Impact:** Failed operations appear successful, orphaned resources
**Fix:** Added proper error logging with context to all silent catch handlers

**Before:**
```typescript
await initCredits(userId).catch(() => {})
```

**After:**
```typescript
await initCredits(userId).catch((e) => {
  console.error(`Failed to initialize credits for user ${userId}:`, e);
});
```

---

## MEDIUM SEVERITY ISSUES TO FIX

### 4. TypeScript Compilation Errors ✅ FIXED
**Issue:** Multiple implicit `any` types and type mismatches in `src/inngest/functions.ts`
**Locations:** Lines 213-214, 225, 327, 332, 380, 388
**Impact:** Code won't compile, runtime type safety issues
**Fix:** 
- Added explicit types to filter/map parameters
- Fixed Message type usage
- Replaced `openRouterModel` with `getOpenRouterModel('free')` for proper typing

**Before:**
```typescript
.filter((m) => m.role === 'ASSISTANT' && m.content.length > 10)
.map((m) => m.content.slice(0, 200))
return all.map((m) => ({...}))
```

**After:**
```typescript
.filter((m: { role: string; content: string }) => m.role === 'ASSISTANT' && m.content.length > 10)
.map((m: { content: string }) => m.content.slice(0, 200))
return all.map((m: { role: string; content: string }) => ({...}))
```

### 5. Prisma Type Import Issues ✅ FIXED
**Issue:** Incorrect import paths for Prisma generated types
**Locations:** `src/app/(home)/changelog/page.tsx`, `src/app/(home)/marketplace/page.tsx`
**Impact:** TypeScript couldn't find ChangelogEntry and MarketplaceTemplate types
**Fix:** Updated imports to use `@/generated/prisma/client` instead of `@prisma/client`

**Before:**
```typescript
import type { ChangelogEntry } from '@prisma/client'
```

**After:**
```typescript
import type { ChangelogEntry } from '@/generated/prisma/client'
```

---

## LOW SEVERITY ISSUES TO FIX

### 6. Performance Concerns
**Issue:** Inefficient error detection and high-frequency polling
**Locations:** `src/agents/fixAgent.ts`, `src/app/api/generation/stream/route.ts`
**Status:** PENDING

### 7. Code Quality Issues
**Issue:** Inconsistent formatting, error responses, missing indexes
**Status:** PENDING

---

## MIGRATION NOTES

After schema changes, run these commands when DATABASE_URL is configured:
```bash
npx prisma migrate dev --name fix-schema-field-names
npx prisma generate
```

This will update the database and regenerate TypeScript types to match the new field names.