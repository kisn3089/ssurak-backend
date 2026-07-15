import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import {
  cleanupOwner,
  seedOwnerWithStores,
  SeededOwner,
} from "test/helpers/seed-owner";

describe("Stores API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerA: SeededOwner;
  let ownerB: SeededOwner;
  let tokenA: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [ownerA, ownerB] = await Promise.all([
      seedOwnerWithStores(prisma, 2),
      seedOwnerWithStores(prisma, 1),
    ]);

    const signIn = await request(app.getHttpServer())
      .post("/auth/v1/owner/signin")
      .send({ email: ownerA.email, password: ownerA.password })
      .expect(201);
    tokenA = signIn.body.accessToken;
  });

  afterAll(async () => {
    await Promise.all([
      cleanupOwner(prisma, ownerA.owner.id),
      cleanupOwner(prisma, ownerB.owner.id),
    ]);
    await app.close();
  });

  describe("인증 경계", () => {
    it("토큰 없이 요청하면 401", async () => {
      const response = await request(app.getHttpServer())
        .get("/stores/v1")
        .expect(401);

      expect(response.body.code).toBe("UNAUTHORIZED");
    });

    it("유효하지 않은 토큰이면 401", async () => {
      await request(app.getHttpServer())
        .get("/stores/v1")
        .set("Authorization", "Bearer invalid.jwt.token")
        .expect(401);
    });
  });

  describe("GET /stores/v1", () => {
    it("본인 소유 매장만 반환하고 내부 식별자는 노출하지 않는다", async () => {
      const response = await request(app.getHttpServer())
        .get("/stores/v1")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);

      const returnedIds = response.body.map(
        (store: { publicId: string }) => store.publicId
      );
      expect(returnedIds.sort()).toEqual(
        ownerA.stores.map((s) => s.publicId).sort()
      );
      // ownerB의 매장이 섞여 나오면 안 된다
      expect(returnedIds).not.toContain(ownerB.stores[0].publicId);

      for (const store of response.body) {
        expect(store).not.toHaveProperty("id");
        expect(store).not.toHaveProperty("ownerId");
      }
    });
  });

  describe("GET /stores/v1/:storeId", () => {
    it("본인 매장은 조회된다", async () => {
      const target = ownerA.stores[0];
      const response = await request(app.getHttpServer())
        .get(`/stores/v1/${target.publicId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(200);

      expect(response.body.publicId).toBe(target.publicId);
      expect(response.body.name).toBe(target.name);
    });

    it("다른 owner의 매장이면 403 FORBIDDEN", async () => {
      const response = await request(app.getHttpServer())
        .get(`/stores/v1/${ownerB.stores[0].publicId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(403);

      expect(response.body.code).toBe("FORBIDDEN");
    });

    it("존재하지 않는 매장이면 404 NOT_FOUND", async () => {
      const response = await request(app.getHttpServer())
        .get("/stores/v1/nonexistentstoreid1234")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(404);

      expect(response.body.code).toBe("NOT_FOUND");
    });
  });

  describe("미구현 엔드포인트", () => {
    it("POST /stores/v1 은 501을 반환한다", async () => {
      await request(app.getHttpServer())
        .post("/stores/v1")
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(501);
    });

    it("DELETE /stores/v1/:storeId 도 접근 가드 통과 후 501을 반환한다", async () => {
      await request(app.getHttpServer())
        .delete(`/stores/v1/${ownerA.stores[0].publicId}`)
        .set("Authorization", `Bearer ${tokenA}`)
        .expect(501);
    });
  });
});
