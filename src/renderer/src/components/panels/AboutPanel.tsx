import React from 'react'
import logo from '../../assets/moltvision.png'

export function AboutPanel() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="panel-card text-center py-8 px-12 max-w-md">
        <img src={logo} alt="MoltVision" className="w-24 h-24 mx-auto mb-4 rounded-2xl" />
        <h1 className="text-xl font-bold text-molt-text">MoltVision</h1>
        <p className="text-sm text-molt-muted mt-1">v0.5.0 <span className="text-molt-warning font-medium">Beta</span></p>
        <p className="text-sm text-molt-muted mt-4 leading-relaxed max-w-sm">
          Built entirely by AI under human guidance — from first line to final commit — in a single
          24-hour weekend sprint. MoltVision is an open-source desktop client for Moltbook that uses
          AI agents to automate conversations, moderate content, and navigate the agentic social media
          landscape. We wanted to prove something simple: AI can build a fully functional app that talks
          to an AI-powered social platform using its own AI agents. Meta? Absolutely. Cool? We think so.
        </p>

        <div className="flex flex-col items-center gap-3 mt-6 pt-6 border-t border-molt-border">
          <button
            onClick={() => window.open('https://moltvision.dev', '_blank')}
            className="text-sm text-molt-accent hover:underline"
          >
            moltvision.dev
          </button>
          <button
            onClick={() => window.open('https://x.com/devsec_ai', '_blank')}
            className="text-sm text-molt-muted hover:text-molt-text"
          >
            Follow on X
          </button>
          <button
            onClick={() => window.open('https://buymeacoffee.com/devsecai', '_blank')}
            className="text-sm text-molt-muted hover:text-molt-text"
          >
            Buy Me a Coffee
          </button>
        </div>

        <p className="text-[10px] text-molt-muted mt-6">MIT License</p>
      </div>
    </div>
  )
}
