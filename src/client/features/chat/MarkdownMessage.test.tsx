import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('client-only', () => ({}));

describe('MarkdownMessage', () => {
  async function renderMarkdown(text: string) {
    const { default: MarkdownMessage } = await import('./MarkdownMessage');
    return render(<MarkdownMessage text={text} />);
  }

  it('일반 텍스트를 렌더링한다', async () => {
    await renderMarkdown('Hello world');
    expect(screen.getByText('Hello world')).toBeDefined();
  });

  it('**bold** 텍스트를 <strong>으로 렌더링한다', async () => {
    const { container } = await renderMarkdown('This is **bold** text');
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong!.textContent).toBe('bold');
  });

  it('줄바꿈이 포함된 텍스트를 별도 단락으로 렌더링한다', async () => {
    const { container } = await renderMarkdown('First paragraph\n\nSecond paragraph');
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(2);
  });

  it('빈 문자열을 에러 없이 렌더링한다', async () => {
    const { container } = await renderMarkdown('');
    expect(container).toBeDefined();
  });

  it('raw HTML 태그를 렌더링하지 않는다 (XSS 안전)', async () => {
    const { container } = await renderMarkdown('<script>alert("xss")</script>');
    const script = container.querySelector('script');
    expect(script).toBeNull();
  });
});
