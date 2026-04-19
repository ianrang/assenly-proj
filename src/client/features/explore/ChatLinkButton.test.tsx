import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('client-only', () => ({}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import ChatLinkButton from './ChatLinkButton';

describe('ChatLinkButton', () => {
  it('Chat 아이콘 버튼을 렌더링한다', () => {
    render(<ChatLinkButton locale="en" />);
    expect(screen.getByRole('button', { name: /chat/i })).toBeDefined();
  });

  it('클릭 시 /locale/chat으로 이동한다', () => {
    render(<ChatLinkButton locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: /chat/i }));
    expect(mockPush).toHaveBeenCalledWith('/en/chat');
  });

  it('locale에 따라 경로가 변경된다', () => {
    render(<ChatLinkButton locale="ko" />);
    fireEvent.click(screen.getByRole('button', { name: /chat/i }));
    expect(mockPush).toHaveBeenCalledWith('/ko/chat');
  });
});
