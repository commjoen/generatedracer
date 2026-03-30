/**
 * qrcode.js – Compact QR Code generator (byte mode, error correction level L)
 * Self-contained, no external dependencies. Renders to a <canvas> element.
 *
 * Public API:
 *   QRCode.toCanvas(canvas, text [, size])
 *     canvas – an HTMLCanvasElement (or any object with getContext('2d'))
 *     text   – string to encode (UTF-8)
 *     size   – canvas pixel size (default 200)
 *
 * Based on the QR Code specification ISO/IEC 18004.
 * MIT License.
 */
const QRCode = (function () {
  'use strict';

  // ── GF(256) arithmetic ───────────────────────────────────────────────────
  // Primitive polynomial: x^8 + x^4 + x^3 + x^2 + 1  (0x11D)
  const EXP = new Uint8Array(512);
  const LOG  = new Uint8Array(256);
  (function () {
    let v = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = EXP[i + 255] = v;
      LOG[v] = i;
      v = v < 128 ? v << 1 : (v << 1) ^ 0x11D;
    }
  })();

  function gfMul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  /** Build RS generator polynomial for ecLen error-correction codewords. */
  function gfGenPoly(ecLen) {
    let p = [1];
    for (let i = 0; i < ecLen; i++) {
      const np = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        np[j]     ^= gfMul(p[j], EXP[i]);
        np[j + 1] ^= p[j];
      }
      p = np;
    }
    return p;
  }

  /** Compute ecLen Reed-Solomon error-correction codewords for data[]. */
  function rsEncode(data, ecLen) {
    const gen = gfGenPoly(ecLen);
    const msg = [...data, ...new Array(ecLen).fill(0)];
    for (let i = 0; i < data.length; i++) {
      if (!msg[i]) continue;
      for (let j = 1; j < gen.length; j++) msg[i + j] ^= gfMul(msg[i], gen[j]);
    }
    return msg.slice(data.length);
  }

  // ── RS block table (EC level L only) ─────────────────────────────────────
  // Each entry: [n1,t1,d1, n2,t2,d2?]
  //   n = number of blocks of this type
  //   t = total codewords per block
  //   d = data codewords per block  (ec = t − d)
  const RS_L = [
    /* v1 */ [1,26,19],
    /* v2 */ [1,44,34],
    /* v3 */ [1,70,55],
    /* v4 */ [1,100,80],
    /* v5 */ [1,134,108],
    /* v6 */ [2,86,68],
    /* v7 */ [2,98,78],
    /* v8 */ [2,121,97],
    /* v9 */ [2,146,116],
    /* v10*/ [2,86,68, 2,87,69],
    /* v11*/ [4,101,81],
    /* v12*/ [2,116,92, 2,117,93],
    /* v13*/ [4,133,107],
    /* v14*/ [3,145,115, 1,146,116],
    /* v15*/ [5,109,87,  1,110,88],
    /* v16*/ [5,122,98,  1,123,99],
    /* v17*/ [1,135,107, 5,136,108],
    /* v18*/ [5,150,120, 1,151,121],
    /* v19*/ [3,141,113, 4,142,114],
    /* v20*/ [3,135,107, 5,136,108],
    /* v21*/ [4,144,116, 4,145,117],
    /* v22*/ [2,139,111, 7,140,112],
    /* v23*/ [4,151,121, 5,152,122],
    /* v24*/ [6,147,117, 4,148,118],
    /* v25*/ [8,132,106, 4,133,107],
    /* v26*/ [10,142,114,2,143,115],
    /* v27*/ [8,152,122, 4,153,123],
    /* v28*/ [3,147,117, 10,148,118],
    /* v29*/ [7,146,116, 7,147,117],
    /* v30*/ [5,145,115, 10,146,116],
    /* v31*/ [13,145,115,3,146,116],
    /* v32*/ [17,145,115],
    /* v33*/ [17,145,115,1,146,116],
    /* v34*/ [13,145,115,6,146,116],
    /* v35*/ [12,151,121,7,152,122],
    /* v36*/ [6,151,121, 14,152,122],
    /* v37*/ [17,152,122,4,153,123],
    /* v38*/ [4,152,122, 18,153,123],
    /* v39*/ [20,147,117,4,148,118],
    /* v40*/ [19,148,118,6,149,119],
  ];

  /** Returns [{total, data}] block descriptors for the given version at level L. */
  function getBlocks(ver) {
    const t = RS_L[ver - 1];
    const blocks = [];
    for (let i = 0; i < t.length; i += 3)
      for (let j = 0; j < t[i]; j++) blocks.push({ total: t[i+1], data: t[i+2] });
    return blocks;
  }

  // ── Data capacity (bytes) per version, level L ────────────────────────────
  const CAP_L = [0,
    17,32,53,78,106,134,154,192,230,271,
    321,367,425,458,520,586,644,718,792,858,
    929,1003,1091,1171,1273,1367,1465,1528,1628,1722,
    1809,1911,1989,2099,2213,2331,2361,2524,2625,2735,
  ];

  // ── Alignment pattern centre coordinates per version ─────────────────────
  const ALIGN = [
    [],       // v1  – no alignment patterns
    [6,18],[6,22],[6,26],[6,30],[6,34],
    [6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],
    [6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],
    [6,26,50,74],[6,30,54,78],[6,30,56,82],[6,30,58,86],
    [6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],
    [6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],
    [6,30,58,86,114],[6,34,62,90,118],[6,26,50,74,98,122],
    [6,30,54,78,102,126],[6,26,52,78,104,130],[6,30,56,82,108,134],
    [6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],
    [6,30,54,82,110,138,166],[6,24,50,76,102,128,154],
    [6,28,54,80,106,132,158],[6,32,58,84,110,136,162],
    [6,26,54,82,110,138,166],[6,30,58,86,114,142,170],
  ];

  // ── Remainder bits per version ────────────────────────────────────────────
  const REM = [0,
    0,7,7,7,7,7,0,0,0,0,0,0,0,3,3,3,3,3,3,3,
    4,4,4,4,4,4,4,3,3,3,3,3,3,3,0,0,0,0,0,0,
  ];

  // ── UTF-8 encode a string into bytes ─────────────────────────────────────
  function toUTF8(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if      (c < 0x80)   bytes.push(c);
      else if (c < 0x800)  bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else                  bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return bytes;
  }

  // ── Build raw data codeword array for version / text ─────────────────────
  function buildCodewords(text, ver) {
    const bytes  = toUTF8(text);
    const blocks = getBlocks(ver);
    const totalDataCW = blocks.reduce((s, b) => s + b.data, 0);

    // Bit buffer helpers
    const bits = [];
    const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };

    // Mode indicator: 0100 (byte mode)
    push(4, 4);
    // Character count: 8 bits for v1-9, 16 bits for v10+
    push(bytes.length, ver < 10 ? 8 : 16);
    // Data bytes
    for (const b of bytes) push(b, 8);
    // Terminator (up to 4 zero bits)
    push(0, Math.min(4, totalDataCW * 8 - bits.length));
    // Pad to byte boundary
    while (bits.length % 8) bits.push(0);
    // Pad codewords
    const pads = [0xEC, 0x11];
    let pi = 0;
    while (bits.length < totalDataCW * 8) push(pads[pi++ & 1], 8);

    // Convert bits to codeword integers, split into RS blocks
    let off = 0;
    const dcBlocks = blocks.map(({ data }) => {
      const cws = [];
      for (let i = 0; i < data; i++, off += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) b = (b << 1) | (bits[off + j] || 0);
        cws.push(b);
      }
      return cws;
    });

    // Compute EC codewords
    const ecBlocks = dcBlocks.map((cws, i) => rsEncode(cws, blocks[i].total - blocks[i].data));

    // Interleave data then EC
    const maxD  = Math.max(...dcBlocks.map(b => b.length));
    const maxEC = Math.max(...ecBlocks.map(b => b.length));
    const codewords = [];
    for (let i = 0; i < maxD;  i++) for (const blk of dcBlocks) if (i < blk.length) codewords.push(blk[i]);
    for (let i = 0; i < maxEC; i++) for (const blk of ecBlocks) if (i < blk.length) codewords.push(blk[i]);

    return codewords;
  }

  // ── Matrix helpers ────────────────────────────────────────────────────────
  const EMPTY = -1; // unset data cell
  const RSVD  = -2; // reserved (format/version info)

  function makeMatrix(size) {
    return Array.from({ length: size }, () => new Array(size).fill(EMPTY));
  }

  function setFinder(m, row, col) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const r = row + dy, c = col + dx;
        if (r < 0 || r >= m.length || c < 0 || c >= m.length) continue;
        // separator
        if (dy < 0 || dy > 6 || dx < 0 || dx > 6) { m[r][c] = 0; continue; }
        // outer ring
        if (dy === 0 || dy === 6 || dx === 0 || dx === 6) { m[r][c] = 1; continue; }
        // inner square (rows/cols 2-4)
        m[r][c] = (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4) ? 1 : 0;
      }
    }
  }

  function setAlign(m, r, c) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        m[r + dy][c + dx] =
          (dy === -2 || dy === 2 || dx === -2 || dx === 2 || (dy === 0 && dx === 0)) ? 1 : 0;
      }
    }
  }

  // ── Mask patterns ─────────────────────────────────────────────────────────
  function maskBit(pattern, r, c) {
    switch (pattern) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      case 7: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
  }

  // ── Place data + mask into matrix ─────────────────────────────────────────
  function placeData(m, codewords, ver, mask) {
    const size = m.length;
    let bi = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // skip timing column
      for (let ri = 0; ri < size; ri++) {
        const r = upward ? size - 1 - ri : ri;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (m[r][c] !== EMPTY) continue;
          const cw = Math.floor(bi / 8);
          const bitVal = cw < codewords.length ? (codewords[cw] >> (7 - (bi % 8))) & 1 : 0;
          m[r][c] = bitVal ^ (maskBit(mask, r, c) ? 1 : 0);
          bi++;
        }
      }
      upward = !upward;
    }
  }

  // ── Format information (EC level L + mask) ────────────────────────────────
  function placeFormat(m, mask) {
    const size = m.length;
    // EC level L = 01 in binary; data = 0b01_mmm (5 bits)
    const data = (1 << 3) | mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
    const fmt = ((data << 10) | rem) ^ 0x5412;

    // Top-left placement positions (bit 14..0):
    const fmtR = [8,8,8,8,8,8,8,8, 7,5,4,3,2,1,0];
    const fmtC = [0,1,2,3,4,5,7,8, 8,8,8,8,8,8,8];

    for (let k = 0; k < 15; k++) {
      const b = (fmt >> (14 - k)) & 1;
      m[fmtR[k]][fmtC[k]] = b;           // top-left
      if (k < 8) m[8][size - 1 - k] = b; // top-right
      else        m[size - 7 + (k - 8)][8] = b; // bottom-left
    }
    m[size - 8][8] = 1; // dark module
  }

  // ── Version information (versions 7+) ─────────────────────────────────────
  function placeVersion(m, ver) {
    if (ver < 7) return;
    const size = m.length;
    let rem = ver << 12;
    for (let i = 17; i >= 12; i--) if (rem & (1 << i)) rem ^= 0x1F25 << (i - 12);
    const vi = (ver << 12) | rem;

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const b = (vi >> (i * 3 + j)) & 1;
        m[i][size - 11 + j] = b; // top-right block
        m[size - 11 + j][i] = b; // bottom-left block
      }
    }
  }

  // ── Penalty scoring ───────────────────────────────────────────────────────
  function penalty(m) {
    const size = m.length;
    let score = 0;

    // Rule 1: 5+ consecutive same-colour
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { if (++run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }
    for (let c = 0; c < size; c++) {
      let run = 1;
      for (let r = 1; r < size; r++) {
        if (m[r][c] === m[r - 1][c]) { if (++run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }

    // Rule 2: 2×2 same-colour blocks
    for (let r = 0; r < size - 1; r++)
      for (let c = 0; c < size - 1; c++)
        if (m[r][c] === m[r][c+1] && m[r][c] === m[r+1][c] && m[r][c] === m[r+1][c+1]) score += 3;

    // Rule 3: finder-like patterns in rows/cols
    const pat1 = [1,0,1,1,1,0,1,0,0,0,0];
    const pat2 = [0,0,0,0,1,0,1,1,1,0,1];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c <= size - 11; c++) {
        let a = true, b = true;
        for (let k = 0; k < 11; k++) { a = a && m[r][c+k] === pat1[k]; b = b && m[r][c+k] === pat2[k]; }
        if (a || b) score += 40;
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r = 0; r <= size - 11; r++) {
        let a = true, b = true;
        for (let k = 0; k < 11; k++) { a = a && m[r+k][c] === pat1[k]; b = b && m[r+k][c] === pat2[k]; }
        if (a || b) score += 40;
      }
    }

    // Rule 4: proportion of dark modules
    let dark = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c] === 1) dark++;
    const pct = dark / (size * size) * 100;
    score += Math.abs(Math.round(pct / 5) * 5 - 50) / 5 * 10;

    return score;
  }

  // ── Main generate function ────────────────────────────────────────────────
  function generate(text) {
    const bytes = toUTF8(text);

    // Determine minimum version for level L
    let ver = 1;
    while (ver <= 40 && CAP_L[ver] < bytes.length) ver++;
    if (ver > 40) throw new Error('QRCode: data too long (' + bytes.length + ' bytes)');

    const size = ver * 4 + 17;
    const m = makeMatrix(size);

    // Finder patterns (top-left, top-right, bottom-left)
    setFinder(m, 0, 0);
    setFinder(m, 0, size - 7);
    setFinder(m, size - 7, 0);

    // Timing patterns (row 6 and col 6 between finders)
    for (let i = 8; i < size - 8; i++) {
      if (m[6][i] === EMPTY) m[6][i] = i % 2 === 0 ? 1 : 0;
      if (m[i][6] === EMPTY) m[i][6] = i % 2 === 0 ? 1 : 0;
    }

    // Alignment patterns (version ≥ 2)
    const ap = ALIGN[ver - 1] || [];
    for (let ai = 0; ai < ap.length; ai++) {
      for (let aj = 0; aj < ap.length; aj++) {
        // Skip corners that overlap finder patterns
        if (ai === 0 && aj === 0) continue;
        if (ai === 0 && aj === ap.length - 1) continue;
        if (ai === ap.length - 1 && aj === 0) continue;
        setAlign(m, ap[ai], ap[aj]);
      }
    }

    // Version information blocks (v7+)
    placeVersion(m, ver);

    // Reserve format info areas (mark as RSVD so data placement skips them)
    for (let i = 0; i < 9; i++) {
      if (m[8][i] === EMPTY) m[8][i] = RSVD;
      if (m[i][8] === EMPTY) m[i][8] = RSVD;
    }
    for (let i = size - 8; i < size; i++) {
      if (m[8][i] === EMPTY) m[8][i] = RSVD;
      if (m[i][8] === EMPTY) m[i][8] = RSVD;
    }

    const codewords = buildCodewords(text, ver);

    // Try all 8 mask patterns and select lowest penalty
    let bestMask = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const trial = m.map(row => row.slice());
      placeData(trial, codewords, ver, mask);
      placeFormat(trial, mask);
      const s = penalty(trial);
      if (s < bestScore) { bestScore = s; bestMask = mask; }
    }

    // Final matrix with best mask
    placeData(m, codewords, ver, bestMask);
    placeFormat(m, bestMask);

    return m;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  /**
   * Render a QR code for `text` onto `canvas`.
   * @param {HTMLCanvasElement} canvas
   * @param {string}            text
   * @param {number}            [size=200]  canvas size in pixels
   */
  function toCanvas(canvas, text, size) {
    size = size || 200;
    const matrix = generate(text);
    const n = matrix.length;
    // 4-module quiet zone on each side
    const mod = Math.max(1, Math.floor((size - 8) / (n + 8)));
    const margin = Math.floor((size - n * mod) / 2);

    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c] === 1) {
          ctx.fillRect(margin + c * mod, margin + r * mod, mod, mod);
        }
      }
    }
  }

  return { toCanvas };
}());

// Export for ES modules if supported, else attach to window
if (typeof module !== 'undefined') module.exports = QRCode;
