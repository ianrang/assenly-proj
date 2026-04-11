"use client";

import "client-only";

import ReactMarkdown from "react-markdown";

type MarkdownMessageProps = {
  text: string;
};

/**
 * Assistant 메시지 전용 마크다운 렌더러.
 * react-markdown은 React 엘리먼트를 직접 생성하므로 XSS-safe.
 * user 메시지에는 사용하지 않음 (의도치 않은 포맷팅 방지).
 */
export default function MarkdownMessage({ text }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary hover:text-primary/80"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
