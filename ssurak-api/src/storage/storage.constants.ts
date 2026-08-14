/** 업로드 파일이 실려오는 multipart 필드명. FileInterceptor와 에러 메시지가 공유한다. */
export const FILE_FIELD_NAME = "file";

/** 상한은 MB로만 둔다. 바이트 환산은 ImageUpload가 한 곳에서 파생시킨다. */
export const MAX_UPLOAD_IMAGE_FILE_SIZE_MB = 5;

/** 메뉴판 사진용 상한. 메뉴 대표 이미지(5MB)보다 크게 잡는다 */
export const MAX_OCR_FILE_SIZE_MB = 12;

/** 한 번에 올릴 수 있는 메뉴판 사진 수. 실제 메뉴판은 벽면 여러 컷·책자 여러 면으로 나뉜다. */
export const MAX_OCR_FILE_COUNT = 3;

export const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|avif|tiff|heic|heif)$/;

/**
 * 디코딩 사이즈 방어선. MAX_UPLOAD_IMAGE_FILE_SIZE_MB는 파일 크기만 제한하므로
 * 고압축 PNG 한 장이 디코딩 시 수 GB를 먹는 걸 막지 못한다.
 * 메모리를 결정하는 건 파일 크기가 아니라 픽셀 수다.
 */
export const MAX_INPUT_PIXELS = 50_000_000;
