import { applyDecorators } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from "@nestjs/swagger";
import {
  PublicMenuOptionDto,
  PublicOptionChoiceDto,
} from "src/dto/response/menuOption.dto";
import {
  CreateMenuOptionPayloadDto,
  CreateOptionChoicePayloadDto,
  ReorderMenuOptionsPayloadDto,
  ReorderOptionChoicesPayloadDto,
  UpdateMenuOptionPayloadDto,
  UpdateOptionChoicePayloadDto,
} from "src/dto/request/menuOption.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  badRequest: {
    status: 400,
    description:
      "잘못된 요청. 옵션 설정 불일치(MENU_OPTION_CONSTRAINT_VIOLATION), " +
      "트리거 참조 오류(MENU_OPTION_TRIGGER_INVALID), " +
      "순환 참조(MENU_OPTION_TRIGGER_CYCLE) 포함",
  },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "메뉴·옵션·선택지를 찾을 수 없음" },
  duplicatedName: {
    status: 409,
    description:
      "같은 메뉴 내 중복된 옵션 이름 또는 같은 옵션 내 중복된 선택지 이름",
  },
  orderMismatch: {
    status: 409,
    description:
      "요청한 목록이 현재 집합과 불일치(stale 목록), " +
      "또는 같은 매장의 다른 정렬 변경이 처리 중(REORDER_IN_PROGRESS)",
  },
  lastChoice: {
    status: 409,
    description:
      "옵션의 마지막 선택지는 삭제할 수 없음(MENU_OPTION_LAST_CHOICE)",
  },
};

export const DocsMenuOptionGetList = () =>
  applyDecorators(
    ApiOperation({
      summary: "메뉴 옵션 목록 조회",
      description:
        "메뉴 응답에는 옵션이 없다 — 옵션만 바뀌었을 때 메뉴 캐시까지 무효화하지 않도록 " +
        "여기서 따로 조회한다. 점주용이라 비활성 옵션과 숨김 선택지도 전부 내려간다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.menuId),
    ApiResponse({
      status: 200,
      description: "옵션 목록 반환. 옵션이 없으면 빈 배열",
      type: [PublicMenuOptionDto],
    }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsMenuOptionGetUnique = () =>
  applyDecorators(
    ApiOperation({
      summary: "메뉴 옵션 단건 조회",
      description: "선택지를 정렬해 함께 내려준다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.optionId),
    ApiResponse({
      status: 200,
      description: "옵션 조회 성공",
      type: PublicMenuOptionDto,
    }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsMenuOptionCreate = () =>
  applyDecorators(
    ApiOperation({
      summary: "메뉴 옵션 생성",
      description:
        "선택지를 하나 이상 함께 보낸다. 옵션은 메뉴 안 맨 뒤에 붙으며 " +
        "순서 변경은 재정렬 엔드포인트로만 한다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.menuId),
    ApiBody({ type: CreateMenuOptionPayloadDto }),
    ApiResponse({
      status: 201,
      description: "옵션 생성 성공",
      type: PublicMenuOptionDto,
    }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.duplicatedName)
  );

export const DocsMenuOptionUpdate = () =>
  applyDecorators(
    ApiOperation({
      summary: "메뉴 옵션 수정",
      description:
        "선택지는 건드리지 않는다. 보낸 값과 저장된 값을 합쳐 정합성을 검사한다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.optionId),
    ApiBody({ type: UpdateMenuOptionPayloadDto }),
    ApiResponse({
      status: 200,
      description: "옵션 수정 성공",
      type: PublicMenuOptionDto,
    }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.duplicatedName)
  );

export const DocsMenuOptionDelete = () =>
  applyDecorators(
    ApiOperation({
      summary: "메뉴 옵션 삭제",
      description:
        "선택지도 함께 삭제되고, 이 옵션을 조건으로 삼던 트리거 규칙도 정리된다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.optionId),
    ApiResponse({ status: 204, description: "옵션 삭제 성공" }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsMenuOptionReorder = () =>
  applyDecorators(
    ApiOperation({
      summary: "메뉴 옵션 순서 전체 교체",
      description:
        "해당 메뉴의 옵션 전체를 원하는 순서로 나열해 보낸다(부분 목록 불가). " +
        "표시 순서만 바뀌며 트리거 평가는 영향받지 않는다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.menuId),
    ApiBody({ type: ReorderMenuOptionsPayloadDto }),
    ApiResponse({
      status: 200,
      description: "재정렬된 옵션 목록 반환",
      type: [PublicMenuOptionDto],
    }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.orderMismatch)
  );

export const DocsOptionChoiceGetList = () =>
  applyDecorators(
    ApiOperation({
      summary: "옵션 선택지 목록 조회",
      description:
        "옵션 단건 조회에도 선택지가 함께 실린다. 선택지 목록만 다시 그릴 때 쓴다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.optionId),
    ApiResponse({
      status: 200,
      description: "선택지 목록 반환",
      type: [PublicOptionChoiceDto],
    }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOptionChoiceGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: "옵션 선택지 단건 조회" }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.choiceId),
    ApiResponse({
      status: 200,
      description: "선택지 조회 성공",
      type: PublicOptionChoiceDto,
    }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsOptionChoiceCreate = () =>
  applyDecorators(
    ApiOperation({ summary: "옵션 선택지 추가" }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.optionId),
    ApiBody({ type: CreateOptionChoicePayloadDto }),
    ApiResponse({
      status: 201,
      description: "선택지 추가 성공",
      type: PublicOptionChoiceDto,
    }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.duplicatedName)
  );

export const DocsOptionChoiceUpdate = () =>
  applyDecorators(
    ApiOperation({
      summary: "옵션 선택지 수정",
      description: "품절 처리(state)와 가격·수량 설정을 바꾼다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.choiceId),
    ApiBody({ type: UpdateOptionChoicePayloadDto }),
    ApiResponse({
      status: 200,
      description: "선택지 수정 성공",
      type: PublicOptionChoiceDto,
    }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.duplicatedName)
  );

export const DocsOptionChoiceDelete = () =>
  applyDecorators(
    ApiOperation({
      summary: "옵션 선택지 삭제",
      description: "이 선택지를 조건으로 삼던 트리거 규칙도 함께 정리된다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.choiceId),
    ApiResponse({ status: 204, description: "선택지 삭제 성공" }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.lastChoice)
  );

export const DocsOptionChoiceReorder = () =>
  applyDecorators(
    ApiOperation({
      summary: "옵션 선택지 순서 전체 교체",
      description: "해당 옵션의 선택지 전체를 원하는 순서로 나열해 보낸다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.optionId),
    ApiBody({ type: ReorderOptionChoicesPayloadDto }),
    ApiResponse({
      status: 200,
      description: "재정렬된 선택지 목록 반환",
      type: [PublicOptionChoiceDto],
    }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.orderMismatch)
  );
