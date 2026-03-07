# agentctl Test Suite

End-to-end tests for agentctl CLI using `bats` (Bash Automated Testing System).

## Requirements

- [bats-core](https://github.com/bats-core/bats-core) >= 1.5.0
- Python 3.x (for JSON manipulation)
- bash >= 4.0

### Installing bats

**macOS:**

```bash
brew install bats-core
```

**Linux (Ubuntu/Debian):**

```bash
sudo apt-get install bats
```

**Linux (Arch):**

```bash
sudo pacman -S bats
```

**From source:**

```bash
git clone https://github.com/bats-core/bats-core.git
cd bats-core
./install.sh /usr/local
```

## Running Tests

### Run all tests

```bash
bats tests/
```

### Run specific test file

```bash
bats tests/e2e/init.bats
```

### Run with verbose output

```bash
bats --tap tests/
```

### Run specific test

```bash
bats tests/e2e/init.bats -f "init creates ~/.agents/ directory"
```

## Test Structure

```
tests/
├── test_helper.bash      # Shared test utilities and assertions
├── e2e/                  # End-to-end tests
│   ├── init.bats        # Tests for init command
│   ├── secrets.bats     # Tests for secrets management
│   ├── config.bats      # Tests for config management
│   ├── add-server.bats  # Tests for add-server command
│   ├── add-skill.bats   # Tests for add-skill command
│   ├── list.bats        # Tests for list command
│   └── sync.bats        # Tests for sync command
└── README.md            # This file
```

## Test Isolation

Each test runs in an isolated environment:

- **Temporary AGENTS_DIR**: Tests use a temporary directory instead of `~/.agents`
- **Backup/Restore**: Existing `~/.agents` is backed up and restored after tests
- **Mock secrets**: Uses env file backend instead of Keychain/pass
- **No side effects**: Tests clean up after themselves

## Writing New Tests

### Basic test structure

```bash
#!/usr/bin/env bats

load '../test_helper'

setup() {
  setup_test_env
  agentctl init
}

teardown() {
  teardown_test_env
}

@test "my test description" {
  run agentctl some-command

  [ "$status" -eq 0 ]
  [[ "$output" == *"expected output"* ]]
}
```

### Using assertions

```bash
# File system
assert_file_exists "/path/to/file"
assert_dir_exists "/path/to/dir"
assert_file_contains "/path/to/file" "search string"

# JSON
assert_json_key_exists "/path/to/file.json" "key"
assert_json_equals "/path/to/file.json" "['nested']['key']" "expected value"
```

### Test helpers

```bash
# Create a test skill
create_test_skill "/path/to/skill" "skill-name"

# Mock secrets backend
mock_secrets_backend

# Set a test secret
set_test_secret "KEY_NAME" "secret_value"

# Skip if command not available
skip_if_missing "git"

# Wait for file to exist
wait_for_file "/path/to/file" 5
```

## Best Practices

1. **One test, one assertion** - Each `@test` should verify one specific behavior
2. **Use descriptive names** - Test names should describe the expected behavior
3. **Test error paths** - Don't just test success cases
4. **Test edge cases** - Special characters, empty inputs, large values
5. **Keep tests independent** - Tests should not depend on each other
6. **Use setup/teardown** - Clean up resources after each test

## Continuous Integration

Tests are automatically run on:

- Every pull request
- Every push to main branch
- Release builds

CI configuration:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install bats
        run: sudo apt-get install bats
      - name: Run tests
        run: bats tests/
```

## Debugging Failed Tests

### Run single test with debug output

```bash
bats tests/e2e/init.bats -f "test name"
```

### Check test environment

```bash
# Add to test for debugging
echo "AGENTS_DIR: $AGENTS_DIR" >&3
ls -la "$AGENTS_DIR" >&3
```

### Run with bash debug

```bash
bash -x src/agentctl.sh init
```

## Test Coverage

Current test coverage by command:

| Command    | Tests | Status      |
| ---------- | ----- | ----------- |
| init       | 11    | ✅ Complete |
| secrets    | 12    | ✅ Complete |
| config     | 11    | ✅ Complete |
| add-server | 12    | ✅ Complete |
| add-skill  | 13    | ✅ Complete |
| list       | 14    | ✅ Complete |
| sync       | 14    | ✅ Complete |

**Total: 87 tests**

## Contributing

When adding new features:

1. Write tests first (TDD)
2. Ensure all existing tests pass
3. Add tests to this README's coverage table
4. Update test helper if adding new assertions
