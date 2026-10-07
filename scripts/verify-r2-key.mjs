import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
if (!accessKeyId || !secretAccessKey) throw new Error('R2 signing key is missing')

const version = JSON.parse(readFileSync(resolve(import.meta.dirname, '../apps/desktop/package.json'), 'utf8')).version
const client = new S3Client({
  region: 'auto',
  endpoint: 'https://83952a1be987e4a12647732861a60925.r2.cloudflarestorage.com',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
})

for (const environment of ['development', 'production']) {
  const url = await getSignedUrl(client, new GetObjectCommand({
    Bucket: `ovelle-storage-${environment}`,
    Key: `releases/desktop/Ovelle-${version}-win-x64.exe`,
  }), { expiresIn: 60 })
  const response = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  if (response.status !== 206) {
    throw new Error(`${environment} R2 key verification failed (${response.status})`)
  }
  await response.body?.cancel()
}

console.log('Ovelle R2 signing key verified for both buckets')
