// Package beta is a second valid fixture module. Its only job is to prove
// go-ci.yml discovers and verifies MORE THAN ONE tracked go.mod in a single
// run (multi-module discovery via `git ls-files`).
package beta

// Greeting returns a fixed greeting.
func Greeting() string {
	return "beta"
}
