import { afterEach, describe, expect, it, vi } from 'vitest'
import indexHtmlRaw from '../../index.html?raw'
import vercelJsonRaw from '../../vercel.json?raw'
import {
  DEFAULT_R2_MAX_STORAGE_BYTES,
  EMPTY_SHA256_HEX,
  buildSigV4PresignedUrl,
  computeUploadManifestHash,
  createR2PresignedGetUrl,
  createR2PresignedPutUrl,
  createUploadToken,
  deleteR2Object,
  encodeS3Key,
  hasR2StorageCapacity,
  headR2Object,
  isAllowedOrigin,
  isR2Configured,
  isR2StoragePath,
  isSafeAlbumR2Path,
  isSafeR2Key,
  parseAllowedOrigins,
  parseR2MaxStorageBytes,
  putR2Object,
  readR2Config,
  runWithConcurrency,
  sha256Hex,
  stripR2Prefix,
  timingSafeEqual,
  verifyUploadToken,
  verifyUploadTokenForAbort,
  type R2Config,
  type UploadManifestFile,
} from '../../supabase/functions/_shared/r2.ts'

const TEST_R2_CONFIG: R2Config = {
  accountId: '0123456789abcdef0123456789abcdef',
  accessKeyId: 'AKIA_TEST_ACCESS_KEY',
  secretAccessKey: 'super-secret-r2-signing-key-never-expose',
  bucketName: 'khoanhkhac-albums',
}

const TEST_ALBUM_ID = '550e8400-e29b-41d4-a716-446655440000'
const TEST_FILE_1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const TEST_FILE_2 = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
const TEST_FILE_3 = '6ba7b812-9dad-11d1-80b4-00c04fd430c8'

