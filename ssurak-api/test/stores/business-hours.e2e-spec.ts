import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "src/prisma/prisma.service";
import { createTestApp } from "test/helpers/create-test-app";
import {
  cleanupOwner,
  seedOwnerWithStores,
  SeededOwner,
} from "test/helpers/seed-owner";

const hours = (hour: number) => hour * 60;

/** 평일 09:00~22:00, 월요일(1) 정기 휴무 */
const weekdayHours = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isClosed: dayOfWeek === 1,
  openMinute: hours(9),
  closeMinute: hours(22),
}));

describe("Store Business Hours API (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: SeededOwner;
  let outsider: SeededOwner;
  let token: string;
  let storeId: string;

  const api = () => request(app.getHttpServer());
  const auth = (req: request.Test) =>
    req.set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [owner, outsider] = await Promise.all([
      seedOwnerWithStores(prisma, 1),
      seedOwnerWithStores(prisma, 1),
    ]);
    storeId = owner.stores[0].publicId;

    const signIn = await api()
      .post("/auth/v1/owner/signin")
      .send({ email: owner.email, password: owner.password })
      .expect(201);
    token = signIn.body.accessToken;
  });

  afterEach(async () => {
    await prisma.storeBusinessHour.deleteMany({
      where: { storeId: owner.stores[0].id },
    });
    await prisma.storeClosure.deleteMany({
      where: { storeId: owner.stores[0].id },
    });
  });

  afterAll(async () => {
    await Promise.all([
      cleanupOwner(prisma, owner.owner.id),
      cleanupOwner(prisma, outsider.owner.id),
    ]);
    await app.close();
  });

  describe("PUT /stores/v1/:storeId/business-hours", () => {
    it("요일 전체를 교체하고 dayOfWeek 순으로 돌려준다", async () => {
      const response = await auth(
        api().put(`/stores/v1/${storeId}/business-hours`)
      )
        .send({ days: weekdayHours })
        .expect(200);

      expect(response.body).toHaveLength(7);
      expect(
        response.body.map((day: { dayOfWeek: number }) => day.dayOfWeek)
      ).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(response.body[1]).toMatchObject({ dayOfWeek: 1, isClosed: true });
      // 내부 식별자는 응답에 없다.
      expect(response.body[0]).not.toHaveProperty("id");
      expect(response.body[0]).not.toHaveProperty("storeId");
    });

    it("보내지 않은 요일은 삭제된다", async () => {
      await auth(api().put(`/stores/v1/${storeId}/business-hours`))
        .send({ days: weekdayHours })
        .expect(200);

      const response = await auth(
        api().put(`/stores/v1/${storeId}/business-hours`)
      )
        .send({ days: [weekdayHours[3]] })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].dayOfWeek).toBe(3);
    });

    it("빈 배열이면 영업시간 미설정 상태로 되돌아간다", async () => {
      await auth(api().put(`/stores/v1/${storeId}/business-hours`))
        .send({ days: weekdayHours })
        .expect(200);

      const response = await auth(
        api().put(`/stores/v1/${storeId}/business-hours`)
      )
        .send({ days: [] })
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it("같은 요일을 두 번 보내면 400", async () => {
      const response = await auth(
        api().put(`/stores/v1/${storeId}/business-hours`)
      )
        .send({ days: [weekdayHours[3], weekdayHours[3]] })
        .expect(400);

      expect(response.body.code).toBe("ZOD_PAYLOAD_FAILED");
    });

    it("마감이 오픈보다 앞서면 400", async () => {
      await auth(api().put(`/stores/v1/${storeId}/business-hours`))
        .send({
          days: [
            { dayOfWeek: 3, openMinute: hours(20), closeMinute: hours(9) },
          ],
        })
        .expect(400);
    });

    it("영업일 경계를 벗어난 시간이면 BUSINESS_HOURS_OUT_OF_RANGE(400)", async () => {
      // cutoff 기본값 300(05:00) → 04:00 오픈은 전날 영업일로 새어 들어간다.
      const response = await auth(
        api().put(`/stores/v1/${storeId}/business-hours`)
      )
        .send({
          days: [
            { dayOfWeek: 3, openMinute: hours(4), closeMinute: hours(20) },
          ],
        })
        .expect(400);

      expect(response.body.code).toBe("BUSINESS_HOURS_OUT_OF_RANGE");
    });

    it("자정을 넘기는 마감(26:00)은 허용된다", async () => {
      const response = await auth(
        api().put(`/stores/v1/${storeId}/business-hours`)
      )
        .send({
          days: [
            { dayOfWeek: 5, openMinute: hours(18), closeMinute: hours(26) },
          ],
        })
        .expect(200);

      expect(response.body[0].closeMinute).toBe(hours(26));
    });

    it("브레이크타임이 영업 시간 밖이면 400", async () => {
      await auth(api().put(`/stores/v1/${storeId}/business-hours`))
        .send({
          days: [
            {
              dayOfWeek: 3,
              openMinute: hours(9),
              closeMinute: hours(22),
              breakStartMinute: hours(23),
              breakEndMinute: hours(23) + 30,
            },
          ],
        })
        .expect(400);
    });

    it("남의 매장이면 StoreAccessGuard가 403으로 막는다", async () => {
      await auth(
        api().put(`/stores/v1/${outsider.stores[0].publicId}/business-hours`)
      )
        .send({ days: [] })
        .expect(403);
    });

    it("토큰이 없으면 401", async () => {
      await api()
        .put(`/stores/v1/${storeId}/business-hours`)
        .send({ days: [] })
        .expect(401);
    });
  });

  describe("휴무일 CRUD", () => {
    const createClosure = (body: Record<string, unknown>) =>
      auth(api().post(`/stores/v1/${storeId}/closures`)).send(body);

    it("등록하고 목록에서 조회한다", async () => {
      const created = await createClosure({
        date: "2026-12-25",
        reason: "성탄절 휴무",
      }).expect(201);

      expect(created.body).toMatchObject({
        date: "2026-12-25",
        reason: "성탄절 휴무",
        openMinute: null,
        closeMinute: null,
      });

      const list = await auth(
        api().get(
          `/stores/v1/${storeId}/closures?from=2026-12-01&to=2026-12-31`
        )
      ).expect(200);

      expect(list.body).toHaveLength(1);
      expect(list.body[0].publicId).toBe(created.body.publicId);
    });

    it("조회 구간 밖의 휴무일은 빠진다", async () => {
      await createClosure({ date: "2026-12-25", reason: "성탄절" }).expect(201);

      const list = await auth(
        api().get(
          `/stores/v1/${storeId}/closures?from=2027-01-01&to=2027-01-31`
        )
      ).expect(200);

      expect(list.body).toEqual([]);
    });

    it("특별 영업시간을 함께 등록할 수 있다", async () => {
      const created = await createClosure({
        date: "2026-12-31",
        reason: "연말 단축 영업",
        openMinute: hours(11),
        closeMinute: hours(18),
      }).expect(201);

      expect(created.body).toMatchObject({
        openMinute: hours(11),
        closeMinute: hours(18),
      });
    });

    it("오픈만 보내고 마감을 빠뜨리면 400", async () => {
      await createClosure({
        date: "2026-12-31",
        openMinute: hours(11),
      }).expect(400);
    });

    it("존재하지 않는 날짜면 400", async () => {
      await createClosure({ date: "2026-02-30" }).expect(400);
    });

    it("같은 날짜를 두 번 등록하면 409", async () => {
      await createClosure({ date: "2026-12-25" }).expect(201);

      const conflict = await createClosure({ date: "2026-12-25" }).expect(409);

      expect(conflict.body.code).toBe("CLOSURE_ALREADY_EXISTS");
    });

    it("사유와 특별 영업시간을 수정한다", async () => {
      const created = await createClosure({ date: "2026-12-25" }).expect(201);

      const updated = await auth(
        api().patch(`/stores/v1/${storeId}/closures/${created.body.publicId}`)
      )
        .send({
          reason: "단축 영업",
          openMinute: hours(12),
          closeMinute: hours(17),
        })
        .expect(200);

      expect(updated.body).toMatchObject({
        reason: "단축 영업",
        openMinute: hours(12),
        closeMinute: hours(17),
      });
    });

    it("특별 영업시간을 둘 다 null로 보내면 종일 휴무로 돌아간다", async () => {
      const created = await createClosure({
        date: "2026-12-31",
        openMinute: hours(11),
        closeMinute: hours(18),
      }).expect(201);

      const updated = await auth(
        api().patch(`/stores/v1/${storeId}/closures/${created.body.publicId}`)
      )
        .send({ openMinute: null, closeMinute: null })
        .expect(200);

      expect(updated.body.openMinute).toBeNull();
      expect(updated.body.closeMinute).toBeNull();
    });

    it("한쪽만 null로 만들면 400", async () => {
      const created = await createClosure({
        date: "2026-12-31",
        openMinute: hours(11),
        closeMinute: hours(18),
      }).expect(201);

      await auth(
        api().patch(`/stores/v1/${storeId}/closures/${created.body.publicId}`)
      )
        .send({ openMinute: null })
        .expect(400);
    });

    it("삭제하면 204이고 목록에서 사라진다", async () => {
      const created = await createClosure({ date: "2026-12-25" }).expect(201);

      await auth(
        api().delete(`/stores/v1/${storeId}/closures/${created.body.publicId}`)
      ).expect(204);

      const list = await auth(
        api().get(
          `/stores/v1/${storeId}/closures?from=2026-12-01&to=2026-12-31`
        )
      ).expect(200);

      expect(list.body).toEqual([]);
    });
  });

  describe("매장 설정 검증", () => {
    it("실재하지 않는 타임존이면 INVALID_TIMEZONE(400)", async () => {
      const response = await auth(api().patch(`/stores/v1/${storeId}`))
        .send({ timezone: "Asia/Nowhere" })
        .expect(400);

      expect(response.body.code).toBe("INVALID_TIMEZONE");
    });

    it("저장된 영업시간을 벗어나는 cutoff로는 바꿀 수 없다", async () => {
      await auth(api().put(`/stores/v1/${storeId}/business-hours`))
        .send({
          days: [
            { dayOfWeek: 3, openMinute: hours(9), closeMinute: hours(22) },
          ],
        })
        .expect(200);

      // 09:00 오픈인데 cutoff를 10:00으로 올리면 그 요일은 영원히 닫힌다.
      const response = await auth(api().patch(`/stores/v1/${storeId}`))
        .send({ businessDayCutoff: hours(10) })
        .expect(400);

      expect(response.body.code).toBe("BUSINESS_HOURS_OUT_OF_RANGE");
    });

    it("영업시간과 충돌하지 않으면 cutoff를 바꿀 수 있다", async () => {
      await auth(api().put(`/stores/v1/${storeId}/business-hours`))
        .send({
          days: [
            { dayOfWeek: 3, openMinute: hours(9), closeMinute: hours(22) },
          ],
        })
        .expect(200);

      const response = await auth(api().patch(`/stores/v1/${storeId}`))
        .send({ businessDayCutoff: hours(6) })
        .expect(200);

      expect(response.body.businessDayCutoff).toBe(hours(6));

      await auth(api().patch(`/stores/v1/${storeId}`))
        .send({ businessDayCutoff: 300 })
        .expect(200);
    });
  });

  describe("GET /stores/v1/:storeId/business-status", () => {
    it("영업시간 미설정이고 수동 스위치가 켜져 있으면 영업 중이다", async () => {
      await prisma.store.update({
        where: { id: owner.stores[0].id },
        data: { isOpen: true },
      });

      const response = await auth(
        api().get(`/stores/v1/${storeId}/business-status`)
      ).expect(200);

      expect(response.body).toMatchObject({ isOpen: true, reason: "OPEN" });
      expect(response.body.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("수동 스위치가 꺼져 있으면 MANUALLY_CLOSED", async () => {
      await prisma.store.update({
        where: { id: owner.stores[0].id },
        data: { isOpen: false },
      });

      const response = await auth(
        api().get(`/stores/v1/${storeId}/business-status`)
      ).expect(200);

      expect(response.body).toMatchObject({
        isOpen: false,
        reason: "MANUALLY_CLOSED",
        nextOpenAt: null,
      });
    });
  });
});
