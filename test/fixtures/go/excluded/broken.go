// Package excluded is INTENTIONALLY non-compiling. It exists solely to prove
// that go-ci.yml's `exclude-modules` input actually skips a module: the
// self-test passes `exclude-modules: test/fixtures/go/excluded/`, so this file
// must never be compiled. If exclusion ever regresses, the undefined reference
// below fails `go build`/`go vet` and the self-test job goes red — loudly —
// instead of silently passing. See test/fixtures/go/README.md.
package excluded

// Broken references an undefined identifier on purpose.
func Broken() int {
	return undefinedOnPurpose
}
