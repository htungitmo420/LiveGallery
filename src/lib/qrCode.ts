/**
 * Pure TypeScript ISO/IEC 18004 Byte-mode QR Code encoder (Versions 1–12, EC Level M).
 * Supports URLs up to 287 UTF-8 bytes with crisp SVG path output and zero runtime dependencies.
 */

interface VersionSpec {
  version: number
  dataCodewords: number
  ecPerBlock: number
  group1Blocks: number
  group1Data: number
  group2Blocks: number
  group2Data: number
}

// ISO/IEC 18004 Table 9 — Error Correction Level M (15% recovery), Versions 1–12
const VERSION_SPECS_M: readonly VersionSpec[] = [
  { version: 1, dataCodewords: 16, ecPerBlock: 10, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
  { version: 2, dataCodewords: 28, ecPerBlock: 16, group1Blocks: 1, group1Data: 28, group2Blocks: 0, group2Data: 0 },
  { version: 3, dataCodewords: 44, ecPerBlock: 26, group1Blocks: 1, group1Data: 44, group2Blocks: 0, group2Data: 0 },
  { version: 4, dataCodewords: 64, ecPerBlock: 18, group1Blocks: 2, group1Data: 32, group2Blocks: 0, group2Data: 0 },
  { version: 5, dataCodewords: 86, ecPerBlock: 24, group1Blocks: 2, group1Data: 43, group2Blocks: 0, group2Data: 0 },
  { version: 6, dataCodewords: 108, ecPerBlock: 16, group1Blocks: 4, group1Data: 27, group2Blocks: 0, group2Data: 0 },
  { version: 7, dataCodewords: 124, ecPerBlock: 18, group1Blocks: 4, group1Data: 31, group2Blocks: 0, group2Data: 0 },
  { version: 8, dataCodewords: 154, ecPerBlock: 22, group1Blocks: 2, group1Data: 38, group2Blocks: 2, group2Data: 39 },
  { version: 9, dataCodewords: 182, ecPerBlock: 22, group1Blocks: 3, group1Data: 36, group2Blocks: 2, group2Data: 37 },
  { version: 10, dataCodewords: 216, ecPerBlock: 26, group1Blocks: 4, group1Data: 43, group2Blocks: 1, group2Data: 44 },
  { version: 11, dataCodewords: 254, ecPerBlock: 30, group1Blocks: 1, group1Data: 50, group2Blocks: 4, group2Data: 51 },
  { version: 12, dataCodewords: 290, ecPerBlock: 22, group1Blocks: 6, group1Data: 36, group2Blocks: 2, group2Data: 37 },
]

// ISO/IEC 18004 Annex E — Alignment pattern center coordinates
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

// GF(256) lookup tables with primitive polynomial 0x11d
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let value = 1
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value
    GF_LOG[value] = i
    value <<= 1
    if (value & 0x100) value ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255]
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1)
    const factor = GF_EXP[i]
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], factor)
    }
    poly = next
  }
  return poly
}

function rsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount)
  const remainder = new Uint8Array(ecCount)
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ remainder[0]
    for (let j = 0; j < ecCount - 1; j += 1) {
      remainder[j] = remainder[j + 1]
    }
    remainder[ecCount - 1] = 0
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j += 1) {
        remainder[j] ^= gfMul(gen[j + 1], factor)
      }
    }
  }
  return remainder
}

function selectVersion(byteLength: number): VersionSpec {
  for (const spec of VERSION_SPECS_M) {
    const countBits = spec.version <= 9 ? 8 : 16
    const maxBytes = (spec.dataCodewords * 8 - 4 - countBits) >> 3
    if (byteLength <= maxBytes) return spec
  }
  throw new Error('QR payload exceeds supported length.')
}

function encodeDataCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const bits: number[] = []
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >>> i) & 1)
    }
  }

  // Mode indicator: Byte mode (0100)
  pushBits(0b0100, 4)
  // Character count indicator
  const countBits = spec.version <= 9 ? 8 : 16
  pushBits(bytes.length, countBits)
  // Payload bytes
  for (let i = 0; i < bytes.length; i += 1) {
    pushBits(bytes[i], 8)
  }

  const totalBits = spec.dataCodewords * 8
  // Terminator (up to 4 zero bits)
  const terminatorLen = Math.min(4, totalBits - bits.length)
  for (let i = 0; i < terminatorLen; i += 1) bits.push(0)
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords = new Uint8Array(spec.dataCodewords)
  let byteIndex = 0
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let b = 0; b < 8; b += 1) {
      value = (value << 1) | bits[i + b]
    }
    codewords[byteIndex] = value
    byteIndex += 1
  }

  // Alternating pad bytes 0xEC and 0x11
  const padBytes = [0xec, 0x11]
  let padIndex = 0
  while (byteIndex < spec.dataCodewords) {
    codewords[byteIndex] = padBytes[padIndex]
    byteIndex += 1
    padIndex ^= 1
  }

  return codewords
}

