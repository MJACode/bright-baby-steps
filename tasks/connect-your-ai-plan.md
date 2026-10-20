# Plan — Replace in-app AI chat with "connect your own AI" connectors

## Context / Why
Grace Flare hosts its own Claude-powered chat (`AIChatWidget` → `chat` edge function on
Grace Flare's `ANTHROPIC_API_KEY`), which costs money per token. Decision (Matt,
2026-07-01): **remove the in-app hosted chat** and let parents connect **their own Claude
or ChatGPT** to Grace Flare's data via an MCP/OAuth "connector" — they chat inside the AI
app they already pay for, no API key required. Eliminates the chat API bill. Legal in scope.

Scope: remove the interactive **chat** only. KEEP non-chat hosted AI (briefing,
weekly-insights, parse-voice-log, generate-speech-class, next-step-peek).

## Blocking research (in flight)
- [ ] deep-read agent `af7a587141170e21f` — exact dead-code vs shared-module inventory
- [ ] research agent `a8df6826976939bcd` — does existing `mcp` server work as a ChatGPT
      connector, or need `search`/`fetch` tools + OAuth tweaks?

## Planned work (finalize after agents report)
1. Frontend: remove `AIChatWidget` mount + any nav/route/floating-button entry point.
2. Frontend: generalize `ConnectClaudeSettings` → "Connect your AI" (Claude + ChatGPT
   instructions, connector URL, connected-clients list). Reuse existing gating.
3. Backend: retire chat-only edge fns (`chat`, `extract-memory`) + chat-only hooks
   (`useChatHistory`, `useChatUsage`). Keep shared modules (`personas.ts`, childDataTools).
4. Backend: extend `mcp` edge function for ChatGPT connector compatibility per research.
5. Legal: consent/disclosure copy before connecting, Privacy §4 + `/subprocessors`,
   update `docs/legal-review-log.md`.
6. Update App Store checklist (`tasks/todo.md`): remove AI-chat screenshot (line ~123)
   and revise App Privacy "AI chat history" row (line ~177).
7. QA pass → commit → push `claude/external-ai-tool-integration-o9lu8j` → draft PR.

## Verification
- Chat entry point gone; app builds (`npm run build`), no dead imports.
- Connector card shows Claude + ChatGPT connect instructions.
- MCP server still authorizes + returns child data (test with Claude, and ChatGPT if
  research confirms feasibility).
- Legal log updated.

## Review
_(filled in after implementation)_