const SAMPLE_MANIFEST: UploadManifestFile[] = [
  {
    index: 0,
    role: 'strip',
    name: 'photobooth.jpg',
    mimeType: 'image/jpeg',
    storagePath: `r2:${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`,
  },
  {
    index: 1,
    role: 'gif',
    name: 'khoanh-khac.gif',
    mimeType: 'image/gif',
    storagePath: `r2:${TEST_ALBUM_ID}/${TEST_FILE_2}.gif`,
  },
  {
    index: 2,
    role: 'photo',
    name: 'anh-01.jpg',
    mimeType: 'image/jpeg',
    storagePath: `r2:${TEST_ALBUM_ID}/${TEST_FILE_3}.jpg`,
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AWS SigV4 signing & Cloudflare R2 presigned URLs', () => {
  it('matches the official AWS S3 SigV4 query-string presigned URL test vector bit-for-bit', async () => {
    const result = await buildSigV4PresignedUrl({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      canonicalUri: '/test.txt',
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresInSeconds: 86400,
      signedHeaders: {},
      now: new Date('2013-05-24T00:00:00.000Z'),
    })

    expect(result.signature).toBe('aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
    expect(result.url).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt'
      + '?X-Amz-Algorithm=AWS4-HMAC-SHA256'
      + '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request'
      + '&X-Amz-Date=20130524T000000Z'
      + '&X-Amz-Expires=86400'
      + '&X-Amz-SignedHeaders=host'
      + '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })

  it('generates browser-compatible R2 presigned PUT URLs signing content-type and host only', async () => {
    const url = await createR2PresignedPutUrl({
      key: `${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`,
      contentType: 'image/jpeg; charset=binary',
      contentLength: 1_234_567,
      expiresInSeconds: 300,
      now: new Date('2026-11-26T12:00:00.000Z'),
      config: TEST_R2_CONFIG,
    })

    const parsed = new URL(url)
    expect(parsed.origin).toBe(`https://${TEST_R2_CONFIG.accountId}.r2.cloudflarestorage.com`)
    expect(parsed.pathname).toBe(`/${TEST_R2_CONFIG.bucketName}/${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)
    expect(parsed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(parsed.searchParams.get('X-Amz-Credential')).toBe(
      `${TEST_R2_CONFIG.accessKeyId}/20261126/auto/s3/aws4_request`,
    )
    expect(parsed.searchParams.get('X-Amz-Date')).toBe('20261126T120000Z')
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host')
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(url).not.toContain(TEST_R2_CONFIG.secretAccessKey)
  })

  it('generates R2 presigned GET URLs with 1-hour default TTL and rejects unsafe keys', async () => {
    const url = await createR2PresignedGetUrl({
      key: `${TEST_ALBUM_ID}/${TEST_FILE_2}.gif`,
      now: new Date('2026-11-26T12:00:00.000Z'),
      config: TEST_R2_CONFIG,
    })

    const parsed = new URL(url)
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(parsed.searchParams.get('X-Amz-SignedHeaders')).toBe('host')
    expect(parsed.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)

    await expect(
      createR2PresignedGetUrl({ key: '../secret.txt', config: TEST_R2_CONFIG }),
    ).rejects.toThrow('Invalid R2 object key.')
    await expect(
      createR2PresignedPutUrl({
        key: `${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`,
        contentType: 'image/jpeg',
        expiresInSeconds: 0,
        config: TEST_R2_CONFIG,
      }),
    ).rejects.toThrow('Invalid presigned PUT expiry.')
  })
})

describe('R2 configuration & storage path security checks', () => {
  it('validates R2 env configuration strictly', () => {
    const validEnv = new Map<string, string>([
      ['R2_ACCOUNT_ID', TEST_R2_CONFIG.accountId],
      ['R2_ACCESS_KEY_ID', TEST_R2_CONFIG.accessKeyId],
      ['R2_SECRET_ACCESS_KEY', TEST_R2_CONFIG.secretAccessKey],
      ['R2_BUCKET_NAME', TEST_R2_CONFIG.bucketName],
    ])
    expect(isR2Configured((k) => validEnv.get(k))).toBe(true)
    expect(readR2Config((k) => validEnv.get(k))).toEqual(TEST_R2_CONFIG)

    validEnv.delete('R2_SECRET_ACCESS_KEY')
    expect(isR2Configured((k) => validEnv.get(k))).toBe(false)

    // Rejects SSRF / host injection in accountId or bucketName
    const poisonedEnv = new Map<string, string>([
      ['R2_ACCOUNT_ID', 'evil.com/path#'],
      ['R2_ACCESS_KEY_ID', 'key'],
      ['R2_SECRET_ACCESS_KEY', 'secret'],
      ['R2_BUCKET_NAME', 'valid-bucket'],
    ])
    expect(isR2Configured((k) => poisonedEnv.get(k))).toBe(false)
  })

  it('distinguishes r2: paths from legacy Supabase paths and prevents traversal', () => {
    expect(isR2StoragePath(`r2:${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)).toBe(true)
    expect(isR2StoragePath(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)).toBe(false)
    expect(stripR2Prefix(`r2:${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)).toBe(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)
    expect(stripR2Prefix(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)).toBe(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)

    expect(isSafeR2Key(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`)).toBe(true)
    expect(isSafeR2Key('/leading/slash.jpg')).toBe(false)
    expect(isSafeR2Key('trailing/slash/')).toBe(false)
    expect(isSafeR2Key('album/../other.jpg')).toBe(false)
    expect(isSafeR2Key('album//double.jpg')).toBe(false)
    expect(isSafeR2Key('album\\back.jpg')).toBe(false)
    expect(isSafeR2Key('album/file.jpg?x=1')).toBe(false)
    expect(encodeS3Key('album-1/file name!.jpg')).toBe('album-1/file%20name%21.jpg')

    expect(isSafeAlbumR2Path(`r2:${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`, TEST_ALBUM_ID)).toBe(true)
    expect(isSafeAlbumR2Path(`r2:${TEST_ALBUM_ID}/${TEST_FILE_1}.svg`, TEST_ALBUM_ID)).toBe(false)
    expect(isSafeAlbumR2Path(`r2:11111111-1111-1111-1111-111111111111/${TEST_FILE_1}.jpg`, TEST_ALBUM_ID)).toBe(false)
    expect(isSafeAlbumR2Path(`r2:${TEST_ALBUM_ID}/../${TEST_FILE_1}.jpg`, TEST_ALBUM_ID)).toBe(false)
    expect(isSafeAlbumR2Path(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`, TEST_ALBUM_ID)).toBe(false)
  })

  it('enforces the 9.5 GB default R2 hard storage cap and validates overrides safely', () => {
    expect(DEFAULT_R2_MAX_STORAGE_BYTES).toBe(9_500_000_000)

    expect(parseR2MaxStorageBytes(undefined)).toBe(9_500_000_000)
    expect(parseR2MaxStorageBytes('')).toBe(9_500_000_000)
    expect(parseR2MaxStorageBytes('  ')).toBe(9_500_000_000)
    expect(parseR2MaxStorageBytes('5000000000')).toBe(5_000_000_000)
    expect(parseR2MaxStorageBytes('0')).toBe(0)

    // Malformed, negative, or unsafe values fall back to default cap
    expect(parseR2MaxStorageBytes('-100')).toBe(9_500_000_000)
    expect(parseR2MaxStorageBytes('9.5gb')).toBe(9_500_000_000)
    expect(parseR2MaxStorageBytes('99999999999999999999')).toBe(9_500_000_000)

    // Exact boundary behavior
    expect(hasR2StorageCapacity(9_490_000_000, 10_000_000)).toBe(true)
    expect(hasR2StorageCapacity(9_490_000_000, 10_000_001)).toBe(false)
    expect(hasR2StorageCapacity(9_500_000_000, 1)).toBe(false)

    // Kill-switch (0) and invalid numbers fail closed
    expect(hasR2StorageCapacity(0, 1024, 0)).toBe(false)
    expect(hasR2StorageCapacity(0, 0, 0)).toBe(false)
    expect(hasR2StorageCapacity(-1, 100)).toBe(false)
    expect(hasR2StorageCapacity(Number.NaN, 100)).toBe(false)
    expect(hasR2StorageCapacity(0, Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('R2 server-side HTTP client (PUT / HEAD / DELETE)', () => {
  it('signs PUT with real SHA-256 payload hash and sanitizes errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 200, headers: { etag: '"abc123"' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const payload = new Uint8Array([1, 2, 3, 4])
    const expectedHash = await sha256Hex(payload)
    const result = await putR2Object({
      key: `${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`,
      body: payload,
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=3600',
      now: new Date('2026-11-26T12:00:00.000Z'),
      config: TEST_R2_CONFIG,
    })

    expect(result.etag).toBe('"abc123"')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toBe(
      `https://${TEST_R2_CONFIG.accountId}.r2.cloudflarestorage.com/${TEST_R2_CONFIG.bucketName}/${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`,
    )
    const headers = init.headers as Record<string, string>
    expect(headers['x-amz-content-sha256']).toBe(expectedHash)
    expect(headers.Authorization).toContain('AWS4-HMAC-SHA256 Credential=')
    expect(headers.Authorization).toContain('SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date')

    fetchMock.mockResolvedValueOnce(new Response('Internal bucket error', { status: 500 }))
    await expect(
      putR2Object({
        key: `${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`,
        body: payload,
        contentType: 'image/jpeg',
        config: TEST_R2_CONFIG,
      }),
    ).rejects.toThrow('R2 PUT failed with status 500.')
  })

  it('verifies object existence, size, and MIME via HEAD and handles 404 cleanly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: {
            'content-length': '204800',
            'content-type': 'image/jpeg; charset=utf-8',
            etag: '"etag-1"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const existing = await headR2Object(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`, { config: TEST_R2_CONFIG })
    expect(existing).toEqual({
      exists: true,
      contentLength: 204800,
      contentType: 'image/jpeg',
      etag: '"etag-1"',
    })
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((firstInit.headers as Record<string, string>)['x-amz-content-sha256']).toBe(EMPTY_SHA256_HEX)

    const missing = await headR2Object(`${TEST_ALBUM_ID}/${TEST_FILE_2}.gif`, { config: TEST_R2_CONFIG })
    expect(missing).toEqual({
      exists: false,
      contentLength: null,
      contentType: null,
      etag: null,
    })
  })

  it('treats DELETE 204 and 404 as idempotent success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteR2Object(`${TEST_ALBUM_ID}/${TEST_FILE_1}.jpg`, { config: TEST_R2_CONFIG })).resolves.toBeUndefined()
    await expect(deleteR2Object(`${TEST_ALBUM_ID}/${TEST_FILE_2}.gif`, { config: TEST_R2_CONFIG })).resolves.toBeUndefined()
  })
})

describe('HMAC-SHA256 uploadToken & constant-time verification', () => {
  const secret = 'test-service-role-secret-value'
  const baseTime = 1_764_158_400_000

  it('binds uploadToken cryptographically to albumId, shareCode, expiry, and exact file manifest', async () => {
    const { token, manifestHash } = await createUploadToken({
      albumId: TEST_ALBUM_ID,
      shareCode: 'd44092abc123',
      files: SAMPLE_MANIFEST,
      secret,
      nowMs: baseTime,
      ttlMs: 10 * 60 * 1000,
    })

    expect(token).not.toContain(secret)
    expect(manifestHash).toBe(await computeUploadManifestHash(SAMPLE_MANIFEST))

    // Valid verification within TTL (even if client submits manifest array shuffled)
    expect(
      await verifyUploadToken({
        token,
        albumId: TEST_ALBUM_ID,
        shareCode: 'd44092abc123',
        files: [SAMPLE_MANIFEST[2], SAMPLE_MANIFEST[0], SAMPLE_MANIFEST[1]],
        secret,
        nowMs: baseTime + 5 * 60 * 1000,
      }),
    ).toBe(true)

    // Expired token is rejected
    expect(
      await verifyUploadToken({
        token,
        albumId: TEST_ALBUM_ID,
        shareCode: 'd44092abc123',
        files: SAMPLE_MANIFEST,
        secret,
        nowMs: baseTime + 10 * 60 * 1000,
      }),
    ).toBe(false)

    // Wrong albumId (IDOR attempt) is rejected
    expect(
      await verifyUploadToken({
        token,
        albumId: '11111111-1111-1111-1111-111111111111',
        shareCode: 'd44092abc123',
        files: SAMPLE_MANIFEST,
        secret,
        nowMs: baseTime + 1000,
      }),
    ).toBe(false)

    // Tampered storagePath is rejected
    const tamperedFiles = SAMPLE_MANIFEST.map((file, idx) =>
      idx === 0 ? { ...file, storagePath: `r2:${TEST_ALBUM_ID}/99999999-9999-9999-9999-999999999999.jpg` } : file,
    )
    expect(
      await verifyUploadToken({
        token,
        albumId: TEST_ALBUM_ID,
        shareCode: 'd44092abc123',
        files: tamperedFiles,
        secret,
        nowMs: baseTime + 1000,
      }),
    ).toBe(false)

    // Wrong secret is rejected
    expect(
      await verifyUploadToken({
        token,
        albumId: TEST_ALBUM_ID,
        shareCode: 'd44092abc123',
        files: SAMPLE_MANIFEST,
        secret: 'different-secret',
        nowMs: baseTime + 1000,
      }),
    ).toBe(false)
  })

  it('verifies abort tokens against albumId, shareCode, and expiry without requiring full manifest', async () => {
    const { token } = await createUploadToken({
      albumId: TEST_ALBUM_ID,
      shareCode: 'd44092abc123',
      files: SAMPLE_MANIFEST,
      secret,
      nowMs: baseTime,
    })

    expect(
      await verifyUploadTokenForAbort({
        token,
        albumId: TEST_ALBUM_ID,
        shareCode: 'd44092abc123',
        secret,
        nowMs: baseTime + 30_000,
      }),
    ).toBe(true)

    expect(
      await verifyUploadTokenForAbort({
        token,
        albumId: TEST_ALBUM_ID,
        shareCode: 'othercode999',
        secret,
        nowMs: baseTime + 30_000,
      }),
    ).toBe(false)

    expect(timingSafeEqual('abcdef', 'abcdef')).toBe(true)
    expect(timingSafeEqual('abcdef', 'abcdeg')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(false)
  })
})

describe('CORS origin validation & bounded parallel concurrency', () => {
  it('enforces exact origin matching and blocks prefix or subdomain bypasses', () => {
    const allowed = parseAllowedOrigins(
      'https://photobooth-itmo.vercel.app/, https://booth.example.com, http://insecure.example.com, not-a-url',
    )
    expect(allowed).toEqual(['https://photobooth-itmo.vercel.app', 'https://booth.example.com'])

    expect(isAllowedOrigin('https://photobooth-itmo.vercel.app', allowed)).toBe(true)
    expect(isAllowedOrigin('https://booth.example.com', allowed)).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173', allowed)).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:4174', allowed)).toBe(true)

    expect(isAllowedOrigin(null, allowed)).toBe(false)
    expect(isAllowedOrigin('https://photobooth-itmo.vercel.app.evil.com', allowed)).toBe(false)
    expect(isAllowedOrigin('https://sub.photobooth-itmo.vercel.app', allowed)).toBe(false)
    expect(isAllowedOrigin('https://photobooth-itmo.vercel.app/extra', allowed)).toBe(false)
    expect(isAllowedOrigin('http://photobooth-itmo.vercel.app', allowed)).toBe(false)
  })

  it('runs tasks in parallel with bounded concurrency and preserves result order', async () => {
    let active = 0
    let maxActive = 0
    const inputs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

    const outputs = await runWithConcurrency(inputs, 5, async (value) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      // Reverse delay so later items finish earlier, verifying output ordering
      await new Promise((done) => setTimeout(done, (10 - value) * 2))
      active -= 1
      return value * 10
    })

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(5)
    expect(outputs).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90])
  })

  it('stops scheduling new tasks after an error while settling in-flight workers cleanly', async () => {
    const started: number[] = []
    const settled: number[] = []

    await expect(
      runWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
        started.push(value)
        if (value === 0) {
          await new Promise((done) => setTimeout(done, 5))
          throw new Error('boom-0')
        }
        await new Promise((done) => setTimeout(done, 20))
        settled.push(value)
        return value
      }),
    ).rejects.toThrow('boom-0')

    // Worker 1 was already in-flight alongside worker 0 and must settle before rejection;
    // remaining items (2..5) must not start.
    expect(started).toEqual([0, 1])
    expect(settled).toEqual([1])
  })
})