function buildFinalCodewords(dataCodewords: Uint8Array, spec: VersionSpec): Uint8Array {
  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  let offset = 0

  for (let i = 0; i < spec.group1Blocks; i += 1) {
    const block = dataCodewords.slice(offset, offset + spec.group1Data)
    offset += spec.group1Data
    dataBlocks.push(block)
    ecBlocks.push(rsComputeRemainder(block, spec.ecPerBlock))
  }
  for (let i = 0; i < spec.group2Blocks; i += 1) {
    const block = dataCodewords.slice(offset, offset + spec.group2Data)
    offset += spec.group2Data
    dataBlocks.push(block)
    ecBlocks.push(rsComputeRemainder(block, spec.ecPerBlock))
  }

  const maxDataLen = Math.max(spec.group1Data, spec.group2Data)
  const totalBlocks = spec.group1Blocks + spec.group2Blocks
  const finalBytes = new Uint8Array(spec.dataCodewords + totalBlocks * spec.ecPerBlock)
  let out = 0

  for (let i = 0; i < maxDataLen; i += 1) {
    for (let b = 0; b < dataBlocks.length; b += 1) {
      if (i < dataBlocks[b].length) {
        finalBytes[out] = dataBlocks[b][i]
        out += 1
      }
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (let b = 0; b < ecBlocks.length; b += 1) {
      finalBytes[out] = ecBlocks[b][i]
      out += 1
    }
  }

  return finalBytes
}

function computeFormatBits(mask: number): number {
  // Error Correction Level M = 0b00
  const data = (0b00 << 3) | (mask & 0b111)
  let rem = data << 10
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) {
      rem ^= 0x537 << (i - 10)
    }
  }
  return ((data << 10) | rem) ^ 0x5412
}

function computeVersionBits(version: number): number {
  let rem = version << 12
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >>> i) & 1) {
      rem ^= 0x1f25 << (i - 12)
    }
  }
  return (version << 12) | rem
}

function placeFunctionPatterns(size: number, version: number): {
  modules: Uint8Array
  isFunction: Uint8Array
} {
  const modules = new Uint8Array(size * size)
  const isFunction = new Uint8Array(size * size)

  const setFn = (row: number, col: number, dark: boolean) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return
    const idx = row * size + col
    modules[idx] = dark ? 1 : 0
    isFunction[idx] = 1
  }

  // Finder patterns + 1-module separators
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6
        const border = r === 0 || r === 6 || c === 0 || c === 6
        const center = r >= 2 && r <= 4 && c >= 2 && c <= 4
        setFn(top + r, left + c, inside && (border || center))
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, size - 7)
  drawFinder(size - 7, 0)

  // Timing patterns
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0
    setFn(6, i, dark)
    setFn(i, 6, dark)
  }

  // Alignment patterns
  const centers = ALIGNMENT_CENTERS[version]
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = 0; j < centers.length; j += 1) {
      const isTopLeft = i === 0 && j === 0
      const isTopRight = i === 0 && j === centers.length - 1
      const isBottomLeft = i === centers.length - 1 && j === 0
      if (isTopLeft || isTopRight || isBottomLeft) continue
      const cr = centers[i]
      const cc = centers[j]
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc))
          setFn(cr + dr, cc + dc, dist === 2 || dist === 0)
        }
      }
    }
  }

  // Reserve format info areas + fixed dark module
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      setFn(8, i, false)
      setFn(i, 8, false)
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setFn(8, size - 1 - i, false)
  }
  for (let i = 0; i < 7; i += 1) {
    setFn(size - 1 - i, 8, false)
  }
  setFn(size - 8, 8, true)

  // Version info areas (Version >= 7)
  if (version >= 7) {
    const vBits = computeVersionBits(version)
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const dark = ((vBits >>> (i * 3 + j)) & 1) === 1
        setFn(size - 11 + j, i, dark)
        setFn(i, size - 11 + j, dark)
      }
    }
  }

  return { modules, isFunction }
}

function drawFormatInfo(modules: Uint8Array, size: number, mask: number): void {
  const bits = computeFormatBits(mask)
  const set = (row: number, col: number, bitIndex: number) => {
    modules[row * size + col] = (bits >>> bitIndex) & 1
  }

  // First copy around top-left finder (bit 14 at (8,0) down to bit 0 at (0,8))
  const tlCoords: readonly (readonly [number, number])[] = [
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
    [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  ]
  for (let bit = 0; bit < 15; bit += 1) {
    const [r, c] = tlCoords[bit]
    set(r, c, bit)
  }

  // Second copy along top-right and bottom-left finders
  for (let i = 0; i < 8; i += 1) {
    set(8, size - 1 - i, i)
  }
  for (let i = 0; i < 7; i += 1) {
    set(size - 7 + i, 8, 8 + i)
  }
}

function placeCodewords(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  codewords: Uint8Array,
): void {
  let bitIndex = 0
  const totalBits = codewords.length * 8
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (let dx = 0; dx < 2; dx += 1) {
        const col = right - dx
        const idx = row * size + col
        if (isFunction[idx]) continue
        let dark = 0
        if (bitIndex < totalBits) {
          dark = (codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1
          bitIndex += 1
        }
        modules[idx] = dark
      }
    }
    upward = !upward
  }
}

