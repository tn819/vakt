#!/bin/bash
# Run all agentctl tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}agentctl Test Suite${NC}"
echo "================================"
echo ""

# Check if bats is installed
if ! command -v bats &> /dev/null; then
  echo -e "${RED}Error: bats is not installed${NC}"
  echo ""
  echo "Install bats:"
  echo "  macOS:   brew install bats-core"
  echo "  Linux:   sudo apt-get install bats"
  echo "  Source:  https://github.com/bats-core/bats-core"
  exit 1
fi

# Display bats version
echo "bats version: $(bats --version)"
echo ""

# Count total tests
echo "Counting tests..."
TOTAL_TESTS=0
for file in "$SCRIPT_DIR"/e2e/*.bats; do
  count=$(grep -c "^@test" "$file" || true)
  TOTAL_TESTS=$((TOTAL_TESTS + count))
  basename "$file"
done | column -t
echo ""
echo "Total tests: $TOTAL_TESTS"
echo ""

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
echo ""

cd "$PROJECT_ROOT"

# Run with timing
START_TIME=$(date +%s)

if bats "$SCRIPT_DIR"; then
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  
  echo ""
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo "Duration: ${DURATION}s"
  exit 0
else
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  
  echo ""
  echo -e "${RED}✗ Some tests failed${NC}"
  echo "Duration: ${DURATION}s"
  exit 1
fi
