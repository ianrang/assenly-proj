import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
});
