import {
  CATEGORY_NAME_MAX,
  MENU_DESCRIPTION_MAX,
  MENU_NAME_MAX,
  PRICE_MAX,
  type MenuDraftCategory,
  type MenuDraftIssue,
  type MenuDraftItem,
  type MenuDraftResponse,
  type MenuExtraction,
} from "@ssurak/schema";

export interface DraftCategoryRef {
  publicId: string;
  name: string;
}

export interface MenuDraftContext {
  /** 매장의 기존 카테고리. 인식된 분류명을 여기에 붙일 수 있으면 새로 만들지 않는다. */
  categories: DraftCategoryRef[];
  /** 매장에 이미 등록된 메뉴 이름. 같은 메뉴판을 두 번 올렸을 때 중복을 표시한다. */
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

/**
 * 모델 출력을 사장님이 검토할 초안으로 바꾼다.
 *
 * 규격을 벗어난 항목을 버리지 않는 것이 핵심이다 — 40개 중 1개가 31자라고
 * 전체를 거절하면 사진을 다시 찍는 것 말고 할 수 있는 게 없다. 대신 값은 살릴 수
 * 있는 데까지 손질하고, 손댄 자리와 사람이 채워야 할 자리를 `issues`로 표시한다.
 *
 * 순수 함수다(DB·네트워크 없음). 인식 품질과 무관하게 이 변환의 정확성만 따로 검증한다.
 */
export function toMenuDraft(
  extraction: MenuExtraction,
  context: MenuDraftContext
): MenuDraftResponse {
  const categoryIndex = new Map(
    context.categories.map((category) => [
      normalizeKey(category.name),
      category,
    ])
  );

  // 매장의 기존 메뉴명으로 시작해 항목마다 채워 나간다.
  // 하나의 집합으로 "이미 등록됨"과 "이번 사진들 안에서 중복"을 함께 잡는다
  // (메뉴판을 여러 장 찍으면 겹치는 구간이 생기기 마련이다).
  const seenNames = new Set(context.existingMenuNames.map(normalizeKey));

  const items: MenuDraftItem[] = [];

  for (const raw of extraction.items) {
    const name = raw.name.normalize("NFC").trim();
    // 이름이 없으면 사장님이 고칠 대상 자체가 없다 — 빈 줄만 늘어난다.
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

    items.push({ name: boundedName, price, description, category, issues });
  }

  return {
    items,
    unreadableCount: resolveUnreadable(extraction.unreadableCount),
  };
}

/**
 * 가격을 도메인 범위(0~PRICE_MAX의 1원 단위 정수)로 맞춘다.
 *
 * 범위를 벗어난 값은 잘라 맞추지 않고 비운다. 자릿수 오인식(9,000 → 90000)을
 * 상한으로 클램프하면 그럴듯한 틀린 값이 남아 사장님이 그냥 저장해 버린다.
 * null이면 UI가 빈 칸으로 보여주므로 반드시 눈에 걸린다.
 */
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

/**
 * 인식된 분류명을 기존 카테고리·신규 카테고리·미정 중 하나로 확정한다.
 *
 * 저장할 수 없는 이름(20자 초과)은 `new`로 내보내지 않는다 — 확정 단계에서
 * 어차피 거절될 값을 초안에 남기면 사장님이 저장 버튼을 눌러야 알게 된다.
 */
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
