// Package alpha is a self-test fixture: a valid, vet-clean Go module that
// go-ci.yml should discover, build, vet, and test. Paired with alpha_test.go
// so the self-test proves `go test` actually runs (not just build/vet).
package alpha

// Add returns the sum of two integers.
func Add(a, b int) int {
	return a + b
}
