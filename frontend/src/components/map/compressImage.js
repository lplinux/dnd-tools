/**
 * components/map/compressImage.js
 *
 * Resize/compress a data-URL so a map background fits within IMG_MAX_PX (longest
 * edge) and IMG_MAX_BYTES. Photos are re-encoded as progressively lower-quality
 * JPEG until under the size limit. Faithful port of the legacy `compressImage`.
 *
 * @param {string} dataUrl  Source image as a data URL (from FileReader).
 * @param {{maxDim?: number, maxBytes?: number}} [opts]  Override the longest-edge /
 *   byte limits. Defaults suit a map background (4096px / 2MB); pass e.g.
 *   `{ maxDim: 256 }` for a small pin thumbnail.
 * @returns {Promise<string>} Compressed data URL.
 */

export const IMG_MAX_PX = 4096; // longest edge
export const IMG_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const BASE64_OVERHEAD = 1.37; // base64 inflates byte length by ~37%

export function compressImage(dataUrl, opts = {}) {
  const maxDim = opts.maxDim || IMG_MAX_PX;
  const maxBytes = opts.maxBytes || IMG_MAX_BYTES;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not decode image'));
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxDim || h > maxDim) {
        const ratio = maxDim / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      let quality = 0.92;
      let result;
      do {
        result = canvas.toDataURL('image/jpeg', quality);
        quality -= 0.08;
      } while (result.length > maxBytes * BASE64_OVERHEAD && quality > 0.2);

      if (result.length > maxBytes * BASE64_OVERHEAD) {
        reject(new Error('Image is too large to compress — try a smaller file'));
      } else {
        resolve(result);
      }
    };
    img.src = dataUrl;
  });
}
