import { Global, Module } from "@nestjs/common";
import { StoreOpenStateService } from "./store-open-state.service";

/**
 * 영업 상태 판정은 store(점주 콘솔)·order(주문 거절)·session(고객 메뉴판) 세 도메인이
 * 모두 필요로 하므로 menu-image.module.ts처럼 전역으로 노출한다.
 */
@Global()
@Module({
  providers: [StoreOpenStateService],
  exports: [StoreOpenStateService],
})
export class BusinessHoursModule {}
