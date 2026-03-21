import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ImageAttachment } from '../channel.js';
import { COMPRESS_THRESHOLD, compressImage, compressImages, MAX_DIMENSION } from '../image-compress.js';

// ── Helpers ───────────────────────────────────────────

/** Create a real PNG image of given dimensions. */
async function createPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

/** Create a real JPEG image of given dimensions and quality. */
async function createJpeg(width: number, height: number, quality = 95): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 0, b: 255 } },
  })
    .jpeg({ quality })
    .toBuffer();
}

/** Create a large image that exceeds the compression threshold. */
async function createLargeImage(format: 'png' | 'jpeg' = 'png'): Promise<Buffer> {
  // Use random noise to prevent effective compression — ensures large file size
  const width = 2000;
  const height = 2000;
  const noise = Buffer.alloc(width * height * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256);
  const img = sharp(noise, { raw: { width, height, channels: 3 } });
  if (format === 'jpeg') {
    return img.jpeg({ quality: 100 }).toBuffer();
  }
  return img.png({ compressionLevel: 0 }).toBuffer();
}

// ── Tests ─────────────────────────────────────────────

describe('compressImage', () => {
  it('passes through small images unchanged', async () => {
    const small = await createPng(100, 100);
    expect(small.length).toBeLessThan(COMPRESS_THRESHOLD);

    const img: ImageAttachment = { mimeType: 'image/png', data: small, fileName: 'small.png' };
    const result = await compressImage(img);

    expect(result.data).toBe(small); // same Buffer reference — not compressed
    expect(result.mimeType).toBe('image/png');
    expect(result.fileName).toBe('small.png');
  });

  it('compresses large PNG images to JPEG', async () => {
    const large = await createLargeImage('png');
    expect(large.length).toBeGreaterThan(COMPRESS_THRESHOLD);

    const img: ImageAttachment = { mimeType: 'image/png', data: large, fileName: 'photo.png' };
    const result = await compressImage(img);

    expect(result.data.length).toBeLessThan(large.length);
    expect(result.data.length).toBeLessThan(COMPRESS_THRESHOLD);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('photo.jpg'); // extension updated
  });

  it('compresses large JPEG images', async () => {
    const large = await createLargeImage('jpeg');
    expect(large.length).toBeGreaterThan(COMPRESS_THRESHOLD);

    const img: ImageAttachment = { mimeType: 'image/jpeg', data: large, fileName: 'photo.jpg' };
    const result = await compressImage(img);

    expect(result.data.length).toBeLessThan(large.length);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBe('photo.jpg');
  });

  it('resizes to MAX_DIMENSION while preserving aspect ratio', async () => {
    // Create a 3000x2000 image
    const wide = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(wide.length).toBeGreaterThan(COMPRESS_THRESHOLD);

    const img: ImageAttachment = { mimeType: 'image/png', data: wide };
    const result = await compressImage(img);

    // Verify the compressed image dimensions
    const meta = await sharp(result.data).metadata();
    expect(meta.width).toBeLessThanOrEqual(MAX_DIMENSION);
    expect(meta.height).toBeLessThanOrEqual(MAX_DIMENSION);
    // Aspect ratio preserved: 3000/2000 = 1.5, so 1024x683 (approx)
    expect(meta.width).toBe(MAX_DIMENSION);
    expect(meta.height).toBeLessThan(MAX_DIMENSION);
  });

  it('does not enlarge small-dimension images', async () => {
    // Create a 200x200 but large-filesize image (uncompressed PNG)
    const buf = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .raw()
      .toBuffer();
    // Wrap raw pixels as a large buffer to simulate a big file
    // We need an actual valid image > COMPRESS_THRESHOLD
    // Use a noisy image to prevent good compression
    const noisy = Buffer.alloc(200 * 200 * 3);
    for (let i = 0; i < noisy.length; i++) noisy[i] = Math.floor(Math.random() * 256);
    const largeSmallDim = await sharp(noisy, { raw: { width: 200, height: 200, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();

    if (largeSmallDim.length <= COMPRESS_THRESHOLD) {
      // If the random image happens to be small enough, skip
      return;
    }

    const img: ImageAttachment = { mimeType: 'image/png', data: largeSmallDim };
    const result = await compressImage(img);

    const meta = await sharp(result.data).metadata();
    // Should not upscale: dimensions stay <= 200
    expect(meta.width).toBeLessThanOrEqual(200);
    expect(meta.height).toBeLessThanOrEqual(200);
  });

  it('skips SVG images', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><rect fill="red" width="2000" height="2000"/></svg>',
    );
    // Pad to exceed threshold
    const padded = Buffer.concat([svg, Buffer.alloc(COMPRESS_THRESHOLD + 1)]);

    const img: ImageAttachment = { mimeType: 'image/svg+xml', data: padded, fileName: 'icon.svg' };
    const result = await compressImage(img);

    expect(result.data).toBe(padded); // unchanged
    expect(result.mimeType).toBe('image/svg+xml');
  });

  it('skips GIF images', async () => {
    const gif = Buffer.alloc(COMPRESS_THRESHOLD + 1);
    const img: ImageAttachment = { mimeType: 'image/gif', data: gif, fileName: 'anim.gif' };
    const result = await compressImage(img);

    expect(result.data).toBe(gif); // unchanged
  });

  it('produces valid JPEG output', async () => {
    const large = await createLargeImage('png');
    const img: ImageAttachment = { mimeType: 'image/png', data: large };
    const result = await compressImage(img);

    // Verify JPEG magic bytes
    expect(result.data[0]).toBe(0xff);
    expect(result.data[1]).toBe(0xd8);

    // Verify sharp can read it back
    const meta = await sharp(result.data).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('handles images without fileName', async () => {
    const large = await createLargeImage('png');
    const img: ImageAttachment = { mimeType: 'image/png', data: large };
    const result = await compressImage(img);

    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileName).toBeUndefined();
  });
});

describe('compressImages', () => {
  it('compresses only images exceeding threshold', async () => {
    const small = await createPng(50, 50);
    const large = await createLargeImage('png');

    const results = await compressImages([
      { mimeType: 'image/png', data: small, fileName: 'small.png' },
      { mimeType: 'image/png', data: large, fileName: 'big.png' },
    ]);

    expect(results).toHaveLength(2);
    // Small one unchanged
    expect(results[0].data).toBe(small);
    expect(results[0].mimeType).toBe('image/png');
    // Large one compressed
    expect(results[1].data.length).toBeLessThan(large.length);
    expect(results[1].mimeType).toBe('image/jpeg');
  });

  it('handles empty array', async () => {
    const results = await compressImages([]);
    expect(results).toHaveLength(0);
  });
});
