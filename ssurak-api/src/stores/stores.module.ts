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
import { MenuDraftStore } from "./menu/menu-draft.store";
import { MenuVisionClient } from "./menu/menu-vision.client";
import { OpenAiModule } from "src/common/ai/openai.module";

@Module({
  imports: [PassportModule, JwtModule, StorageModule, OpenAiModule],
  controllers: [
    StoresController,
    MenuDraftController, // MenuController의 `GET :menuId`가 "drafts"를 메뉴 ID로 삼키지 않도록 먼저 등록한다.
    MenuController,
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
    MenuDraftStore,
    MenuVisionClient,
    MenuOptionService,
    MenuOptionChoiceService,
    CategoryService,
    TableService,
    SessionService,
  ],
})
export class StoreModule {}
