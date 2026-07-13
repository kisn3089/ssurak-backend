import { applyDecorators } from "@nestjs/common";
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from "@nestjs/swagger";
import { PublicTableDto } from "src/dto/response/table.dto";
import {
  CreateTablePayloadDto,
  UpdateTablePayloadDto,
} from "src/dto/request/table.dto";
import { paramsDocs } from "./params.docs";

const meta = {
  create: {
    summary: "테이블 생성",
    ok: { status: 201, description: "테이블 생성 성공" },
  },
  getList: {
    summary: "테이블 목록 조회",
    ok: { status: 200, description: "테이블 목록 반환" },
  },
  getUnique: {
    summary: "특정 테이블 조회",
    ok: { status: 200, description: "테이블 정보 반환" },
  },
  update: {
    summary: "테이블 정보 수정",
    ok: { status: 200, description: "테이블 수정 성공" },
  },
  delete: {
    summary: "테이블 삭제",
    ok: { status: 204, description: "테이블 삭제 성공" },
  },
  badRequest: { status: 400, description: "잘못된 요청" },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
  notFound: { status: 404, description: "테이블을 찾을 수 없음" },
};

export const DocsTableCreate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.create.summary }),
    ApiParam(paramsDocs.storeId),
    ApiBody({ type: CreateTablePayloadDto }),
    ApiResponse({ ...meta.create.ok, type: PublicTableDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized)
  );

export const DocsTableGetList = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getList.summary }),
    ApiParam(paramsDocs.storeId),
    ApiQuery(paramsDocs.query.filter.table),
    ApiQuery(paramsDocs.query.include.orderItems),
    ApiResponse({ ...meta.getList.ok, type: [PublicTableDto] }),
    ApiResponse(meta.unauthorized)
  );

export const DocsTableGetUnique = () =>
  applyDecorators(
    ApiOperation({ summary: meta.getUnique.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.tableId),
    ApiQuery(paramsDocs.query.filter.table),
    ApiQuery(paramsDocs.query.include.orderItems),
    ApiResponse({ ...meta.getUnique.ok, type: PublicTableDto }),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsTableUpdate = () =>
  applyDecorators(
    ApiOperation({ summary: meta.update.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.tableId),
    ApiBody({ type: UpdateTablePayloadDto }),
    ApiResponse({ ...meta.update.ok, type: PublicTableDto }),
    ApiResponse(meta.badRequest),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );

export const DocsTableDelete = () =>
  applyDecorators(
    ApiOperation({ summary: meta.delete.summary }),
    ApiParam(paramsDocs.storeId),
    ApiParam(paramsDocs.tableId),
    ApiResponse(meta.delete.ok),
    ApiResponse(meta.unauthorized),
    ApiResponse(meta.notFound)
  );
