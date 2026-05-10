import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encryption'

export async function saveGitHubToken({ userId, accessToken, login }: {
  userId: string; accessToken: string; login: string;
}) {
  const { encryptedKey, iv } = encrypt(accessToken)
  return prisma.gitHubToken.upsert({
    where:  { userId },
    update: { accessToken: encryptedKey, iv, login },
    create: { userId, accessToken: encryptedKey, iv, login },
  })
}

export async function getGitHubToken(userId: string) {
  const record = await prisma.gitHubToken.findUnique({ where: { userId } })
  if (!record) return null

  // Legacy rows (pre-encryption) have no iv — return plaintext as-is
  // They will be re-encrypted on the next GitHub OAuth flow
  if (!record.iv) return record

  try {
    return { ...record, accessToken: decrypt(record.accessToken, record.iv) }
  } catch {
    // Decryption failed (e.g. ENCRYPTION_SECRET rotated) — return null
    // so the user is prompted to re-authenticate rather than seeing a crash
    console.error(`[github-token] Failed to decrypt token for user ${userId}`)
    return null
  }
}
