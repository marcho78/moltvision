import React, { useState, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

import doc01 from '@docs/01-getting-started.md?raw'
import doc02 from '@docs/02-feed.md?raw'
import doc03 from '@docs/03-security-and-keys.md?raw'
import doc04 from '@docs/04-persona-studio.md?raw'
import doc05 from '@docs/05-autopilot.md?raw'
import doc06 from '@docs/06-exploration-panels.md?raw'
import doc07 from '@docs/07-conversations-and-moderation.md?raw'
import doc08 from '@docs/08-analytics-settings-and-llm.md?raw'

interface Section {
  number: number
  title: string
  content: string
}

const SECTIONS: Section[] = [
  { number: 1, title: 'Getting Started', content: doc01 },
  { number: 2, title: 'The Feed Panel', content: doc02 },
  { number: 3, title: 'Security & Keys', content: doc03 },
  { number: 4, title: 'Persona Studio', content: doc04 },
  { number: 5, title: 'Autopilot', content: doc05 },
  { number: 6, title: 'Exploration Panels', content: doc06 },
  { number: 7, title: 'Conversations & Moderation', content: doc07 },
  { number: 8, title: 'Analytics, Settings & LLM', content: doc08 }
]

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-molt-text pb-2 mb-4 border-b border-molt-accent/40">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold text-molt-text mt-8 mb-3 pb-1 border-b border-molt-border">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-molt-text mt-6 mb-2">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-base font-semibold text-molt-text mt-4 mb-1">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-molt-muted leading-relaxed mb-3">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-molt-accent hover:underline"
      onClick={(e) => e.preventDefault()}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc ml-6 mb-3 space-y-1 text-molt-muted">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal ml-6 mb-3 space-y-1 text-molt-muted">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-molt-accent/60 bg-molt-surface/50 pl-4 py-2 my-3 rounded-r">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <code className="block bg-molt-surface border border-molt-border rounded-lg p-4 text-sm overflow-x-auto my-3 text-molt-text">
          {children}
        </code>
      )
    }
    return (
      <code className="bg-molt-accent/15 text-molt-accent px-1.5 py-0.5 rounded text-sm">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="my-3">{children}</pre>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full border border-molt-border text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-molt-accent/10 text-molt-text">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-molt-border even:bg-molt-surface/30">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold border-r border-molt-border last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-molt-muted border-r border-molt-border last:border-r-0">
      {children}
    </td>
  ),
  hr: () => <hr className="border-molt-border my-6" />,
  strong: ({ children }) => <strong className="text-molt-text font-semibold">{children}</strong>
}

export function HelpPanel() {
  const [activeSection, setActiveSection] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleSectionChange = (index: number) => {
    setActiveSection(index)
    contentRef.current?.scrollTo(0, 0)
  }

  return (
    <div className="flex h-full">
      {/* TOC Sidebar */}
      <div className="w-56 flex-shrink-0 border-r border-molt-border bg-molt-bg overflow-y-auto">
        <div className="p-3 border-b border-molt-border">
          <h2 className="text-sm font-semibold text-molt-text">Documentation</h2>
        </div>
        <nav className="p-2 space-y-0.5">
          {SECTIONS.map((section, i) => (
            <button
              key={section.number}
              onClick={() => handleSectionChange(i)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-sm transition-colors ${
                activeSection === i
                  ? 'bg-molt-accent/15 text-molt-accent'
                  : 'text-molt-muted hover:bg-molt-surface hover:text-molt-text'
              }`}
            >
              <span
                className={`w-5 h-5 flex items-center justify-center rounded text-xs font-medium flex-shrink-0 ${
                  activeSection === i
                    ? 'bg-molt-accent text-white'
                    : 'bg-molt-surface text-molt-muted'
                }`}
              >
                {section.number}
              </span>
              <span className="truncate">{section.title}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content Area */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-8 max-w-3xl">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {SECTIONS[activeSection].content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
