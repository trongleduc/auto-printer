import { PHOTO_PX_H, PHOTO_PX_W } from "./sheet-geometry";

/**
 * Turns any phone photo into the exact print tile (709×1063 px = 6×9 cm @300dpi):
 * EXIF orientation applied, landscape rotated to portrait, scaled to fit
 * ("contain") on a white background. Runs in the browser.
 */
export async function processPhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Không đọc được ảnh này. Hãy thử ảnh JPEG hoặc PNG.");
  }

  const landscape = bitmap.width > bitmap.height;
  const srcW = landscape ? bitmap.height : bitmap.width; // size after rotation
  const srcH = landscape ? bitmap.width : bitmap.height;
  const scale = Math.min(PHOTO_PX_W / srcW, PHOTO_PX_H / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;

  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_PX_W;
  canvas.height = PHOTO_PX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PHOTO_PX_W, PHOTO_PX_H);
  ctx.imageSmoothingQuality = "high";

  ctx.translate(PHOTO_PX_W / 2, PHOTO_PX_H / 2);
  if (landscape) ctx.rotate(Math.PI / 2);
  // After rotation the axes swap, so draw with the bitmap's own dimensions.
  const w = landscape ? drawH : drawW;
  const h = landscape ? drawW : drawH;
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không xuất được ảnh."))), "image/jpeg", 0.92),
  );
}
