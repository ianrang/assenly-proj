import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import ExploreEmptyState from './ExploreEmptyState';

describe('ExploreEmptyState', () => {
  it('빈 상태 메시지를 렌더링한다', () => {
    render(<ExploreEmptyState onResetFilters={vi.fn()} />);
    expect(screen.getByText('empty.title')).toBeDefined();
    expect(screen.getByText('empty.suggestion')).toBeDefined();
  });

  it('필터 초기화 버튼 클릭 시 onResetFilters 호출', () => {
    const mockReset = vi.fn();
    render(<ExploreEmptyState onResetFilters={mockReset} />);
    fireEvent.click(screen.getByText('empty.resetFilters'));
    expect(mockReset).toHaveBeenCalledOnce();
  });
});
