import sharp from "sharp";
import { MAX_INPUT_PIXELS } from "./storage.constants";

const THUMBNAIL_MAX_EDGE = 200;

export async function toThumbnailDataUrl(jpeg: Buffer): Promise<string> {
  const thumbnail = await sharp(jpeg, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize({
      width: THUMBNAIL_MAX_EDGE,
      height: THUMBNAIL_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 60 })
    .toBuffer();

  return `data:image/webp;base64,${thumbnail.toString("base64")}`;
}
