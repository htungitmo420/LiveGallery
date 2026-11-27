import { describe, expect, it } from 'vitest'
import { encodeQrCode, qrMatrixToSvgPath, type QrMatrix } from '../src/lib/qrCode'

// ISO/IEC 18004 golden format strings for EC Level M (00), masks 0..7
const EXPECTED_FORMAT_BITS_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
]

// ISO/IEC 18004 Annex D golden version strings (Versions 7..12)
const EXPECTED_VERSION_BITS: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
  11: 0x0bbf6,
  12: 0x0c762,
}

const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
]

const VERSION_BLOCKS_M: Record<number, [number, number, number, number, number]> = {
  // version: [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data]
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51],
  12: [22, 6, 36, 2, 37],
}

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let v = 1
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = v
    GF_LOG[v] = i
    v <<= 1
    if (v & 0x100) v ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255]
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function evalPoly(coeffs: Uint8Array, x: number): number {
  let acc = 0
  for (let i = 0; i < coeffs.length; i += 1) {
    acc = gfMul(acc, x) ^ coeffs[i]
  }
  return acc
}

function maskBit(mask: number, r: number, c: number): number {
  switch (mask) {
    case 0: return (r + c) % 2 === 0 ? 1 : 0
    case 1: return r % 2 === 0 ? 1 : 0
    case 2: return c % 3 === 0 ? 1 : 0
    case 3: return (r + c) % 3 === 0 ? 1 : 0
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0 ? 1 : 0
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0 ? 1 : 0
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0 ? 1 : 0
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0 ? 1 : 0
    default: return 0
  }
}

/**
 * Independent ISO/IEC 18004 decoder/verifier for byte-mode Level M QR matrices.
 * Checks format info, version info, RS syndromes for every block, and decodes UTF-8 payload.
 */
function verifyAndDecodeQrMatrix(qr: QrMatrix): string {
  const { size, version, mask, modules } = qr
  const at = (r: number, c: number) => modules[r * size + c]

  // 1. Dark module invariant
  expect(at(size - 8, 8)).toBe(1)

  // 2. Verify both format info copies against ISO/IEC 18004 table
  const tlCoords: readonly (readonly [number, number])[] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ]
  let formatCopy1 = 0
  for (let bit = 0; bit < 15; bit += 1) {
    const [r, c] = tlCoords[bit]
    formatCopy1 |= at(r, c) << bit
  }
  let formatCopy2 = 0
  for (let i = 0; i < 8; i += 1) formatCopy2 |= at(8, size - 1 - i) << i
  for (let i = 0; i < 7; i += 1) formatCopy2 |= at(size - 7 + i, 8) << (8 + i)

  expect(formatCopy1).toBe(EXPECTED_FORMAT_BITS_M[mask])
  expect(formatCopy2).toBe(EXPECTED_FORMAT_BITS_M[mask])

  // 3. Verify version info blocks when version >= 7
  if (version >= 7) {
    let vTopRight = 0
    let vBottomLeft = 0
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const bit = i * 3 + j
        vTopRight |= at(i, size - 11 + j) << bit
        vBottomLeft |= at(size - 11 + j, i) << bit
      }
    }
    expect(vTopRight).toBe(EXPECTED_VERSION_BITS[version])
    expect(vBottomLeft).toBe(EXPECTED_VERSION_BITS[version])
  }

  // 4. Identify function modules to extract data bits
  const isFn = new Uint8Array(size * size)
  const mark = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) isFn[r * size + c] = 1
  }
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) mark(r, c)
  }
  for (let r = 0; r < 9; r += 1) {
    for (let c = size - 8; c < size; c += 1) mark(r, c)
  }
  for (let r = size - 8; r < size; r += 1) {
    for (let c = 0; c < 9; c += 1) mark(r, c)
  }
  for (let i = 0; i < size; i += 1) {
    mark(6, i)
    mark(i, 6)
  }
  const centers = ALIGNMENT_CENTERS[version]
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = 0; j < centers.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0)) continue
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) mark(centers[i] + dr, centers[j] + dc)
      }
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        mark(i, size - 11 + j)
        mark(size - 11 + j, i)
      }
    }
  }

  // 5. Read zig-zag unmasked bits into codewords
  const [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = VERSION_BLOCKS_M[version]
  const totalBlocks = g1Blocks + g2Blocks
  const totalData = g1Blocks * g1Data + g2Blocks * g2Data
  const totalCodewords = totalData + totalBlocks * ecPerBlock

  const rawBits: number[] = []
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step += 1) {
      const r = upward ? size - 1 - step : step
      for (let dx = 0; dx < 2; dx += 1) {
        const c = right - dx
        if (isFn[r * size + c]) continue
        rawBits.push(at(r, c) ^ maskBit(mask, r, c))
      }
    }
    upward = !upward
  }

  const codewords = new Uint8Array(totalCodewords)
  for (let i = 0; i < totalCodewords; i += 1) {
    let byte = 0
    for (let b = 0; b < 8; b += 1) {
      byte = (byte << 1) | rawBits[i * 8 + b]
    }
    codewords[i] = byte
  }

  // 6. De-interleave blocks & verify Reed-Solomon syndromes === 0 for every block!
  const blockDataLens = [
    ...Array.from({ length: g1Blocks }, () => g1Data),
    ...Array.from({ length: g2Blocks }, () => g2Data),
  ]
  const dataBlocks = blockDataLens.map((len) => new Uint8Array(len))
  const ecBlocks = blockDataLens.map(() => new Uint8Array(ecPerBlock))

  let cursor = 0
  const maxDataLen = Math.max(g1Data, g2Data)
  for (let i = 0; i < maxDataLen; i += 1) {
    for (let b = 0; b < totalBlocks; b += 1) {
      if (i < dataBlocks[b].length) {
        dataBlocks[b][i] = codewords[cursor++]
      }
    }
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (let b = 0; b < totalBlocks; b += 1) {
      ecBlocks[b][i] = codewords[cursor++]
    }
  }

  for (let b = 0; b < totalBlocks; b += 1) {
    const fullBlock = new Uint8Array(dataBlocks[b].length + ecPerBlock)
    fullBlock.set(dataBlocks[b], 0)
    fullBlock.set(ecBlocks[b], dataBlocks[b].length)
    for (let s = 0; s < ecPerBlock; s += 1) {
      expect(evalPoly(fullBlock, GF_EXP[s])).toBe(0)
    }
  }

  // 7. Reassemble data bitstream and decode Byte mode UTF-8 string
  const stream = new Uint8Array(totalData)
  let offset = 0
  for (const block of dataBlocks) {
    stream.set(block, offset)
    offset += block.length
  }
  const bitAt = (index: number) => (stream[index >>> 3] >>> (7 - (index & 7))) & 1
  const readInt = (start: number, len: number) => {
    let val = 0
    for (let i = 0; i < len; i += 1) val = (val << 1) | bitAt(start + i)
    return val
  }

  const mode = readInt(0, 4)
  expect(mode).toBe(0b0100)
  const countBits = version <= 9 ? 8 : 16
  const byteLen = readInt(4, countBits)
  const payload = new Uint8Array(byteLen)
  let pos = 4 + countBits
  for (let i = 0; i < byteLen; i += 1) {
    payload[i] = readInt(pos, 8)
    pos += 8
  }
  return new TextDecoder().decode(payload)
}

