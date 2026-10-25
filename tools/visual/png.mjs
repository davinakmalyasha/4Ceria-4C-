/**
 * png.mjs — a minimal PNG decoder, so the visual gate needs no image package.
 *
 * WHY NOT A DEPENDENCY
 * --------------------
 * The gate exists to catch a changed pixel. A decoder is the only thing it needs
 * from the image ecosystem, and a gate that can be disabled by a lockfile change
 * is not a gate. Node already has `zlib`, and a PNG is a header, some deflated
 * scanlines, and a per-row filter — about as much code as the dependency's
 * transitive tree is risk.
 *
 * WHAT IT SUPPORTS, AND WHAT IT REFUSES
 * -------------------------------------
 * Every PNG Chromium's screenshot encoder produces: 8-bit RGB or RGBA, non-
 * interlaced. Anything else throws, loudly, rather than returning a buffer of
 * zeroes that would compare equal to a blank baseline.
 */

import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decode a PNG into `{ width, height, data }`, where `data` is RGBA.
 */
export function decode(buffer) {
    if (!buffer.subarray(0, 8).equals(SIGNATURE)) {
        throw new Error('not a PNG');
    }

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;

    const compressed = [];

    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const body = buffer.subarray(offset + 8, offset + 8 + length);

        if (type === 'IHDR') {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            bitDepth = body[8];
            colorType = body[9];
            interlace = body[12];
        } else if (type === 'IDAT') {
            compressed.push(body);
        } else if (type === 'IEND') {
            break;
        }

        offset += 12 + length;
    }

    if (bitDepth !== 8) {
        throw new Error(`unsupported PNG bit depth ${bitDepth}`);
    }

    if (interlace !== 0) {
        throw new Error('interlaced PNGs are not supported');
    }

    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];

    if (!channels) {
        throw new Error(`unsupported PNG colour type ${colorType}`);
    }

    const raw = inflateSync(Buffer.concat(compressed));
    const stride = width * channels;
    const pixels = Buffer.alloc(stride * height);

    // The per-row filters of the PNG specification. Each row's first byte is
    // its filter type; the rest is the filtered scanline.
    let previous = Buffer.alloc(stride);

    for (let y = 0; y < height; y++) {
        const start = y * (stride + 1);
        const filter = raw[start];
        const row = raw.subarray(start + 1, start + 1 + stride);
        const out = pixels.subarray(y * stride, (y + 1) * stride);

        for (let x = 0; x < stride; x++) {
            const left = x >= channels ? out[x - channels] : 0;
            const up = previous[x];
            const upLeft = x >= channels ? previous[x - channels] : 0;

            let value = row[x];

            switch (filter) {
                case 0: break;                                        // None
                case 1: value += left; break;                         // Sub
                case 2: value += up; break;                           // Up
                case 3: value += (left + up) >> 1; break;             // Average
                case 4: value += paeth(left, up, upLeft); break;      // Paeth
                default: throw new Error(`unknown PNG filter ${filter} on row ${y}`);
            }

            out[x] = value & 0xff;
        }

        previous = out;
    }

    if (channels === 4) {
        return { width, height, data: pixels };
    }

    // Widen to RGBA so the comparison has one shape.
    const rgba = Buffer.alloc(width * height * 4);

    for (let i = 0, j = 0; i < pixels.length; i += channels, j += 4) {
        if (channels === 3) {
            rgba[j] = pixels[i];
            rgba[j + 1] = pixels[i + 1];
            rgba[j + 2] = pixels[i + 2];
        } else if (channels === 1) {
            rgba[j] = rgba[j + 1] = rgba[j + 2] = pixels[i];
        } else {
            rgba[j] = rgba[j + 1] = rgba[j + 2] = pixels[i];
            rgba[j + 3] = pixels[i + 1];
        }

        rgba[j + 3] = 255;
    }

    return { width, height, data: rgba };
}

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);

    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;

    return c;
}
