import { applyDecorators } from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
} from "@nestjs/swagger";
import {
  FILE_FIELD_NAME,
  MAX_OCR_FILE_COUNT,
  MAX_OCR_FILE_SIZE_MB,
} from "src/storage/storage.constants";
import { BulkCreateMenusPayloadDto } from "src/dto/request/menu.dto";
import { UpdateMenuDraftPayloadDto } from "src/dto/request/menuDraft.dto";
import {
  MenuDraftListResponseDto,
  MenuDraftResponseDto,
} from "src/dto/response/menuDraft.dto";
import { PublicMenuDto } from "src/dto/response/menu.dto";
import { paramsDocs } from "./params.docs";

/** 세 엔드포인트가 같은 수명 규칙을 설명해야 해서 한 곳에 둔다. */
const LIFECYCLE =
  "초안은 **DB에 저장되지 않는다** — Redis에 12시간 사는 임시 리소스이고, " +
  "조회하거나 수정할 때마다 만료가 12시간 뒤로 밀린다(`expiresAt`). " +
  "확정은 일괄 등록(POST .../menus/bulk)으로 한다.";

const meta = {
  create: {
    summary: "메뉴판 사진에서 메뉴 초안 추출",
    description:
      `메뉴판 사진을 최대 ${MAX_OCR_FILE_COUNT}장(장당 ${MAX_OCR_FILE_SIZE_MB}MB)까지 받아 ` +
      `메뉴 이름·가격·설명·카테고리를 추출한다. ${LIFECYCLE}\n\n` +
      "**같은 사진을 다시 올리면 같은 `draftId`가 돌아온다.** 모델을 다시 부르지 않고 " +
      "그 사이 수정한 내용까지 그대로 돌려주며, 인식 횟수도 차감하지 않는다.\n\n" +
      "각 항목의 `issues`는 사람이 확인해야 하는 지점이다(가격 미인식, 이름 잘림, 중복 등). " +
      "메뉴를 하나도 찾지 못한 경우도 201이며 `items`가 빈 배열로 온다 — " +
      "`unreadableCount`로 재촬영을 안내한다.",
    ok: { status: 201, description: "추출된 메뉴 초안" },
  },
  list: {
    summary: "메뉴 초안 목록",
    description:
      `이 매장에서 최근에 추출한 초안을 최신순으로 돌려준다. ${LIFECYCLE}\n\n` +
      "목록에는 `items`를 싣지 않는다 — 어떤 사진이었는지(`sourceImages`의 썸네일)와 " +
      "몇 개짜리인지(`itemCount`)만 보고 상세로 들어간다. " +
      "인식 횟수를 차감하지 않으므로 몇 번이든 열어도 된다.",
    ok: { status: 200, description: "초안 목록(최신순)" },
  },
  unique: {
    summary: "메뉴 초안 상세",
    description: `초안 항목 전체를 돌려준다. ${LIFECYCLE}`,
    ok: { status: 200, description: "초안 상세" },
  },
  update: {
    summary: "메뉴 초안 수정",
    description:
      "리뷰 화면에서 고친 항목을 저장한다. **`items`는 부분 수정이 아니라 전체 교체다** — " +
      "행 추가·삭제·순서 변경이 모두 이 한 요청으로 표현된다.\n\n" +
      "`issues`는 보내지 않는다. 서버가 저장 시점의 매장 상태로 다시 계산하므로 " +
      "가격을 채우면 `PRICE_MISSING`이, 카테고리를 고르면 `CATEGORY_UNKNOWN`이 사라진다.\n\n" +
      "카테고리는 일괄 등록과 같은 어휘를 쓴다(`categoryId` 또는 `categoryName`). " +
      "아직 못 정한 행은 둘 다 비우면 된다.",
    ok: { status: 200, description: "수정된 초안 전체" },
  },
  bulk: {
    summary: "메뉴 일괄 등록 (초안 확정)",
    description:
      "초안을 확정해 한 트랜잭션에 등록한다. 항목마다 기존 카테고리(`categoryId`) 또는 " +
      "새 카테고리(`categoryName`) 중 정확히 하나를 지정한다 — 새 카테고리는 " +
      "이 요청에서 생성되며 같은 이름이 여러 항목에 있어도 하나만 만들어진다.\n\n" +
      "메뉴는 각 카테고리의 맨 뒤에 요청 순서대로 붙는다. 초안 이미지는 없으므로 " +
      "대표 사진은 등록 후 개별 수정으로 붙인다.",
    ok: { status: 201, description: "등록된 메뉴 목록(요청 순서 유지)" },
  },
  badRequest: {
    status: 400,
    description: "잘못된 요청 / 지원하지 않는 이미지",
  },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: {
    status: 404,
    description: "매장·카테고리를 찾을 수 없거나, 초안이 만료됨",
  },
  payloadTooLarge: {
    status: 413,
    description: `파일이 ${MAX_OCR_FILE_SIZE_MB}MB를 초과함`,
  },
  unprocessable: {
    status: 422,
    description: "사진에서 메뉴를 읽지 못함(메뉴판이 아닌 사진 등)",
  },
  tooManyRequests: {
    status: 429,
    description: "점주별 시간당 인식 횟수 초과, 또는 업스트림 사용량 제한",
  },
  unavailable: {
    status: 503,
    description:
      "인식 시간 초과, 업스트림 일시 장애, 초안 저장소 장애. 재시도 대상",
  },
};

export const DocsMenuDraftCreate = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.create.summary,
      description: meta.create.description,
    }),
    ApiParam(paramsDocs.storeId),
    ApiConsumes("multipart/form-data"),
    ApiBody({
      schema: {
        type: "object",
        properties: {
          [FILE_FIELD_NAME]: {
            type: "array",
            maxItems: MAX_OCR_FILE_COUNT,
            items: { type: "string", format: "binary" },
            description:
              "메뉴판 사진. 벽면·책자가 나뉘어 있으면 여러 장을 함께 올린다.",
          },
        },
        required: [FILE_FIELD_NAME],
      },
    }),
    ApiResponse({ ...meta.create.ok, type: MenuDraftResponseDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.payloadTooLarge),
    ApiResponse(meta.unprocessable),
    ApiResponse(meta.tooManyRequests),
    ApiResponse(meta.unavailable)
  );

export const DocsMenuDraftGetList = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.list.summary,
      description: meta.list.description,
    }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.list.ok, type: MenuDraftListResponseDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.unavailable)
  );

export const DocsMenuDraftGetUnique = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.unique.summary,
      description: meta.unique.description,
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.draftId),
    ApiResponse({ ...meta.unique.ok, type: MenuDraftResponseDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.unavailable)
  );

export const DocsMenuDraftUpdate = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.update.summary,
      description: meta.update.description,
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.draftId),
    ApiBody({ type: UpdateMenuDraftPayloadDto }),
    ApiResponse({ ...meta.update.ok, type: MenuDraftResponseDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.unavailable)
  );

export const DocsMenuBulkCreate = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.bulk.summary,
      description: meta.bulk.description,
    }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: BulkCreateMenusPayloadDto }),
    ApiResponse({ ...meta.bulk.ok, type: [PublicMenuDto] }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
