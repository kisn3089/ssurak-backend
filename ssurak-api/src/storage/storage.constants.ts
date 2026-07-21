/** 업로드 파일이 실려오는 multipart 필드명. FileInterceptor와 에러 메시지가 공유한다. */
export const FILE_FIELD_NAME = "file";

export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

export const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|avif|tiff)$/;