describe('Vercel deployment & CSP configuration integrity', () => {
  it('keeps SPA rewrite, immutable asset caching, and exact inline script CSP SHA-256 hash in sync', async () => {
    const vercelConfig = JSON.parse(vercelJsonRaw) as {
      rewrites: Array<{ source: string; destination: string }>
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
    }
    const scriptMatch = indexHtmlRaw.match(/<script>([\s\S]*?)<\/script>/)
    expect(scriptMatch).not.toBeNull()

    const normalizedScript = scriptMatch![1].replace(/\r\n/g, '\n')
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedScript)),
    )
    const base64Digest = btoa(String.fromCharCode(...digest))
    const expectedHash = `sha256-${base64Digest}`

    expect(vercelConfig.rewrites).toEqual([
      {
        source: '/((?!assets/|_vercel/|favicon\\.svg|robots\\.txt).*)',
        destination: '/index.html',
      },
    ])

    const globalRule = vercelConfig.headers.find((entry) => entry.source === '/(.*)')
    expect(globalRule).toBeDefined()
    const headerMap = new Map(globalRule!.headers.map((h) => [h.key, h.value]))
    expect(headerMap.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headerMap.get('X-Frame-Options')).toBe('DENY')
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(headerMap.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')

    const csp = headerMap.get('Content-Security-Policy') ?? ''
    expect(csp).toContain(`'${expectedHash}'`)
    expect(csp).toContain('https://*.supabase.co')
    expect(csp).toContain('https://*.r2.cloudflarestorage.com')
    expect(csp).toContain('https://fonts.googleapis.com')
    expect(csp).toContain('https://fonts.gstatic.com')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")

    const assetRule = vercelConfig.headers.find((entry) => entry.source === '/assets/(.*)')
    expect(assetRule?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    })
  })
})
