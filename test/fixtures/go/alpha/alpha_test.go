package alpha

import "testing"

// TestAdd gives the self-test a real test to execute, proving go-ci.yml's
// `go test` step runs and reports pass/fail (a module with no tests would
// exit 0 regardless).
func TestAdd(t *testing.T) {
	if got := Add(2, 3); got != 5 {
		t.Fatalf("Add(2, 3) = %d, want 5", got)
	}
}
