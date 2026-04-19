import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import FilterChips from './FilterChips';

describe('FilterChips', () => {
  const mockOnRemove = vi.fn();

  it('필터가 없으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(
      <FilterChips domain="products" filters={{}} onRemove={mockOnRemove} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('단일 select 필터를 칩으로 표시한다', () => {
    render(
      <FilterChips
        domain="products"
        filters={{ category: 'skincare' }}
        onRemove={mockOnRemove}
      />,
    );
    expect(screen.getByText('beauty.productCategory.skincare')).toBeDefined();
  });

  it('multi 필터의 쉼표 구분 값을 개별 칩으로 표시한다', () => {
    render(
      <FilterChips
        domain="products"
        filters={{ skin_types: 'oily,dry' }}
        onRemove={mockOnRemove}
      />,
    );
    expect(screen.getByText('beauty.skinType.oily')).toBeDefined();
    expect(screen.getByText('beauty.skinType.dry')).toBeDefined();
  });

  it('칩 클릭 시 onRemove(key, value) 호출', () => {
    render(
      <FilterChips
        domain="products"
        filters={{ category: 'skincare' }}
        onRemove={mockOnRemove}
      />,
    );
    fireEvent.click(screen.getByText('beauty.productCategory.skincare'));
    expect(mockOnRemove).toHaveBeenCalledWith('category', 'skincare');
  });

  it('레지스트리에 없는 필터 키는 무시한다', () => {
    const { container } = render(
      <FilterChips
        domain="products"
        filters={{ unknown_key: 'value' }}
        onRemove={mockOnRemove}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('다른 도메인의 필터 필드를 사용한다', () => {
    render(
      <FilterChips
        domain="stores"
        filters={{ store_type: 'olive_young' }}
        onRemove={mockOnRemove}
      />,
    );
    expect(screen.getByText('beauty.storeType.olive_young')).toBeDefined();
  });
});
