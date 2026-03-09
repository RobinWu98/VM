#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
VM="$ROOT_DIR/vm_riskxvii"

if [[ ! -x "$VM" ]]; then
  echo "[INFO] vm_riskxvii not found, building first..."
  make -C "$ROOT_DIR" >/dev/null
fi

pass=0
fail=0

run_case() {
  local name="$1"
  local expected="$2"
  local cmd="$3"

  local actual
  actual="$(eval "$cmd")"

  if [[ "$actual" == "$expected" ]]; then
    echo "[PASS] $name"
    pass=$((pass + 1))
  else
    echo "[FAIL] $name"
    echo "       expected: $expected"
    echo "       actual:   $actual"
    fail=$((fail + 1))
  fi
}

run_case \
  "printing_h outputs H then halts" \
  "HCPU Halt Requested" \
  "\"$VM\" \"$ROOT_DIR/examples/printing_h/printing_h.mi\""

run_case \
  "add_2_numbers with 12 + 34" \
  "46CPU Halt Requested" \
  "printf '12\n34\n' | \"$VM\" \"$ROOT_DIR/examples/add_2_numbers/add_2_numbers.mi\""

run_case \
  "branch with 10,20,30,40,50" \
  "-41CPU Halt Requested" \
  "printf '10\n20\n30\n40\n50\n' | \"$VM\" \"$ROOT_DIR/examples/test/branch.mi\""

echo ""
echo "Summary: ${pass} passed, ${fail} failed"

if [[ $fail -ne 0 ]]; then
  exit 1
fi
