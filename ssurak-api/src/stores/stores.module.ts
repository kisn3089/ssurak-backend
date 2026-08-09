import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import { StoresController } from "./stores/stores.controller";
import { StoresService } from "./stores/stores.service";
import { MenuController } from "./menu/menu.controller";
import { MenuService } from "./menu/menu.service";
import { TableController } from "./table/table.controller";
import { TableService } from "./table/table.service";
import { SessionController } from "./session/session.controller";
import { SessionService } from "./session/session.service";
import { CustomerSessionController } from "./session/customer-session.controller";
import { CategoryService } from "./menu/category.service";
import { StorageModule } from "src/storage/storage.module";
import { CategoryController } from "./menu/category.controller";
import { MenuOptionChoiceService } from "./menu/menu-option-choice.service";
import { MenuOptionController } from "./menu/menu-option.controller";
import { MenuOptionService } from "./menu/menu-option.service";
import { MenuDraftController } from "./menu/menu-draft.controller";
import { MenuDraftService } from "./menu/menu-draft.service";
import { MenuVisionClient } from "./menu/menu-vision.client";
import { OpenAiModule } from "src/common/ai/openai.module";

@Module({
  // MenuService가 이미지 확정(promoteMenuImage)에 StorageService를 쓴다.
  // OpenAiModule은 메뉴판 사진 인식(MenuVisionClient)에만 쓰인다.
  imports: [PassportModule, JwtModule, StorageModule, OpenAiModule],
  controllers: [
    StoresController,
    MenuController,
    MenuDraftController,
    TableController,
    SessionController,
    CategoryController,
    MenuOptionController,
    CustomerSessionController,
  ],
  providers: [
    StoresService,
    MenuService,
    MenuDraftService,
    MenuVisionClient,
    MenuOptionService,
    MenuOptionChoiceService,
    CategoryService,
    TableService,
    SessionService,
  ],
})
export class StoreModule {}
