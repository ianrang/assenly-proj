import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('client-only', () => ({}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import ChatLinkButton from './ChatLinkButton';

describe('ChatLinkButton', () => {
  it('Chat 아이콘 링크를 렌더링한다', () => {
    render(<ChatLinkButton locale="en" />);
    expect(screen.getByRole('link', { name: /navLabel/i })).toBeDefined();
  });

  it('/locale/chat 경로를 가리킨다', () => {
    render(<ChatLinkButton locale="en" />);
    const link = screen.getByRole('link', { name: /navLabel/i });
    expect(link.getAttribute('href')).toBe('/en/chat');
  });

  it('locale에 따라 경로가 변경된다', () => {
    render(<ChatLinkButton locale="ko" />);
    const link = screen.getByRole('link', { name: /navLabel/i });
    expect(link.getAttribute('href')).toBe('/ko/chat');
  });

  it('호버 시 title 속성으로 안내 텍스트 표시', () => {
    render(<ChatLinkButton locale="en" />);
    const link = screen.getByRole('link', { name: /navLabel/i });
    expect(link.getAttribute('title')).toBeTruthy();
  });
});
