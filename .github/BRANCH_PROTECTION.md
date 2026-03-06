# Branch Protection & Release Process

This document explains our branch protection strategy and release automation.

## 🔒 Branch Protection Rules

### main branch (Protected)

**Cannot be modified directly except via release workflow:**

| Action | Allowed? | How |
|--------|----------|-----|
| Direct push | ❌ No | Blocked by protection |
| Force push | ❌ No | Blocked by protection |
| Manual merge | ❌ No | Blocked by protection |
| PR merge | ✅ Yes | Requires 1 approval + all status checks |
| **Release workflow** | ✅ Yes | Uses `GITHUB_TOKEN` (automated) |

**Required checks:**
- ✅ validate
- ✅ test-macos
- ✅ test-linux
- ✅ lint
- ✅ security-check

**Additional rules:**
- Requires linear history
- Requires PR approval (1 reviewer)
- Dismisses stale reviews on update
- Enforced for admins

### develop branch (Protected)

**Standard development branch:**

| Action | Allowed? | How |
|--------|----------|-----|
| Direct push | ❌ No | Blocked by protection |
| PR merge | ✅ Yes | No approval required (fast iteration) |
| Force push | ❌ No | Blocked by protection |

**Required checks:** Same as main

**Additional rules:**
- Requires linear history
- No approval required (fast iteration)
- Admins can bypass (for hotfixes)

---

## 🚀 Release Process

### Automated Release (Tag-Triggered)

**How to release:**
```bash
git tag v0.0.1
git push origin v0.0.1
```

**What happens automatically:**

1. **Tests run** on develop branch
   ```
   develop → [validate, test-macos, test-linux, lint, security-check]
   ```

2. **Develop merges to main** (automated)
   ```bash
   git checkout main
   git merge develop --no-ff
   git push origin main
   ```
   - Uses `GITHUB_TOKEN` (elevated permissions)
   - Bypasses PR requirement (by design)
   - All tests already passed

3. **GitHub Release created**
   - Version number from tag
   - Auto-generated changelog
   - Downloadable tarball
   - Installation instructions

### Why Can Release Workflow Bypass Protection?

**This is industry standard and secure because:**

1. ✅ **Manual trigger required** (tag push)
   - Human decision to release
   - Not automatic on every commit

2. ✅ **Tests already passed** on develop
   - Quality gate enforced before merge
   - All status checks required

3. ✅ **Uses GitHub's trusted token**
   - `GITHUB_TOKEN` created by Actions
   - Has repository write access
   - Auditable in Actions logs

4. ✅ **Industry standard pattern**
   - React, Next.js, TypeScript all do this
   - Google, Microsoft, Meta use this approach
   - Practical for automated releases

**Security guarantees:**
- ❌ No direct pushes to main (blocked)
- ❌ No force pushes (blocked)
- ❌ No manual merges (blocked)
- ✅ Only automated releases can merge (controlled)

---

## 🌿 GitFlow Pattern

```
┌─────────────┐
│   feature   │ → PR required (1 approval)
└─────────────┘
       ↓
┌─────────────┐
│   develop   │ → Fast iteration (no approval)
└─────────────┘
       ↓
   [git tag v*]
       ↓
┌─────────────┐
│    main     │ → Release workflow (automated)
└─────────────┘
       ↓
  [GitHub Release]
```

### Typical Workflow

1. **Create feature branch**
   ```bash
   git checkout develop
   git checkout -b feature/my-feature
   ```

2. **Make changes & create PR**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   git push origin feature/my-feature
   gh pr create --base develop
   ```

3. **After approval, merge to develop**
   - Tests run automatically
   - No approval needed for develop

4. **When ready to release**
   ```bash
   git checkout develop
   git tag v0.1.0
   git push origin v0.1.0
   ```
   - Release workflow runs
   - develop → main (automated)
   - GitHub Release created

---

## 🔐 Security Guarantees

### What's Protected

✅ **main branch integrity**
- No direct modifications
- Only release automation can merge
- Full audit trail in Actions

✅ **Code quality**
- All changes tested before merge
- Status checks required
- Security scanning enabled

✅ **Release integrity**
- Manual tag required
- Tests must pass
- Automated changelog

### What's NOT Protected (By Design)

⚠️ **Release workflow merge**
- Intentionally bypasses PR requirement
- Uses trusted `GITHUB_TOKEN`
- Triggered by manual tag push

This is **industry standard** and **secure** because:
- Human must push tag (not automatic)
- Tests already passed on develop
- Full audit trail in Actions logs
- Cannot be triggered by external contributors

---

## 📋 Verification

### Check Branch Protection

```bash
# Check main protection
gh api repos/tn819/agentctl/branches/main/protection

# Check develop protection
gh api repos/tn819/agentctl/branches/develop/protection
```

### Test Protection (Should Fail)

```bash
# Try direct push to main (will fail)
git checkout main
echo "test" >> README.md
git commit -m "test"
git push origin main
# Expected: ❌ Protected branch update failed

# Try force push (will fail)
git push origin main --force
# Expected: ❌ Cannot force-push to this branch
```

### Verify Release Workflow

```bash
# Create test release
git tag v0.0.1
git push origin v0.0.1

# Check workflow runs
gh run list --workflow=release.yml --limit 1

# Verify main branch updated
gh api repos/tn819/agentctl/commits/main -q '.message'
```

---

## 🎯 Best Practices

### DO:
- ✅ Create feature branches from develop
- ✅ Make PRs to develop (fast iteration)
- ✅ Use tags for releases
- ✅ Trust the automated workflow
- ✅ Review PRs before merging

### DON'T:
- ❌ Try to push directly to main
- ❌ Force push to any protected branch
- ❌ Skip the PR process
- ❌ Manually merge develop to main
- ❌ Create tags for untested code

---

## 🔍 Troubleshooting

### "Protected branch update failed"

**Cause:** Trying to push directly to main or develop

**Solution:** Create a PR instead
```bash
git checkout -b fix/my-fix
git add .
git commit -m "fix: something"
git push origin fix/my-fix
gh pr create --base develop
```

### "Cannot force-push to this branch"

**Cause:** Force pushing is disabled on protected branches

**Solution:** Never force push to main/develop. Use revert commits if needed.

### Release workflow failed

**Cause:** Tests failed on develop

**Solution:**
1. Check test output
2. Fix issues on develop
3. Create new tag

---

## 📚 References

- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitFlow Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow)
- [GitHub Actions Permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication)
