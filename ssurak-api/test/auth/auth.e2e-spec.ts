import { INestApplication } from "@nestjs/common";
import { COOKIE_TABLE } from "@ssurak/db/constants";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import {
  cleanupOwner,
  seedOwnerWithStores,
  SeededOwner,
} from "test/helpers/seed-owner";

describe("Auth API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seeded: SeededOwner;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    seeded = await seedOwnerWithStores(prisma, 0);
  });

  afterAll(async () => {
    await cleanupOwner(prisma, seeded.owner.id);
    await app.close();
  });

  describe("POST /auth/v1/owner/signin", () => {
    it("올바른 자격 증명이면 accessToken과 refresh 쿠키를 발급한다", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: seeded.password })
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.expiresAt).toEqual(expect.any(String));

      const cookies = response.get("Set-Cookie") ?? [];
      expect(
        cookies.some((cookie) => cookie.startsWith(`${COOKIE_TABLE.REFRESH}=`))
      ).toBe(true);
    });

    it("비밀번호가 틀리면 401 SIGNIN_FAILED", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: "wrong-password-9999!" })
        .expect(401);

      expect(response.body.code).toBe("SIGNIN_FAILED");
    });

    it("존재하지 않는 이메일이어도 동일하게 401 SIGNIN_FAILED", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: "ghost@test.local", password: "whatever-1234!" })
        .expect(401);

      expect(response.body.code).toBe("SIGNIN_FAILED");
    });

    it("본문이 스키마와 달라도 401 SIGNIN_FAILED로 통일하고 실패 사유를 노출하지 않는다", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email })
        .expect(401);

      expect(response.body.code).toBe("SIGNIN_FAILED");
      expect(response.body.details).toBeUndefined();
    });

    it("회원가입 복잡도 규칙에 어긋나는 비밀번호도 400이 아닌 401로 처리한다", async () => {
      // 정책 강화 이전 가입자의 비밀번호가 형식 검증에 막히면 안 된다
      const response = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: "nodigits" })
        .expect(401);

      expect(response.body.code).toBe("SIGNIN_FAILED");
      expect(response.body.details).toBeUndefined();
    });
  });

  describe("POST /auth/v1/refresh", () => {
    it("refresh 쿠키로 새 accessToken을 발급한다", async () => {
      const signIn = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: seeded.password })
        .expect(201);

      const cookies = signIn.get("Set-Cookie") ?? [];
      const response = await request(app.getHttpServer())
        .post("/auth/v1/refresh")
        .set("Cookie", cookies)
        .expect(201);

      expect(response.body.accessToken).toEqual(expect.any(String));
    });

    it("쿠키가 없으면 401 REFRESH_FAILED", async () => {
      const response = await request(app.getHttpServer())
        .post("/auth/v1/refresh")
        .expect(401);

      expect(response.body.code).toBe("REFRESH_FAILED");
    });

    it("다른 기기에서 로그인해도 기존 기기의 refresh 쿠키는 유효하다", async () => {
      const firstDevice = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: seeded.password })
        .expect(201);

      // 두 번째 기기 로그인 (기존 단일 슬롯 구조에서는 첫 기기를 무효화했다)
      await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: seeded.password })
        .expect(201);

      await request(app.getHttpServer())
        .post("/auth/v1/refresh")
        .set("Cookie", firstDevice.get("Set-Cookie") ?? [])
        .expect(201);
    });

    it("한 번 사용한 refresh 쿠키는 재사용할 수 없다(rotation)", async () => {
      const signIn = await request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: seeded.email, password: seeded.password })
        .expect(201);
      const cookies = signIn.get("Set-Cookie") ?? [];

      await request(app.getHttpServer())
        .post("/auth/v1/refresh")
        .set("Cookie", cookies)
        .expect(201);

      const replayed = await request(app.getHttpServer())
        .post("/auth/v1/refresh")
        .set("Cookie", cookies)
        .expect(401);

      expect(replayed.body.code).toBe("REFRESH_FAILED");
    });
  });
});
