# vercel plugin (placeholder)

Reserved slot for a bundled Vercel plugin (commands + agents + MCP server) per the diagram in `CLAUDE.md` → `.claude/` Folder Reference.

In the 2026 Claude Code plugin model, a project plugin lives here as:

```
plugins/vercel/
├── plugin.json        # name, version, entry points
├── commands/          # slash commands shipped by the plugin
├── agents/            # subagents shipped by the plugin
└── mcp.json           # MCP servers the plugin registers
```

Currently empty — populate when the team adopts a Vercel-specific workflow (preview deploy management, env var sync, log tailing, etc.). Until then this folder serves as documentation that the slot exists.
