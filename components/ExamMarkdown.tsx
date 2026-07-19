"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type Props = {
  children: string;
  className?: string;
  /** Compact exam stems vs denser body copy (form description, parts). */
  variant?: "prompt" | "body";
};

const COMPONENTS: Components = {
  p: ({ children }) => <p className="tp-md__p">{children}</p>,
  strong: ({ children }) => <strong className="tp-md__strong">{children}</strong>,
  em: ({ children }) => <em className="tp-md__em">{children}</em>,
  ul: ({ children }) => <ul className="tp-md__ul">{children}</ul>,
  ol: ({ children }) => <ol className="tp-md__ol">{children}</ol>,
  li: ({ children }) => <li className="tp-md__li">{children}</li>,
  h1: ({ children }) => <h4 className="tp-md__h">{children}</h4>,
  h2: ({ children }) => <h4 className="tp-md__h">{children}</h4>,
  h3: ({ children }) => <h4 className="tp-md__h">{children}</h4>,
  h4: ({ children }) => <h4 className="tp-md__h">{children}</h4>,
  code: ({ children, className }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className="tp-md__code-block">{children}</code>;
    }
    return <code className="tp-md__code">{children}</code>;
  },
  pre: ({ children }) => <pre className="tp-md__pre">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="tp-md__blockquote">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="tp-md__a" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="tp-md__table-wrap">
      <table className="tp-md__table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th className="tp-md__th">{children}</th>,
  td: ({ children }) => <td className="tp-md__td">{children}</td>,
  hr: () => <hr className="tp-md__hr" />,
};

/**
 * Renders teacher/AI-authored exam text (prompts, descriptions, part stems)
 * with a safe Markdown subset. Plain text still works — blank lines become
 * paragraphs; `**bold**`, lists, and tables improve readability on phones.
 */
export function ExamMarkdown({ children, className = "", variant = "prompt" }: Props) {
  const text = children.trim();
  if (!text) {
    return null;
  }

  return (
    <div className={`tp-md tp-md--${variant} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
