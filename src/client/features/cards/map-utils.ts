import "client-only";

// ============================================================
// 지도 링크 추출 유틸 — StoreCard, ClinicCard, card-mapper에서 공유.
// G-2: 중복 제거. 단일 정의.
// L-0b: client-only guard.
// ============================================================

const MAP_LINK_TYPES = ["kakao_map", "naver_map", "map"];

export function extractMapUrl(links: Array<{ type: string; url: string }> | null): string | undefined {
  if (!links) return undefined;
  const mapLink = links.find((l) => MAP_LINK_TYPES.includes(l.type));
  return mapLink?.url;
}
