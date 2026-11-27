export const EMPTY_SHA256_HEX = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

const encoder = new TextEncoder()

export function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer
  }
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function utf8(text: string): Uint8Array {
  return encoder.encode(text)
}

export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += 1) {
    out += bytes[index].toString(16).padStart(2, '0')
  }
  return out
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString()
  // YYYY-MM-DDTHH:mm:ss.sssZ -> YYYYMMDDTHHMMSSZ
  const dateStamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`
  const timeStamp = `${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`
  return {
    amzDate: `${dateStamp}T${timeStamp}Z`,
    dateStamp,
  }
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? utf8(data) : data
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))
  return toHex(new Uint8Array(digest))
}

export async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, toArrayBuffer(utf8(message)))
  return new Uint8Array(signature)
}

export async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  return toHex(await hmacSha256(key, message))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}
