import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { MenuImages } from "@ssurak/schema";
import { buildMenuImageUrls } from "./menu-image";

type WithImageKey = { imageKey: string | null };

export type WithMenuImages<T> = Omit<T, "imageKey"> & {
  images: MenuImages | null;
};

/**
 * 메뉴 이미지 URL 조립 담당.
 *
 * `imageKey`(S3 object key)는 내부 값이라 응답에 나가면 안 되므로,
 * Prisma row를 응답으로 내보내기 직전에 이 서비스를 거쳐 `images`로 바꾼다.
 */
@Injectable()
export class MenuImageService {
  private readonly cdnBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.cdnBaseUrl = this.configService.getOrThrow<string>("CDN_BASE_URL");
  }

  /** 주문·장바구니 스냅샷에 박아둘 썸네일 절대 URL. */
  thumbnailUrlOf(imageKey: string | null): string | null {
    return buildMenuImageUrls(imageKey, this.cdnBaseUrl)?.thumbnail ?? null;
  }

  get baseUrl(): string {
    return this.cdnBaseUrl;
  }

  /** Prisma row 하나를 응답 형태로 변환한다. */
  toView<T extends WithImageKey>(menu: T): WithMenuImages<T> {
    const { imageKey, ...rest } = menu;
    return {
      ...rest,
      images: buildMenuImageUrls(imageKey, this.cdnBaseUrl),
    };
  }

  toViewList<T extends WithImageKey>(menus: T[]): WithMenuImages<T>[] {
    return menus.map((menu) => this.toView(menu));
  }
}
