import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import FilterSheet from './FilterSheet';

describe('FilterSheet', () => {
  const mockOnApply = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('products 도메인의 필터 필드를 렌더링한다', () => {
    render(
      <FilterSheet
        domain="products"
        open={true}
        onClose={mockOnClose}
        currentFilters={{}}
        onApply={mockOnApply}
      />,
    );

    expect(screen.getByText('explore.filters.skinType')).toBeDefined();
    expect(screen.getByText('explore.filters.category')).toBeDefined();
  });

  it('stores 도메인의 필터 필드를 렌더링한다', () => {
    render(
      <FilterSheet
        domain="stores"
        open={true}
        onClose={mockOnClose}
        currentFilters={{}}
        onApply={mockOnApply}
      />,
    );

    expect(screen.getByText('explore.filters.storeType')).toBeDefined();
    expect(screen.getByText('explore.filters.englishSupport')).toBeDefined();
  });

  it('Apply 버튼 클릭 시 onApply 호출', () => {
    render(
      <FilterSheet
        domain="products"
        open={true}
        onClose={mockOnClose}
        currentFilters={{}}
        onApply={mockOnApply}
      />,
    );

    fireEvent.click(screen.getByText('explore.filters.apply'));
    expect(mockOnApply).toHaveBeenCalledOnce();
  });

  it('Reset 버튼 클릭 시 필터 초기화 후 onApply 빈 객체 호출', () => {
    render(
      <FilterSheet
        domain="products"
        open={true}
        onClose={mockOnClose}
        currentFilters={{ category: 'skincare' }}
        onApply={mockOnApply}
      />,
    );

    fireEvent.click(screen.getByText('explore.filters.reset'));
    expect(mockOnApply).toHaveBeenCalledWith({});
  });

  it('현재 필터값이 pre-selected 상태로 표시된다', async () => {
    render(
      <FilterSheet
        domain="products"
        open={true}
        onClose={mockOnClose}
        currentFilters={{ category: 'skincare' }}
        onApply={mockOnApply}
      />,
    );

    // Sheet portal 렌더링 대기
    const pressedButton = await screen.findByRole('button', { pressed: true });
    expect(pressedButton).toBeDefined();
  });
});
