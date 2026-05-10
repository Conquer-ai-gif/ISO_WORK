Isotope Repository Analysis Report

This report outlines the critical errors, security vulnerabilities, and code inconsistencies found in the Isotope repository.




1. Systemic Security Vulnerabilities (tRPC Auth)

The most critical issue is a systemic failure in how administrative and sensitive procedures are protected. The project relies on page-level middleware for security, which does not protect the underlying tRPC API endpoints.

File
Issue
Impact
src/modules/admin/server/procedures.ts
Entire adminRouter uses baseProcedure.
Critical: Any user can call /api/trpc/admin.stats, admin.users, etc., to leak all user emails and project data.
src/modules/feedback/server/procedures.ts
list and updateStatus use baseProcedure.
High: Feedback from all users is publicly readable and modifiable by any unauthenticated caller.
src/modules/marketplace/server/procedures.ts
setFeatured uses baseProcedure.
Medium: Any user can feature or unfeature any template in the public marketplace.




Recommendation: Create and use an adminProcedure in src/trpc/init.ts that verifies the user ID against an ADMIN_USER_IDS environment variable.




2. Runtime & Build Errors

These issues will cause the application to crash or fail to compile in certain scenarios.

File
Issue
Description
src/app/share/[projectId]/page.tsx
Invalid findUnique query.
Prisma's findUnique does not support multiple non-unique fields in where. Using { id, isPublic: true } will throw a runtime error.
src/modules/changelog/server/procedures.ts
Broken imports & Auth mismatch.
Attempts to import adminProcedure (which doesn't exist) and uses protectedProcedure for getPublished, which breaks the public changelog page.
prisma/schema.prisma
Typo in Message model.
The field is named createAt (missing 'd'), while the Project model uses createdAt. This inconsistency leads to frequent bugs in the UI.







3. Data & Logic Inconsistencies

Several fields and logic flows do not align between the database schema and the application code.

Field Naming Mismatches

•
Sync Conflicts: The schema uses lunoContent, but the UI and webhook code refer to isotopeContent.

•
Conflict Resolution: The UI sends resolvedBy: 'isotope', but the backend logic and schema are inconsistent with this naming.

•
GitHub Webhooks: The webhook handler expects projectId in the payload, but the TaskExecutor does not consistently provide it in the expected format.

Authorization Inconsistencies

•
Workspace Permissions: messages.getMany only checks project.userId, meaning invited workspace members (Editors/Viewers) cannot see the chat history, despite the UI promising access.

•
Task Board: taskboard.getMany allows any authenticated user to view any project's tasks if they have the ID, failing to check project ownership or workspace membership.




4. Credit System Issues

The credit consumption logic has several edge cases that could lead to "infinite" credits or user frustration:

•
Refund Logic: rejectPlan increments credits without checking if a credit was actually successfully consumed or if the plan was already rejected/approved.

•
Race Conditions: consumeCredits performs a findUnique followed by an update. In a high-concurrency environment, a user could trigger multiple generations simultaneously to bypass credit limits.




Summary of Action Items

1.
Fix Auth: Implement adminProcedure and apply it to all admin-only tRPC routers.

2.
Fix Prisma: Update findUnique in the share page to use findFirst or a proper unique constraint.

3.
Standardize Schema: Rename createAt to createdAt across all models and align "Luno" vs "Isotope" naming.

4.
Audit Permissions: Ensure every tRPC procedure checks for project.userId OR workspace membership.

