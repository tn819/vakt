# GitHub Actions Workflows

This directory contains GitHub Actions workflows for agentctl.

## Workflows

### 1. CI (`ci.yml`)

**Triggers:** Push to main, Pull Requests to main

**Jobs:**

- `validate` - Validates JSON, shell syntax, skill files, required files
- `dependency-review` - Checks dependencies on PRs (optional)

**Purpose:** Continuous integration checks on every PR and push.

### 2. Tests (`test.yml`)

**Triggers:** Push to main/develop, Pull Requests to main/develop

**Jobs:**

- `test-macos` - Runs full test suite on macOS
- `test-linux` - Runs full test suite on Linux
- `lint` - Checks shell scripts, Python syntax, TODO comments
- `security-check` - Checks for hardcoded secrets, file permissions

**Purpose:** Comprehensive cross-platform testing.

### 3. Release (`release.yml`)

**Triggers:** Push tags matching `v*` (e.g., v1.0.0)

**Jobs:**

- `test` - Runs tests before release
- `release` - Creates GitHub release with:
  - Auto-generated changelog
  - Tarball download
  - Release notes
- `update-docs` - Updates version references in docs

**Purpose:** Automated releases with semantic versioning.

## Usage

### Running Tests Locally

```bash
# Install bats
brew install bats-core  # macOS
sudo apt install bats   # Linux

# Run all tests
bats tests/
```

### Creating a Release

```bash
# Update version in src/agentctl.sh
vim src/agentctl.sh  # Update version() function

# Commit changes
git add src/agentctl.sh
git commit -m "chore: bump version to v0.1.0"

# Create and push tag
git tag v0.1.0
git push origin main
git push origin v0.1.0

# GitHub Actions will:
# 1. Run tests
# 2. Create release
# 3. Generate changelog
# 4. Upload tarball
```

### Required Secrets

No secrets required for basic workflows. All workflows use `GITHUB_TOKEN` which is automatically provided.

### Workflow Permissions

The release workflow requires:

```yaml
permissions:
  contents: write
```

This is set in the workflow file.

## Customization

### Adding Platform Tests

To add Windows support:

```yaml
test-windows:
  runs-on: windows-latest
  steps:
    - uses: actions/checkout@v4
    - name: Install bats
      run: choco install bats
    - name: Run tests
      run: bats tests/
```

### Adding Integration Tests

Create `tests/integration/` and add:

```yaml
integration:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Install dependencies
      run: |
        sudo apt-get install -y bats
    - name: Run integration tests
      run: bats tests/integration/
```

## Monitoring

View workflow runs:

- Go to Actions tab in GitHub
- Filter by workflow name
- Check individual job logs

## Troubleshooting

### Tests failing on CI but passing locally

- Check if all dependencies are installed
- Verify PATH setup in test commands
- Check for environment-specific issues

### Release workflow failing

- Ensure tag follows semantic versioning (v0.0.1, v0.1.0, v1.0.0)
- Check GITHUB_TOKEN permissions
- Verify changelog generation

### Security check false positives

- Review flagged patterns
- Update grep patterns in security-check job
- Use `continue-on-error: true` if needed
