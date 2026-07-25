import { Global, Module } from "@nestjs/common";
import { MenuImageService } from "./menu-image.service";

/**
 * 메뉴 이미지 URL 조립은 menu·cart·order 세 도메인이 모두 필요로 하므로
 * redis.module.ts처럼 전역으로 노출한다.
 */
@Global()
@Module({
  providers: [MenuImageService],
  exports: [MenuImageService],
})
export class MenuImageModule {}
