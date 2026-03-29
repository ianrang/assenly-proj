// ============================================================
// 사이트별 크롤링 설정 — data-collection.md §3, P2-V7
// 순수 데이터. 코드 로직 없음.
// 새 사이트 추가 = 이 파일에 SiteConfig 1개 추가 (P-7).
// ============================================================

// ── 타입 ──────────────────────────────────────────────────

/** 제품 상세 페이지 필드 CSS selector */
export interface SiteFieldSelectors {
  /** 제품명 (영문) */
  name: string;
  /** 가격 */
  price?: string;
  /** 카테고리 */
  category?: string;
  /** 이미지 URL (img src 또는 data 속성) */
  imageUrl?: string;
  /** 제품 설명 */
  description?: string;
}

/** 사이트 크롤링 설정 */
export interface SiteConfig {
  /** 브랜드/사이트명 */
  name: string;
  /** 사이트 기본 URL */
  baseUrl: string;
  /** 제품 목록 페이지 경로 (baseUrl 기준 상대 경로) */
  productListUrl: string;
  /** CSS selector */
  selectors: {
    /** 제품 목록에서 개별 제품 링크 */
    productLink: string;
    /** 제품 상세 페이지 필드 */
    fields: SiteFieldSelectors;
  };
  /** 출처 구분 — 올리브영은 수동검수 경유 필수 */
  source: "scraper-brand" | "scraper-oliveyoung";
}

// ── 사이트 설정 (P2-V7 robots.txt 허용 확인) ──────────────

export const SITE_CONFIGS: SiteConfig[] = [
  // ── 브랜드 공식 사이트 (1순위, 리스크 낮음) ──────────────
  {
    name: "cosrx",
    baseUrl: "https://www.cosrx.com",
    productListUrl: "/collections/all",
    selectors: {
      productLink: ".product-card a",
      fields: {
        name: "h1.product-title",
        price: ".product-price",
        category: ".breadcrumb",
        imageUrl: ".product-image img",
        description: ".product-description",
      },
    },
    source: "scraper-brand",
  },
  {
    name: "laneige",
    baseUrl: "https://www.laneige.com",
    productListUrl: "/en/skincare",
    selectors: {
      productLink: ".product-item a",
      fields: {
        name: "h1.product-name",
        price: ".product-price",
        category: ".breadcrumb-item",
        imageUrl: ".product-gallery img",
        description: ".product-detail-description",
      },
    },
    source: "scraper-brand",
  },
  {
    name: "innisfree",
    baseUrl: "https://www.innisfree.com",
    productListUrl: "/en/products",
    selectors: {
      productLink: ".product-card a",
      fields: {
        name: "h1.product-name",
        price: ".product-price",
        category: ".breadcrumb",
        imageUrl: ".product-image img",
        description: ".product-description",
      },
    },
    source: "scraper-brand",
  },

  // ── 올리브영 글로벌 (2순위, 보조 — 수동검수 경유 필수) ─────
  {
    name: "oliveyoung-global",
    baseUrl: "https://global.oliveyoung.com",
    productListUrl: "/product/list",
    selectors: {
      productLink: ".product-item a",
      fields: {
        name: "h2.product-name",
        price: ".product-price",
        category: ".category-path",
        imageUrl: ".product-thumb img",
        description: ".product-info",
      },
    },
    source: "scraper-oliveyoung",
  },
];
