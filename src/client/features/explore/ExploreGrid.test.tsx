import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// useVirtualizer mock: 모든 행을 가상 아이템으로 반환 (JSDOM에서 레이아웃 불가)
const mockMeasureElement = vi.fn();
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => {
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      key: String(i),
      start: i * opts.estimateSize(),
      size: opts.estimateSize(),
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * opts.estimateSize(),
      measureElement: mockMeasureElement,
    };
  },
}));

vi.mock('@/client/features/cards/ProductCard', () => ({
  default: ({ product }: { product: { id: string } }) => (
    <div data-testid={`product-card-${product.id}`}>ProductCard</div>
  ),
  ProductCardSkeleton: () => <div data-testid="product-skeleton">Skeleton</div>,
}));

vi.mock('@/client/features/cards/StoreCard', () => ({
  default: ({ store }: { store: { id: string } }) => (
    <div data-testid={`store-card-${store.id}`}>StoreCard</div>
  ),
  StoreCardSkeleton: () => <div data-testid="store-skeleton">Skeleton</div>,
}));

vi.mock('@/client/features/cards/ClinicCard', () => ({
  default: ({ clinic }: { clinic: { id: string } }) => (
    <div data-testid={`clinic-card-${clinic.id}`}>ClinicCard</div>
  ),
  ClinicCardSkeleton: () => <div data-testid="clinic-skeleton">Skeleton</div>,
}));

vi.mock('@/client/features/cards/TreatmentCard', () => ({
  default: ({ treatment }: { treatment: { id: string } }) => (
    <div data-testid={`treatment-card-${treatment.id}`}>TreatmentCard</div>
  ),
  TreatmentCardSkeleton: () => <div data-testid="treatment-skeleton">Skeleton</div>,
}));

vi.mock('./ExploreEmptyState', () => ({
  default: () => <div data-testid="empty-state">Empty</div>,
}));

import ExploreGrid from './ExploreGrid';

describe('ExploreGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // JSDOM 기본: matchMedia는 모바일 (lg 미매칭 → 2열)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false, // lg 미매칭 → 2열
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  // --- 기존 테스트: 스켈레톤, 빈 상태, 도메인별 렌더링 ---

  it('isLoading=true 시 스켈레톤 표시 (products)', () => {
    render(
      <ExploreGrid domain="products" items={[]} locale="en" isLoading={true} onResetFilters={vi.fn()} />,
    );
    expect(screen.getAllByTestId('product-skeleton')).toHaveLength(6);
  });

  it('isLoading=true 시 stores 스켈레톤 표시', () => {
    render(
      <ExploreGrid domain="stores" items={[]} locale="en" isLoading={true} onResetFilters={vi.fn()} />,
    );
    expect(screen.getAllByTestId('store-skeleton')).toHaveLength(6);
  });

  it('items 비어있으면 EmptyState 표시', () => {
    render(
      <ExploreGrid domain="products" items={[]} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('products 도메인에서 ProductCard 렌더링', () => {
    const items = [{ id: 'p1', name: { en: 'Serum' } }, { id: 'p2', name: { en: 'Cream' } }];
    render(
      <ExploreGrid domain="products" items={items} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('product-card-p1')).toBeDefined();
    expect(screen.getByTestId('product-card-p2')).toBeDefined();
  });

  it('stores 도메인에서 StoreCard 렌더링', () => {
    render(
      <ExploreGrid domain="stores" items={[{ id: 's1', name: { en: 'OY' } }]} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('store-card-s1')).toBeDefined();
  });

  it('clinics 도메인에서 ClinicCard 렌더링', () => {
    render(
      <ExploreGrid domain="clinics" items={[{ id: 'c1', name: { en: 'Clinic' } }]} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('clinic-card-c1')).toBeDefined();
  });

  it('treatments 도메인에서 TreatmentCard 렌더링', () => {
    render(
      <ExploreGrid domain="treatments" items={[{ id: 't1', name: { en: 'Laser' } }]} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    expect(screen.getByTestId('treatment-card-t1')).toBeDefined();
  });

  // --- 가상 스크롤 테스트 ---

  it('가상 스크롤 컨테이너 구조: scroll container + total size wrapper 존재', () => {
    const items = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
    const { container } = render(
      <ExploreGrid domain="products" items={items} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    // 스크롤 컨테이너 (overflow 설정된 부모)
    const scrollContainer = container.querySelector('[data-testid="virtual-scroll-container"]');
    expect(scrollContainer).not.toBeNull();
    // 전체 높이를 표현하는 inner div
    const totalSizeDiv = scrollContainer?.firstElementChild;
    expect(totalSizeDiv).not.toBeNull();
    expect(totalSizeDiv?.getAttribute('style')).toContain('height');
  });

  it('아이템이 행 단위로 그룹핑 (모바일 2열: 5개 → 3행)', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }));
    const { container } = render(
      <ExploreGrid domain="products" items={items} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    // data-index 속성이 있는 행 요소 = 3개 (ceil(5/2))
    const rows = container.querySelectorAll('[data-index]');
    expect(rows).toHaveLength(3);
  });

  it('데스크톱 3열: 7개 아이템 → 3행', () => {
    // lg 매칭 → 3열
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('1024'), // lg breakpoint
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const items = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}` }));
    const { container } = render(
      <ExploreGrid domain="products" items={items} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    // ceil(7/3) = 3행
    const rows = container.querySelectorAll('[data-index]');
    expect(rows).toHaveLength(3);
  });

  it('각 가상 행에 올바른 카드가 배치 (2열 기준)', () => {
    const items = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }];
    const { container } = render(
      <ExploreGrid domain="products" items={items} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    // 행 0: p0, p1
    const row0 = container.querySelector('[data-index="0"]');
    expect(row0?.querySelector('[data-testid="product-card-p0"]')).not.toBeNull();
    expect(row0?.querySelector('[data-testid="product-card-p1"]')).not.toBeNull();
    // 행 1: p2, p3
    const row1 = container.querySelector('[data-index="1"]');
    expect(row1?.querySelector('[data-testid="product-card-p2"]')).not.toBeNull();
    expect(row1?.querySelector('[data-testid="product-card-p3"]')).not.toBeNull();
    // 행 2: p4 (마지막 행, 1개만)
    const row2 = container.querySelector('[data-index="2"]');
    expect(row2?.querySelector('[data-testid="product-card-p4"]')).not.toBeNull();
  });

  it('가상 행에 position: absolute + translateY 스타일 적용', () => {
    const items = [{ id: 'p0' }, { id: 'p1' }, { id: 'p2' }];
    const { container } = render(
      <ExploreGrid domain="products" items={items} locale="en" isLoading={false} onResetFilters={vi.fn()} />,
    );
    const row0 = container.querySelector('[data-index="0"]');
    const style = row0?.getAttribute('style') ?? '';
    expect(style).toContain('position');
    expect(style).toContain('translateY');
  });
});
