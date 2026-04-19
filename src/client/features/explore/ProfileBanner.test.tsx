import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('client-only', () => ({}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import ProfileBanner from './ProfileBanner';

describe('ProfileBanner', () => {
  it('배너 메시지를 렌더링한다', () => {
    render(<ProfileBanner locale="en" />);
    expect(screen.getByText('profileBanner.title')).toBeDefined();
    expect(screen.getByText('profileBanner.description')).toBeDefined();
  });

  it('CTA 클릭 시 /profile/edit로 이동한다', () => {
    render(<ProfileBanner locale="en" />);
    fireEvent.click(screen.getByText('profileBanner.cta'));
    expect(mockPush).toHaveBeenCalledWith('/en/profile/edit');
  });

  it('dismiss 클릭 시 배너가 사라진다', () => {
    render(<ProfileBanner locale="en" />);
    expect(screen.getByText('profileBanner.title')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('profileBanner.title')).toBeNull();
  });

  it('dismiss 후 재렌더링해도 숨김 유지 (세션 내)', () => {
    const { rerender } = render(<ProfileBanner locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    rerender(<ProfileBanner locale="en" />);
    expect(screen.queryByText('profileBanner.title')).toBeNull();
  });
});
