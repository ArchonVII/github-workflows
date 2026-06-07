# Go lane self-test fixtures

These modules exist only to exercise `.github/workflows/go-ci.yml` from
`.github/workflows/self-test-go.yml`. They are **not** shipped or imported by
anything; they are discovered by `go-ci.yml` via `git ls-files '**/go.mod'`.

| Module | Purpose |
| --- | --- |
| `alpha/` | Valid, vet-clean module **with a passing test** — proves `go build`, `go vet`, and `go test` all run. |
| `beta/` | A second valid module — proves multi-module discovery (more than one tracked `go.mod` in one run). |
| `excluded/` | **Intentionally does not compile.** The self-test passes `exclude-modules: test/fixtures/go/excluded/`. If exclusion regresses, this module builds and the job fails — a self-validating proof that `exclude-modules` works. |

**Go version:** each `go.mod` declares `go 1.21` — a modern baseline that
`actions/setup-go` with `go-version: stable` always satisfies (stable is the
latest release). The modules have no dependencies, so `go mod download` is a
no-op and no `go.sum` is needed.

If you change `go-ci.yml`, the self-test re-runs automatically (its `paths`
filter watches `go-ci.yml`, this directory, and the self-test workflow itself).
