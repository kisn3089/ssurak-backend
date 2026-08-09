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
import { MenuDraftResponseDto } from "src/dto/response/menuDraft.dto";
import { PublicMenuDto } from "src/dto/response/menu.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  draft: {
    summary: "메뉴판 사진에서 메뉴 초안 추출",
    description:
      `메뉴판 사진을 최대 ${MAX_OCR_FILE_COUNT}장(장당 ${MAX_OCR_FILE_SIZE_MB}MB)까지 받아 ` +
      "메뉴 이름·가격·설명·카테고리를 추출한다. **DB에는 아무것도 저장하지 않는다** — " +
      "결과는 사장님이 콘솔에서 수정한 뒤 일괄 등록(POST .../menus/bulk)으로 확정한다.\n\n" +
      "각 항목의 `issues`는 사람이 확인해야 하는 지점이다(가격 미인식, 이름 잘림, 중복 등). " +
      "메뉴를 하나도 찾지 못한 경우도 200이며 `items`가 빈 배열로 온다 — " +
      "`unreadableCount`로 재촬영을 안내한다.",
    ok: { status: 200, description: "추출된 메뉴 초안. 저장되지 않은 상태" },
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
  notFound: { status: 404, description: "매장 또는 카테고리를 찾을 수 없음" },
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
    description: "인식 시간 초과 또는 업스트림 일시 장애. 재시도 대상",
  },
};

export const DocsMenuDraft = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.draft.summary,
      description: meta.draft.description,
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
    ApiResponse({ ...meta.draft.ok, type: MenuDraftResponseDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.payloadTooLarge),
    ApiResponse(meta.unprocessable),
    ApiResponse(meta.tooManyRequests),
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
