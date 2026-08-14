import { NotFoundException } from "@nestjs/common";
import {
  CATEGORY_NAME_MAX,
  MENU_DESCRIPTION_MAX,
  MENU_NAME_MAX,
  PRICE_MAX,
  type MenuDraftCategory,
  type MenuDraftContent,
  type MenuDraftIssue,
  type MenuDraftItem,
  type MenuDraftItemPayload,
  type MenuExtraction,
} from "@ssurak/schema";

export interface DraftCategoryRef {
  publicId: string;
  name: string;
}

export interface MenuDraftContext {
  categories: DraftCategoryRef[];
  existingMenuNames: string[];
}

/**
 * 이름 비교용 정규화 키.
 *
 * NFC 정규화가 필요한 이유: 한글은 조합형(NFD)과 완성형(NFC)이 코드포인트가 달라
 * 눈에 같아 보여도 문자열 비교가 어긋난다. 모델 출력과 DB 값의 출처가 다르므로
 * 한쪽으로 모으지 않으면 "찌개류"가 매칭되지 않는 일이 생긴다.
 */
const normalizeKey = (raw: string): string =>
  raw.normalize("NFC").trim().toLowerCase().replace(/\s+/g, "");

export function toMenuDraft(
  extraction: MenuExtraction,
  context: MenuDraftContext
): MenuDraftContent {
  const categoryIndex = new Map(
    context.categories.map((category) => [
      normalizeKey(category.name),
      category,
    ])
  );

  const seenNames = new Set(context.existingMenuNames.map(normalizeKey));

  const draftItems: MenuDraftItem[] = [];

  for (const raw of extraction.items) {
    const name = raw.name.normalize("NFC").trim();
    if (name.length === 0) continue;

    const issues: MenuDraftIssue[] = [];

    const boundedName = truncate(name, MENU_NAME_MAX);
    if (boundedName.length < name.length) issues.push("NAME_TRUNCATED");

    const price = resolvePrice(raw.price, issues);
    const description = resolveDescription(raw.description, issues);
    const category = resolveCategory(raw.categoryName, categoryIndex, issues);

    const key = normalizeKey(boundedName);
    if (seenNames.has(key)) issues.push("DUPLICATE_NAME");
    seenNames.add(key);

    draftItems.push({
      name: boundedName,
      price,
      description,
      category,
      issues,
    });
  }

  return {
    items: draftItems,
    unreadableCount: resolveUnreadable(extraction.unreadableCount),
  };
}

/**
 * 사장님이 고친 항목을 저장할 초안 항목으로 되돌린다.
 *
 * `issues`를 요청에서 받지 않고 다시 계산하는 이유: 가격을 채웠는데 PRICE_MISSING이
 * 그대로 남아 있거나, 클라이언트가 표시를 지워 보내는 걸 막기 위해서다. 길이·가격 범위는
 * 요청 스키마가 이미 거절하므로 여기서 남는 표시는 "아직 안 정한 것"과 중복뿐이다.
 */
export function reviseMenuDraftItems(
  payload: MenuDraftItemPayload[],
  context: MenuDraftContext
): MenuDraftItem[] {
  const byPublicId = new Map(
    context.categories.map((category) => [category.publicId, category])
  );
  const byName = new Map(
    context.categories.map((category) => [
      normalizeKey(category.name),
      category,
    ])
  );

  const seenNames = new Set(context.existingMenuNames.map(normalizeKey));

  return payload.map((raw) => {
    const issues: MenuDraftIssue[] = [];

    const name = raw.name.normalize("NFC").trim();
    const category = resolveEditedCategory(raw, byPublicId, byName, issues);

    if (raw.price === null) issues.push("PRICE_MISSING");

    const key = normalizeKey(name);
    if (seenNames.has(key)) issues.push("DUPLICATE_NAME");
    seenNames.add(key);

    return {
      name,
      price: raw.price,
      description: normalizeDescription(raw.description),
      category,
      issues,
    };
  });
}

/** 사장님이 고른 카테고리를 확정한다. 이름으로 보냈어도 매장에 있으면 기존 것에 붙인다. */
function resolveEditedCategory(
  raw: MenuDraftItemPayload,
  byPublicId: Map<string, DraftCategoryRef>,
  byName: Map<string, DraftCategoryRef>,
  issues: MenuDraftIssue[]
): MenuDraftCategory {
  if (raw.categoryId !== undefined) {
    const matched = byPublicId.get(raw.categoryId);
    // 다른 매장의 카테고리나 그 사이 지워진 카테고리를 초안에 심지 않는다.
    if (!matched) {
      throw new NotFoundException(
        `카테고리 ${raw.categoryId}를 찾을 수 없습니다.`
      );
    }
    return {
      kind: "existing",
      categoryId: matched.publicId,
      name: matched.name,
    };
  }

  if (raw.categoryName !== undefined) {
    const name = raw.categoryName.normalize("NFC").trim();
    const matched = byName.get(normalizeKey(name));

    return matched
      ? { kind: "existing", categoryId: matched.publicId, name: matched.name }
      : { kind: "new", name };
  }

  issues.push("CATEGORY_UNKNOWN");
  return { kind: "unknown" };
}

function normalizeDescription(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const description = raw.normalize("NFC").trim();
  return description.length === 0 ? null : description;
}

function resolvePrice(
  raw: number | null,
  issues: MenuDraftIssue[]
): number | null {
  if (raw === null) {
    issues.push("PRICE_MISSING");
    return null;
  }
  if (!Number.isFinite(raw) || raw < 0 || raw > PRICE_MAX) {
    issues.push("PRICE_OUT_OF_RANGE");
    return null;
  }
  if (!Number.isInteger(raw)) {
    issues.push("PRICE_ROUNDED");
    return Math.round(raw);
  }
  return raw;
}

function resolveDescription(
  raw: string | null,
  issues: MenuDraftIssue[]
): string | null {
  if (raw === null) return null;

  const description = raw.normalize("NFC").trim();
  if (description.length === 0) return null;

  const bounded = truncate(description, MENU_DESCRIPTION_MAX);
  if (bounded.length < description.length) issues.push("DESCRIPTION_TRUNCATED");

  return bounded;
}

/** 인식된 분류명을 기존 카테고리·신규 카테고리·미정 중 하나로 확정한다. */
function resolveCategory(
  raw: string | null,
  index: Map<string, DraftCategoryRef>,
  issues: MenuDraftIssue[]
): MenuDraftCategory {
  const name = raw === null ? "" : raw.normalize("NFC").trim();

  if (name.length === 0) {
    issues.push("CATEGORY_UNKNOWN");
    return { kind: "unknown" };
  }

  const matched = index.get(normalizeKey(name));
  if (matched) {
    return {
      kind: "existing",
      categoryId: matched.publicId,
      name: matched.name,
    };
  }

  if (name.length > CATEGORY_NAME_MAX) {
    issues.push("CATEGORY_UNKNOWN");
    return { kind: "unknown" };
  }

  return { kind: "new", name };
}

/** 모델이 음수·소수·NaN을 넣어도 화면에 그대로 새어 나가지 않게 막는다. */
function resolveUnreadable(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

/**
 * 코드포인트 단위로 자른다.
 * `slice`는 UTF-16 코드유닛 기준이라 이모지가 섞이면 서로게이트 쌍이 반토막 난다.
 */
function truncate(value: string, max: number): string {
  const codePoints = [...value];
  return codePoints.length <= max ? value : codePoints.slice(0, max).join("");
}
