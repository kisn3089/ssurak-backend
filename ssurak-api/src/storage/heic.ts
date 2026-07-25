/**
 * ISO BMFF(HEIF) 컨테이너 중 HEVC로 코딩된 HEIC인지 매직바이트로 판별한다.
 * MIME 라벨은 클라이언트가 붙이는 값이라 못 믿으므로 내용으로 본다.
 *
 * ftyp 박스 레이아웃:
 *   [size(4)][ "ftyp" ][ major brand(4) ][ minor version(4) ][ compatible brands... ]
 *
 * HEVC 브랜드만 HEIC로 본다 — AVIF(av01/AV1)는 sharp가 직접 디코드하므로 제외해야 하고,
 * 두 포맷이 공유하는 일반 브랜드(mif1/msf1)로는 구분되지 않는다.
 */
const HEVC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx"]);

export function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;

  const boxSize = Math.min(buffer.readUInt32BE(0), buffer.length);

  // major brand(8..12)와 그 뒤(16..boxSize)의 compatible brands를 4바이트씩 훑는다.
  if (HEVC_BRANDS.has(buffer.toString("ascii", 8, 12))) return true;
  for (let i = 16; i + 4 <= boxSize; i += 4) {
    if (HEVC_BRANDS.has(buffer.toString("ascii", i, i + 4))) return true;
  }
  return false;
}
