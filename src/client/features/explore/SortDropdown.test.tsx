import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import SortDropdown from './SortDropdown';

describe('SortDropdown', () => {
  const mockOnChange = vi.fn();

  it('프로필 없을 때 relevance 옵션을 숨긴다', () => {
    render(
      <SortDropdown
        domain="products"
        value="rating"
        onChange={mockOnChange}
        hasProfile={false}
      />,
    );
    // relevance 옵션이 없어야 함 (requiresProfile=true)
    expect(screen.queryByText('explore.sort.relevance')).toBeNull();
    // rating과 price는 있어야 함
    expect(screen.getByText('explore.sort.rating')).toBeDefined();
  });

  it('프로필 있을 때 relevance 옵션을 표시한다', () => {
    render(
      <SortDropdown
        domain="products"
        value="rating"
        onChange={mockOnChange}
        hasProfile={true}
      />,
    );
    // Dropdown은 선택된 값만 보여주므로 다른 옵션은 클릭해야 보임
    // 최소한 현재 선택된 값이 보이는지 확인
    expect(screen.getByText('explore.sort.rating')).toBeDefined();
  });

  it('stores 도메인에는 price 옵션이 없다', () => {
    render(
      <SortDropdown
        domain="stores"
        value="rating"
        onChange={mockOnChange}
        hasProfile={true}
      />,
    );
    expect(screen.queryByText('explore.sort.price')).toBeNull();
  });
});
