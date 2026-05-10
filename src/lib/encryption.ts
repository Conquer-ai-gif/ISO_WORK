/**
 * AES-256-GCM encryption for integration keys.
 *
 * Keys are encrypted before storage and decrypted only at runtime
 * inside the Inngest step — never exposed to frontend, AI prompts, or logs.
 *
 * Required env var: ENCRYPTION_SECRET (exactly 32 characters)
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16   // 128-bit IV
const TAG_LENGTH = 16  // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET env var is not set. Add a 32-character secret to your .env.local')
  }
  if (secret.length !== 32) {
    throw new Error(`ENCRYPTION_SECRET must be exactly 32 characters. Got ${secret.length}.`)
  }
  return Buffer.from(secret, 'utf8')
}

export interface EncryptedValue {
  encryptedKey: string // hex-encoded ciphertext + auth tag
  iv: string           // hex-encoded IV
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the ciphertext and IV as hex strings for safe DB storage.
 */
export function encrypt(plaintext: string): EncryptedValue {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  // Append the auth tag to the ciphertext so they travel together
  const ciphertextWithTag = Buffer.concat([encrypted, cipher.getAuthTag()])

  return {
    encryptedKey: ciphertextWithTag.toString('hex'),
    iv: iv.toString('hex'),
  }
}

/**
 * Decrypts an AES-256-GCM encrypted value.
 * Only called at runtime inside the Inngest sandbox injection step.
 */
export function decrypt(encryptedKey: string, iv: string): string {
  const key = getEncryptionKey()
  const ivBuffer = Buffer.from(iv, 'hex')
  const ciphertextWithTag = Buffer.from(encryptedKey, 'hex')

  // Split auth tag from ciphertext
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - TAG_LENGTH)
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(authTag)

  return decipher.update(ciphertext) + decipher.final('utf8')
}

/**
 * Masks a plaintext key for display in the UI.
 * Shows the first 4 chars + asterisks + last 4 chars.
 * e.g. "sk_live_abc123xyz" → "sk_l****xyz"
 */
export function maskKey(plaintext: string): string {
  if (plaintext.length <= 8) return '****'
  const start = plaintext.slice(0, 4)
  const end = plaintext.slice(-4)
  return `${start}****${end}`
}
