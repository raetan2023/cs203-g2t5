# Frontend visual work

Read [the project design guidelines](../docs/frontend-design-guidelines.md) before
frontend visual work, unless already loaded in the current context.

User requirements take precedence. The guide prescribes no theme, palette, font,
or page composition. Preserve existing behavior and component ownership for visual
tasks. Keep experimental previews isolated unless integration is requested.
Choose tools for the task; optional skills and MCPs are not installation requirements.

## UI revamp branch

`main` owns behaviour; the revamp owns presentation (tokens in `src/styles/`).
New UI should use the `--bb-*` tokens, not new hex colours.
