import { applyDecorators } from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import {
  PublicBusinessHourDto,
  PublicClosureDto,
  StoreOpenStateDto,
} from "src/dto/response/businessHour.dto";
import {
  CreateClosurePayloadDto,
  ReplaceBusinessHoursPayloadDto,
  UpdateClosurePayloadDto,
} from "src/dto/request/businessHour.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  getHours: {
    summary: "요일별 영업시간 조회",
    ok: { status: 200, description: "영업시간 목록 반환" },
  },
  replaceHours: {
    summary: "요일별 영업시간 전체 교체",
    ok: { status: 200, description: "교체된 영업시간 목록 반환" },
  },
  getClosures: {
    summary: "휴무일 목록 조회",
    ok: { status: 200, description: "휴무일 목록 반환" },
  },
  createClosure: {
    summary: "휴무일 등록",
    ok: { status: 201, description: "휴무일 등록 성공" },
  },
  updateClosure: {
    summary: "휴무일 수정",
    ok: { status: 200, description: "휴무일 수정 성공" },
  },
  deleteClosure: {
    summary: "휴무일 삭제",
    ok: { status: 204, description: "휴무일 삭제 성공" },
  },
  getStatus: {
    summary: "현재 영업 상태 조회",
    ok: { status: 200, description: "영업 상태 반환" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "매장 또는 휴무일을 찾을 수 없음" },
  conflict: { status: 409, description: "이미 등록된 날짜" },
};

const rangeQuery = {
  from: {
    name: "from",
    required: false,
    description: "조회 시작일 (YYYY-MM-DD). 생략하면 오늘 영업일",
  },
  to: {
    name: "to",
    required: false,
    description: "조회 종료일 (YYYY-MM-DD). 생략하면 시작일 + 90일",
  },
};

export const DocsBusinessHoursGet = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.getHours.summary,
      description:
        "행이 하나도 없으면 영업시간 미설정 상태이며, 이 매장은 항상 영업으로 판정된다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.getHours.ok, type: [PublicBusinessHourDto] }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsBusinessHoursReplace = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.replaceHours.summary,
      description:
        "보내지 않은 요일은 삭제된다. 빈 배열을 보내면 영업시간 미설정 상태로 돌아간다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: ReplaceBusinessHoursPayloadDto }),
    ApiResponse({ ...meta.replaceHours.ok, type: [PublicBusinessHourDto] }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsClosureGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getClosures.summary }),
    ApiParam(paramsDocs.storeId),
    ApiQuery(rangeQuery.from),
    ApiQuery(rangeQuery.to),
    ApiResponse({ ...meta.getClosures.ok, type: [PublicClosureDto] }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsClosureCreate = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.createClosure.summary,
      description:
        "openMinute·closeMinute을 함께 보내면 종일 휴무가 아니라 그날만 적용되는 특별 영업시간이 된다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: CreateClosurePayloadDto }),
    ApiResponse({ ...meta.createClosure.ok, type: PublicClosureDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound),
    ApiResponse(meta.conflict)
  );

export const DocsClosureUpdate = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.updateClosure.summary,
      description: "날짜는 바꿀 수 없다. 옮기려면 삭제 후 다시 등록한다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.closureId),
    ApiBody({ type: UpdateClosurePayloadDto }),
    ApiResponse({ ...meta.updateClosure.ok, type: PublicClosureDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsClosureDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.deleteClosure.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.closureId),
    ApiResponse(meta.deleteClosure.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsBusinessStatusGet = () =>
  applyDecorators(
    ApiOperation({
      summary: meta.getStatus.summary,
      description:
        "수동 차단 → 임시 휴무일 → 정기 휴무 요일 → 영업 구간 → 브레이크타임 순으로 판정한다.",
    }),
    ApiParam(paramsDocs.storeId),
    ApiResponse({ ...meta.getStatus.ok, type: StoreOpenStateDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