describe('ISO/IEC 18004 QR code encoder', () => {
  it('round-trip encodes and verifies short, standard, and long LiveGallery album URLs across versions 1–10', () => {
    const payloads = [
      'D44092', // Version 1
      'https://livegallery.app/i/d44092', // Version 2
      'https://livegallery-itmo.vercel.app/i/a1b2c3d4e5f6', // Version 3/4
      'https://livegallery-itmo.vercel.app/i/a1b2c3d4e5f6?lang=ru', // Version 4
      `https://livegallery-itmo.vercel.app/i/${'a1b2c3d4'.repeat(8)}?lang=en`, // Version 6/7 (110 bytes)
      `https://photobooth-custom-domain.example.com/i/${'z9y8x7w6'.repeat(8)}?lang=ru&src=booth-kiosk-01`, // Version 8+ (version info bits)
      `https://example.com/i/${'0123456789abcdef'.repeat(12)}`, // Version 10 (16-bit char count indicator)
    ]

    for (const url of payloads) {
      const matrix = encodeQrCode(url)
      expect(matrix.size).toBe(matrix.version * 4 + 17)
      expect(matrix.modules).toHaveLength(matrix.size * matrix.size)
      const decoded = verifyAndDecodeQrMatrix(matrix)
      expect(decoded).toBe(url)
    }
  })

  it('produces valid SVG path data with quiet zone padding', () => {
    const matrix = encodeQrCode('https://livegallery-itmo.vercel.app/i/d44092')
    const svg = qrMatrixToSvgPath(matrix, 4)

    expect(svg.viewBoxSize).toBe(matrix.size + 8)
    expect(svg.pathData.startsWith('M4 4h7v1h-7z')).toBe(true) // Top-left finder top row
    expect(svg.pathData.length).toBeGreaterThan(100)
  })

  it('rejects empty or oversized payloads cleanly', () => {
    expect(() => encodeQrCode('')).toThrow()
    expect(() => encodeQrCode('a'.repeat(300))).toThrow()
  })
})
