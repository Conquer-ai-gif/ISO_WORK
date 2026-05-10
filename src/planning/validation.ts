import * as Sentry from '@sentry/nextjs'
import { TaskGraphSchema, type TaskGraph } from '@/execution/taskGraph'

const MAX_RETRIES = 3

export async function validateAndParsePlan(
  rawPlan: string,
  attempt = 1,
): Promise<TaskGraph> {
  const stripped = rawPlan.replace(/```json|```/g, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error(`Plan is not valid JSON (attempt ${attempt}): ${stripped.slice(0, 200)}`)
  }

  const result = TaskGraphSchema.safeParse(parsed)
  if (result.success) {
    return result.data
  }

  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
  throw new Error(`Plan schema validation failed (attempt ${attempt}): ${issues}`)
}

export async function retryValidatePlan(
  generatePlan: () => Promise<string>,
): Promise<TaskGraph> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await generatePlan()
      return await validateAndParsePlan(raw, attempt)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      Sentry.captureMessage(`Plan validation failed (attempt ${attempt}/${MAX_RETRIES})`, {
        level: 'warning',
        extra: { error: lastError.message },
      })
    }
  }

  Sentry.captureException(lastError, {
    extra: { context: 'retryValidatePlan', maxRetries: MAX_RETRIES },
  })
  throw new Error(
    `Plan generation failed after ${MAX_RETRIES} attempts. Last error: ${lastError?.message}`,
  )
}