function shouldFlipMask(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0
    case 1: return row % 2 === 0
    case 2: return col % 3 === 0
    case 3: return (row + col) % 3 === 0
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
    default: return false
  }
}

function countFinderPatternPenalty(line: Uint8Array): number {
  // Check for 10111010000 or 00001011101 (40 points each)
  let score = 0
  for (let i = 0; i <= line.length - 11; i += 1) {
    const matchRight =
      line[i] === 1 && line[i + 1] === 0 && line[i + 2] === 1 && line[i + 3] === 1 &&
      line[i + 4] === 1 && line[i + 5] === 0 && line[i + 6] === 1 && line[i + 7] === 0 &&
      line[i + 8] === 0 && line[i + 9] === 0 && line[i + 10] === 0
    const matchLeft =
      line[i] === 0 && line[i + 1] === 0 && line[i + 2] === 0 && line[i + 3] === 0 &&
      line[i + 4] === 1 && line[i + 5] === 0 && line[i + 6] === 1 && line[i + 7] === 1 &&
      line[i + 8] === 1 && line[i + 9] === 0 && line[i + 10] === 1
    if (matchRight || matchLeft) score += 40
  }
  return score
}

function computePenaltyScore(modules: Uint8Array, size: number): number {
  let penalty = 0
  const line = new Uint8Array(size)

  // Rule 1 & 3 (rows)
  for (let r = 0; r < size; r += 1) {
    let runColor = modules[r * size]
    let runLen = 1
    line[0] = runColor
    for (let c = 1; c < size; c += 1) {
      const value = modules[r * size + c]
      line[c] = value
      if (value === runColor) {
        runLen += 1
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5)
        runColor = value
        runLen = 1
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5)
    penalty += countFinderPatternPenalty(line)
  }

  // Rule 1 & 3 (columns)
  for (let c = 0; c < size; c += 1) {
    let runColor = modules[c]
    let runLen = 1
    line[0] = runColor
    for (let r = 1; r < size; r += 1) {
      const value = modules[r * size + c]
      line[r] = value
      if (value === runColor) {
        runLen += 1
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5)
        runColor = value
        runLen = 1
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5)
    penalty += countFinderPatternPenalty(line)
  }

  // Rule 2: 2x2 uniform blocks
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = modules[r * size + c]
      if (
        v === modules[r * size + c + 1] &&
        v === modules[(r + 1) * size + c] &&
        v === modules[(r + 1) * size + c + 1]
      ) {
        penalty += 3
      }
    }
  }

  // Rule 4: Balance of dark and light modules
  let darkCount = 0
  const total = size * size
  for (let i = 0; i < total; i += 1) darkCount += modules[i]
  const percent = (darkCount * 100) / total
  const k = Math.floor(Math.abs(percent - 50) / 5)
  penalty += k * 10

  return penalty
}

export interface QrMatrix {
  version: number
  size: number
  mask: number
  modules: Uint8Array
}

export function encodeQrCode(text: string): QrMatrix {
  if (!text) {
    throw new Error('QR payload cannot be empty.')
  }
  const bytes = new TextEncoder().encode(text)
  const spec = selectVersion(bytes.length)
  const size = spec.version * 4 + 17
  const dataCodewords = encodeDataCodewords(bytes, spec)
  const finalCodewords = buildFinalCodewords(dataCodewords, spec)
  const { modules: baseModules, isFunction } = placeFunctionPatterns(size, spec.version)
  placeCodewords(baseModules, isFunction, size, finalCodewords)

  let bestMask = 0
  let bestScore = Number.POSITIVE_INFINITY
  let bestModules = baseModules

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = baseModules.slice()
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const idx = r * size + c
        if (!isFunction[idx] && shouldFlipMask(mask, r, c)) {
          candidate[idx] ^= 1
        }
      }
    }
    drawFormatInfo(candidate, size, mask)
    const score = computePenaltyScore(candidate, size)
    if (score < bestScore) {
      bestScore = score
      bestMask = mask
      bestModules = candidate
    }
  }

  return {
    version: spec.version,
    size,
    mask: bestMask,
    modules: bestModules,
  }
}

export function qrMatrixToSvgPath(matrix: QrMatrix, quietZone = 4): {
  viewBoxSize: number
  pathData: string
} {
  const { size, modules } = matrix
  const segments: string[] = []
  for (let r = 0; r < size; r += 1) {
    let c = 0
    while (c < size) {
      if (modules[r * size + c] === 1) {
        const start = c
        while (c < size && modules[r * size + c] === 1) c += 1
        const run = c - start
        segments.push(`M${start + quietZone} ${r + quietZone}h${run}v1h-${run}z`)
      } else {
        c += 1
      }
    }
  }
  return {
    viewBoxSize: size + quietZone * 2,
    pathData: segments.join(''),
  }
}
