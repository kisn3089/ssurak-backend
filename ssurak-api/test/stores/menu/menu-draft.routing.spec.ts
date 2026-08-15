import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { ExecutionContext, INestApplication } from "@nestjs/common";
import request from "supertest";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { StoreAccessGuard } from "src/utils/guards/store-access.guard";
import { MenuImageService } from "src/common/image/menu-image.service";
import { CategoryService } from "src/stores/menu/category.service";
import { MenuController } from "src/stores/menu/menu.controller";
import { MenuDraftController } from "src/stores/menu/menu-draft.controller";
import { MenuDraftService } from "src/stores/menu/menu-draft.service";
import { MenuService } from "src/stores/menu/menu.service";

/**
 * `GET .../menus/drafts`와 `GET .../menus/:menuId`는 같은 경로 모양이다.
 *
 * 등록 순서가 뒤집히면 "drafts"가 메뉴 ID로 잡혀 초안 목록이 400(cuid2 아님)으로 떨어진다.
 * 순서 의존을 코드 주석으로만 남기면 컨트롤러 배열을 정리하다 조용히 깨지므로 여기서 고정한다.
 */
describe("메뉴 초안 라우팅", () => {
  // 컨트롤러가 응답을 스키마로 parse하므로 목도 필드를 다 채워야 200이 난다.
  const listResponse = {
    drafts: [],
    remaining: 15,
    resetAt: null,
    rateLimit: 15,
    rateWindowHours: 8,
  };
  const listDrafts = vi.fn().mockResolvedValue(listResponse);
  const menuUnique = vi.fn();

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      // 모듈의 controllers 배열과 같은 순서로 둔다.
      controllers: [MenuDraftController, MenuController],
      providers: [
        { provide: MenuDraftService, useValue: { listDrafts } },
        { provide: MenuService, useValue: { getMenuUnique: menuUnique } },
        { provide: CategoryService, useValue: {} },
        {
          provide: MenuImageService,
          useValue: { toView: (menu: unknown) => menu },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      // `@Client()`가 request.user.info를 읽으므로 인증 통과만으로는 부족하다.
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { info: {}, jwt: {} };
          return true;
        },
      })
      .overrideGuard(StoreAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("`drafts`가 메뉴 ID로 잡히지 않는다", async () => {
    const storeId = "a".repeat(24);

    await request(app.getHttpServer())
      .get(`/${storeId}/menus/drafts`)
      .expect(200, listResponse);

    expect(listDrafts).toHaveBeenCalled();
    expect(menuUnique).not.toHaveBeenCalled();
  });
});
