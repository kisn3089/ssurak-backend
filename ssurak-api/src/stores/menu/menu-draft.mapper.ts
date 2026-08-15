import { NotFoundException } from "@nestjs/common";
import {
  BULK_MENU_MAX,
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
import { normalizeNameKey } from "src/utils/helper/normalizeName";

export interface DraftCategoryRef {
  publicId: string;
  name: string;
}

export interface MenuDraftContext {
  categories: DraftCategoryRef[];
  existingMenuNames: string[];
}

const normalizeKey = normalizeNameKey;

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
    if (draftItems.length >= BULK_MENU_MAX) break;

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

const STATEFUL_ISSUES: readonly MenuDraftIssue[] = [
  "PRICE_MISSING",
  "CATEGORY_UNKNOWN",
  "DUPLICATE_NAME",
];

/** 저장된 초안을 현재 매장 상태 기준으로 재계산한다. */
export function recomputeMenuDraftIssues(
  items: MenuDraftItem[],
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

  return items.map((item) => {
    const issues = item.issues.filter(
      (issue) => !STATEFUL_ISSUES.includes(issue)
    );

    const category = resolveStoredCategory(
      item.category,
      byPublicId,
      byName,
      issues
    );

    if (item.price === null) issues.push("PRICE_MISSING");

    const key = normalizeKey(item.name);
    if (seenNames.has(key)) issues.push("DUPLICATE_NAME");
    seenNames.add(key);

    return { ...item, category, issues };
  });
}

/**
 * 추출 이후 카테고리가 지워졌다고 사진 재업로드가 404가 되면
 * 사장님이 할 수 있는 게 없다. 붙일 곳이 없으면 "골라주세요"로 되돌린다.
 */
function resolveStoredCategory(
  category: MenuDraftCategory,
  byPublicId: Map<string, DraftCategoryRef>,
  byName: Map<string, DraftCategoryRef>,
  issues: MenuDraftIssue[]
): MenuDraftCategory {
  const matched =
    category.kind === "existing"
      ? (byPublicId.get(category.categoryId) ??
        byName.get(normalizeKey(category.name)))
      : category.kind === "new"
        ? byName.get(normalizeKey(category.name))
        : undefined;

  if (matched) {
    return {
      kind: "existing",
      categoryId: matched.publicId,
      name: matched.name,
    };
  }

  // 이름만 살아 있는 신규 카테고리는 확정 단계에서 만들어진다.
  if (category.kind === "new") return category;

  issues.push("CATEGORY_UNKNOWN");
  return { kind: "unknown" };
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

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;

  const sliced = value.slice(0, max);
  const last = sliced.charCodeAt(max - 1);

  // BMP 밖 문자(이모지 등)는 상위 서러게이트(U+D800~U+DBFF) + 하위 서러게이트(U+DC00~U+DFFF)
  // 두 코드유닛으로 저장된다. 경계가 그 사이에 떨어지면 상위 짝만 남아 깨진 글자가 되므로
  // 반쪽을 떼어낸다 — 이 경우만 결과가 max-1이 된다.
  return last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced;
}
