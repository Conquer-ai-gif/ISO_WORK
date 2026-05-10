import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing(.*)',
  '/docs(.*)',
  '/marketplace(.*)',
  '/feedback(.*)',
  '/templates(.*)',
  '/api/inngest(.*)',
  '/api/github/webhook(.*)',
  '/api/clerk/webhook(.*)',
  '/api/clerk/billing-webhook(.*)',
  '/api/preview(.*)',
  '/share(.*)',
  '/invite(.*)',
])

const isAdminRoute = createRouteMatcher(['/admin(.*)'])
const isTRPCRoute = createRouteMatcher(['/api/trpc(.*)'])

export default clerkMiddleware(async (auth, req) => {
  // Allow tRPC to enforce auth at the procedure level.
  if (isTRPCRoute(req)) {
    return NextResponse.next()
  }

  // Admin route — check user ID against allowlist
  if (isAdminRoute(req)) {
    const { userId } = await auth()

    if (!userId) {
      // Not signed in — redirect to sign-in
      const signInUrl = new URL('/sign-in', req.url)
      signInUrl.searchParams.set('redirect_url', req.url)
      return NextResponse.redirect(signInUrl)
    }

    // Check against ADMIN_USER_IDS env var
    const adminIds = (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (!adminIds.includes(userId)) {
      // Signed in but not an admin — redirect to home
      return NextResponse.redirect(new URL('/', req.url))
    }

    return NextResponse.next()
  }

  // All other protected routes — standard Clerk auth
  if (!isPublicRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
