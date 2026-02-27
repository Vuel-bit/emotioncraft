# Repository Guardrails

## Non-negotiables
- `docs/` is the runnable web root (GitHub Pages source folder).
- No ES modules, no bundlers, no framework migrations.
- Preserve the global namespace pattern `window.EC` and existing script load order.
- Zero console errors on boot.
- Smallest possible diff; no refactors unless explicitly requested.

## Pull Request requirements
- PR descriptions must list files changed and how the changes were verified.
