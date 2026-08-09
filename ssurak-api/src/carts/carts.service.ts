import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { createId } from "@paralleldrive/cuid2";
import type {
  Cart,
  PublicCartItem,
  SessionWithTable,
  TableSession,
} from "@ssurak/db";
import type Redis from "ioredis";
import Redlock from "redlock";
import { cartSchema } from "@ssurak/schema";
import type { MenuOptionSelection, OptionSnapshotGroup } from "@ssurak/schema";
import { PrismaService } from "src/prisma/prisma.service";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";
import { REDIS_CLIENT, REDLOCK_CLIENT } from "../redis/redis.provider";
import { validateMenuAvailableOrThrow } from "src/common/validate/menu/available";
import {
  explicitOptionIdsOf,
  extractSelectionsFromSnapshot,
  getValidatedMenuOptionsSnapshot,
  mergeSelections,
  ValidateMenuOptionsContext,
} from "src/common/validate/menu/options";
import { MENU_VALIDATION_FIELDS_SELECT } from "src/common/query/menu-query.const";
import {
  CreateCartItemPayloadDto,
  UpdateCartItemPayloadDto,
} from "src/dto/request/cart.dto";
import { CartSubscriber } from "src/realtime/cart-events.service";
import { MenuImageService } from "src/common/image/menu-image.service";
import { MetaInfo } from "src/realtime/realtime.constants";

type ReturnCart<MetaKeys extends keyof MetaInfoList = never> = {
  cart: Cart;
  subscriber: CartSubscriber;
} & MetaInfo<MetaInfoList, MetaKeys>;

type MetaInfoList = { menuName: string; isMerged?: boolean };

