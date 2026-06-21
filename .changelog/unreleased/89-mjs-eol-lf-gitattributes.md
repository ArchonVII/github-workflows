### Fixed

- Forced LF line endings for `*.mjs` modules via `.gitattributes` so shebang-bearing scripts (`doc-policy-lint`, `setup-repo`, `agent-close-preflight`, `agent-pr-ready`) and the vitest/esbuild loader no longer fail with `SyntaxError: Invalid or unexpected token` on Windows checkouts where `core.autocrlf=true` produced `#!/usr/bin/env node\r`.
