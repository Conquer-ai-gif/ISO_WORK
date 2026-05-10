import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Accepts an image file, returns a base64 data URL.
// Stored in Message.imageUrl in Postgres — kept small to avoid bloating DB.
// Max size: 1MB. Images over 512KB are passed through as-is (Gemini handles up to 20MB).
// TODO: For production scale, replace base64 storage with Vercel Blob or S3.
//       Add BLOB_READ_WRITE_TOKEN env var and use @vercel/blob put() instead.

const MAX_SIZE = 1 * 1024 * 1024; // 1MB — keeps DB rows manageable

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return new Response('No file provided', { status: 400 });
  if (!file.type.startsWith('image/')) return new Response('Only images allowed', { status: 400 });
  if (file.size > MAX_SIZE) {
    return new Response(
      `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 1MB. Compress or resize before uploading.`,
      { status: 400 }
    );
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const dataUrl = `data:${file.type};base64,${base64}`;

  return Response.json({ url: dataUrl, mimeType: file.type, base64 });
}