@Injectable()
export class CartService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDLOCK_CLIENT) private readonly redlock: Redlock,
    private readonly prismaService: PrismaService,
    private readonly menuImageService: MenuImageService
  ) {}

  private cartKey(sessionToken: string) {
    return `cart:${sessionToken}`;
  }

  private cartLockKey(sessionToken: string) {
    return `lock:${this.cartKey(sessionToken)}`;
  }

  private ttlSeconds(expiresAt: Date) {
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }

  private subscriberOf(session: SessionWithTable): CartSubscriber {
    return {
      storePublicId: session.table.store.publicId,
      tablePublicId: session.table.publicId,
    };
  }

  private async withCartLock<T>(
    sessionToken: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lock = await this.redlock
      .acquire([this.cartLockKey(sessionToken)], 3000)
      .catch(() => {
        throw new HttpException(
          exceptionContentsIs("CART_LOCK_FAILED"),
          HttpStatus.SERVICE_UNAVAILABLE
        );
      });

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  private async readCart(sessionToken: string): Promise<Cart> {
    const defaultCart: Cart = {
      sessionToken,
      menus: [],
      updatedAt: "",
    };

    const raw =
      (await this.redis.get(this.cartKey(sessionToken))) ||
      JSON.stringify(defaultCart);

    try {
      const jsonParsed = JSON.parse(raw);
      return cartSchema.parse(jsonParsed);
    } catch {
      await this.redis.del(this.cartKey(sessionToken));
      throw new HttpException(
        exceptionContentsIs("CART_JSON_PARSE_ERROR"),
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }
  }

  private async writeCart(session: TableSession, cart: Cart): Promise<Cart> {
    const ttl = this.ttlSeconds(session.expiresAt);
    if (ttl <= 0) {
      throw new HttpException(
        exceptionContentsIs("SESSION_EXPIRED"),
        HttpStatus.BAD_REQUEST
      );
    }

    cart.updatedAt = new Date().toISOString();
    await this.redis.setex(
      this.cartKey(session.sessionToken),
      ttl,
      JSON.stringify(cart)
    );

    return cart;
  }

  async getCart(sessionToken: string): Promise<Cart> {
    return this.readCart(sessionToken);
  }

  private async getOptionsPriceWithValidate(
    session: TableSession,
    menuPublicId: string,
    options: MenuOptionSelection[] | undefined,
    context: ValidateMenuOptionsContext = {}
  ) {
    const menu = await this.prismaService.menu.findFirstOrThrow({
      where: {
        publicId: menuPublicId,
        deletedAt: null,
        category: {
          store: { tables: { some: { id: session.tableId } } },
        },
      },
      select: MENU_VALIDATION_FIELDS_SELECT,
    });

    validateMenuAvailableOrThrow(menu);

    return { menu, ...getValidatedMenuOptionsSnapshot(menu, options, context) };
  }

  /**
   * 옵션 조합 지문. 같은 메뉴·같은 옵션을 담으면 한 줄로 합쳐지는 기준이다.
   * 샷 2개와 1개는 다른 항목이라 합쳐지면 안 된다.
   */
  private getCartItemFingerprint(
    menuPublicId: string,
    options: OptionSnapshotGroup[] = []
  ): string {
    const canonical = [...options]
      .sort((a, b) => a.optionId.localeCompare(b.optionId))
      .map((group) => {
        const choices = [...group.choices]
          .sort((a, b) => a.choiceId.localeCompare(b.choiceId))
          .map((choice) => `${choice.choiceId}x${choice.quantity}`)
          .join(",");
        return `${group.optionId}:${choices}`;
      })
      .join("|");

    return `${menuPublicId}|${canonical}`;
  }

  async addItem(
    sessionWithTable: SessionWithTable,
    payload: CreateCartItemPayloadDto
  ): Promise<ReturnCart<"menuName" | "isMerged">> {
    const { optionsPrice, optionsSnapshot, menu } =
      await this.getOptionsPriceWithValidate(
        sessionWithTable,
        payload.menuPublicId,
        payload.options
      );

    return this.withCartLock(sessionWithTable.sessionToken, async () => {
      const cart = await this.readCart(sessionWithTable.sessionToken);
      // 지문은 페이로드가 아니라 검증을 통과한 스냅샷으로 계산한다 — 그래야 표현이 달라도
      // 실제 선택이 같으면 같은 지문이 나온다.
      const fingerprint = this.getCartItemFingerprint(
        payload.menuPublicId,
        optionsSnapshot?.options
      );
      const existingItem = cart.menus.find(
        (item) => item.fingerprint === fingerprint
      );

      if (existingItem) {
        existingItem.quantity += payload.quantity;
        const updated = await this.writeCart(sessionWithTable, cart);

        return {
          cart: updated,
          subscriber: this.subscriberOf(sessionWithTable),
          meta: { menuName: existingItem.menuName, isMerged: true },
        };
      }

      const item: PublicCartItem = {
        id: createId(),
        menuPublicId: menu.publicId,
        menuName: menu.name,
        menuImageUrl: this.menuImageService.thumbnailUrlOf(menu.imageKey),
        basePrice: menu.price,
        optionsPrice,
        unitPrice: menu.price + optionsPrice,
        quantity: payload.quantity,
        ...(optionsSnapshot && { options: optionsSnapshot.options }),
        addedAt: new Date().toISOString(),
        fingerprint,
      };

      cart.menus.push(item);
      const updated = await this.writeCart(sessionWithTable, cart);

      return {
        cart: updated,
        subscriber: this.subscriberOf(sessionWithTable),
        meta: { menuName: menu.name },
      };
    });
  }

  async updateItem(
    sessionWithTable: SessionWithTable,
    cartItemId: string,
    payload: UpdateCartItemPayloadDto
  ): Promise<ReturnCart<"menuName" | "isMerged">> {
    const preCart = await this.readCart(sessionWithTable.sessionToken);
    const preItem = preCart.menus.find((i) => i.id === cartItemId);
    if (!preItem) {
      throw new HttpException(
        exceptionContentsIs("CART_ITEM_NOT_FOUND"),
        HttpStatus.NOT_FOUND
      );
    }

    return this.withCartLock(sessionWithTable.sessionToken, async () => {
      const cart = await this.readCart(sessionWithTable.sessionToken);
      const updateItem = cart.menus.find((i) => i.id === cartItemId);
      if (!updateItem) {
        throw new HttpException(
          exceptionContentsIs("CART_ITEM_NOT_FOUND"),
          HttpStatus.NOT_FOUND
        );
      }

      // 페이로드에 없는 그룹은 기존 선택을 유지한다(그룹 단위 병합).
      const selections = mergeSelections(
        extractSelectionsFromSnapshot(
          updateItem.options && { options: updateItem.options }
        ),
        payload.options
      );

      const { optionsPrice, optionsSnapshot, menu } =
        await this.getOptionsPriceWithValidate(
          sessionWithTable,
          updateItem.menuPublicId,
          selections,
          { explicitOptionIds: explicitOptionIdsOf(payload.options) }
        );

      const fingerprint = this.getCartItemFingerprint(
        updateItem.menuPublicId,
        optionsSnapshot?.options
      );

      const existingItem = cart.menus.find(
        (item) => item.id !== cartItemId && item.fingerprint === fingerprint
      );

      if (existingItem) {
        existingItem.quantity += payload.quantity ?? updateItem.quantity;

        cart.menus = cart.menus.filter((i) => i.id !== cartItemId);
        const updated = await this.writeCart(sessionWithTable, cart);

        return {
          cart: updated,
          subscriber: this.subscriberOf(sessionWithTable),
          meta: { menuName: existingItem.menuName, isMerged: true },
        };
      }

      Object.assign(updateItem, {
        basePrice: menu.price,
        optionsPrice,
        unitPrice: menu.price + optionsPrice,
        quantity: payload.quantity ?? updateItem.quantity,
        fingerprint,
        options: optionsSnapshot?.options,
      });

      const updated = await this.writeCart(sessionWithTable, cart);

      return {
        cart: updated,
        subscriber: this.subscriberOf(sessionWithTable),
        meta: { menuName: updateItem.menuName },
      };
    });
  }

  async removeItem(
    sessionWithTable: SessionWithTable,
    cartItemId: string
  ): Promise<ReturnCart<"menuName">> {
    return this.withCartLock(sessionWithTable.sessionToken, async () => {
      const cart = await this.readCart(sessionWithTable.sessionToken);
      const removed = cart.menus.find((i) => i.id === cartItemId);
      if (!removed) {
        throw new HttpException(
          exceptionContentsIs("CART_ITEM_NOT_FOUND"),
          HttpStatus.NOT_FOUND
        );
      }

      cart.menus = cart.menus.filter((i) => i.id !== cartItemId);
      const updated = await this.writeCart(sessionWithTable, cart);

      return {
        cart: updated,
        subscriber: this.subscriberOf(sessionWithTable),
        meta: { menuName: removed.menuName },
      };
    });
  }

  async clearCart(sessionWithTable: SessionWithTable): Promise<CartSubscriber> {
    return this.withCartLock(sessionWithTable.sessionToken, async () => {
      await this.redis.del(this.cartKey(sessionWithTable.sessionToken));
      return this.subscriberOf(sessionWithTable);
    });
  }

  /**
   * 주문된 항목만 수량 기준으로 차감한다. 주문 처리 중 다른 기기에서
   * 새로 담은 항목이나 늘어난 수량은 보존한다. 전부 차감되면 키를 삭제한다.
   * dedupeKey(주문 idempotencyKey)가 있으면 같은 주문의 중복 요청이
   * 두 번 차감하지 않도록 첫 요청만 차감한다.
   */
  async removeOrderedItems(
    sessionWithTable: SessionWithTable,
    orderedItems: Pick<PublicCartItem, "id" | "quantity">[],
    dedupeKey?: string
  ): Promise<CartSubscriber> {
    return this.withCartLock(sessionWithTable.sessionToken, async () => {
      if (
        dedupeKey &&
        !(await this.claimDeduction(sessionWithTable, dedupeKey))
      ) {
        return this.subscriberOf(sessionWithTable);
      }

      const cart = await this.readCart(sessionWithTable.sessionToken);
      const orderedQuantityById = new Map(
        orderedItems.map((item) => [item.id, item.quantity])
      );

      cart.menus = cart.menus.flatMap((item) => {
        const orderedQuantity = orderedQuantityById.get(item.id);
        if (orderedQuantity === undefined) return [item];
        const remaining = item.quantity - orderedQuantity;
        return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
      });

      if (cart.menus.length === 0) {
        await this.redis.del(this.cartKey(sessionWithTable.sessionToken));
        return this.subscriberOf(sessionWithTable);
      }

      await this.writeCart(sessionWithTable, cart);
      return this.subscriberOf(sessionWithTable);
    });
  }

  /**
   * 주문 단위 차감 기록. cart 락 안에서 NX로 선점하므로 같은 dedupeKey의
   * 두 번째 요청은 false를 받는다. 기록 TTL은 세션 만료에 맞춘다.
   */
  private async claimDeduction(
    session: SessionWithTable,
    dedupeKey: string
  ): Promise<boolean> {
    const ttl = this.ttlSeconds(session.expiresAt);
    if (ttl <= 0) return true; // 세션 만료 직전이면 기록 없이 진행 (쓰기 단계에서 걸러진다)

    const claimed = await this.redis.set(
      `cart:deducted:${dedupeKey}`,
      "1",
      "EX",
      ttl,
      "NX"
    );
    return claimed === "OK";
  }

  async getCartByStore(storeId: string, sessionToken: string): Promise<Cart> {
    const session = await this.prismaService.tableSession.findFirst({
      where: {
        sessionToken,
        table: { store: { publicId: storeId } },
      },
    });

    if (!session) {
      throw new HttpException(
        exceptionContentsIs("INVALID_TABLE_SESSION"),
        HttpStatus.NOT_FOUND
      );
    }

    return this.readCart(sessionToken);
  }
}
