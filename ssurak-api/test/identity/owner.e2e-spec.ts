import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import { cleanupAdmin, seedAdmin, SeededAdmin } from "test/helpers/seed-admin";
import {
  cleanupOwner,
  seedOwnerWithStores,
  SeededOwner,
} from "test/helpers/seed-owner";

describe("Owner API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: SeededAdmin;
  let owner: SeededOwner;
  let adminToken: string;
  let ownerToken: string;
  /** admin 토큰으로 생성된 점주 — afterAll에서 정리한다. */
  let createdOwnerPublicId: string | undefined;

  const createPayload = () => ({
    email: `e2e-created-${Date.now()}@test.local`,
    password: "created-owner-1234!",
    name: "e2e-created-owner",
    phone: "010-1111-2222",
    businessNumber: `${Date.now()}`.slice(-10),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [admin, owner] = await Promise.all([
      seedAdmin(prisma),
      seedOwnerWithStores(prisma, 0),
    ]);

    const [adminSignIn, ownerSignIn] = await Promise.all([
      request(app.getHttpServer())
        .post("/auth/v1/admin/signin")
        .send({ email: admin.email, password: admin.password })
        .expect(201),
      request(app.getHttpServer())
        .post("/auth/v1/owner/signin")
        .send({ email: owner.email, password: owner.password })
        .expect(201),
    ]);
    adminToken = adminSignIn.body.accessToken;
    ownerToken = ownerSignIn.body.accessToken;
  });

  afterAll(async () => {
    if (createdOwnerPublicId) {
      const created = await prisma.owner.findUnique({
        where: { publicId: createdOwnerPublicId },
        select: { id: true },
      });
      if (created) {
        await cleanupOwner(prisma, created.id);
      }
    }
    await Promise.all([
      cleanupAdmin(prisma, admin.admin.id),
      cleanupOwner(prisma, owner.owner.id),
    ]);
    await app.close();
  });

  describe("POST /identity/v1/owners", () => {
    it("admin 토큰이면 점주를 생성하고 비밀번호는 응답에서 제외한다", async () => {
      const payload = createPayload();
      const response = await request(app.getHttpServer())
        .post("/identity/v1/owners")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);

      createdOwnerPublicId = response.body.publicId;
      expect(response.body.email).toBe(payload.email);
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("id");
    });

    it("owner 토큰이면 403 FORBIDDEN — 점주는 점주를 만들 수 없다", async () => {
      const response = await request(app.getHttpServer())
        .post("/identity/v1/owners")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send(createPayload())
        .expect(403);

      expect(response.body.code).toBe("FORBIDDEN");
    });

    it("토큰이 없으면 401", async () => {
      await request(app.getHttpServer())
        .post("/identity/v1/owners")
        .send(createPayload())
        .expect(401);
    });

    it("역할 검사가 payload 검증보다 먼저다 — owner 토큰이면 잘못된 본문도 403", async () => {
      await request(app.getHttpServer())
        .post("/identity/v1/owners")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "not-an-email" })
        .expect(403);
    });
  });
});
