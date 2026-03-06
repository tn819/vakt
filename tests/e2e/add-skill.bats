#!/usr/bin/env bats
# End-to-end tests for agentctl add-skill command

load '../test_helper'

setup() {
  setup_test_env
  agentctl init
  
  # Create a test skill to use in tests
  TEST_SKILL_DIR="$(mktemp -d)"
  create_test_skill "$TEST_SKILL_DIR" "test-skill"
}

teardown() {
  teardown_test_env
  [[ -n "${TEST_SKILL_DIR:-}" ]] && rm -rf "$TEST_SKILL_DIR"
}

@test "add-skill links local skill directory" {
  run agentctl add-skill "$TEST_SKILL_DIR"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Linked skill: test-skill"* ]]
  
  assert_dir_exists "$AGENTS_DIR/skills/test-skill"
  [ -L "$AGENTS_DIR/skills/test-skill" ]
}

@test "add-skill with custom name" {
  run agentctl add-skill "$TEST_SKILL_DIR" custom-name
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Linked skill: custom-name"* ]]
  
  assert_dir_exists "$AGENTS_DIR/skills/custom-name"
}

@test "add-skill requires path argument" {
  run agentctl add-skill
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "add-skill fails for non-existent path" {
  run agentctl add-skill "/non/existent/path"
  
  [ "$status" -eq 1 ]
}

@test "add-skill detects already linked skill" {
  agentctl add-skill "$TEST_SKILL_DIR"
  
  run agentctl add-skill "$TEST_SKILL_DIR"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"already linked"* ]]
}

@test "add-skill shows sync reminder" {
  run agentctl add-skill "$TEST_SKILL_DIR"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Run 'agentctl sync'"* ]]
}

@test "add-skill creates skills directory if needed" {
  rm -rf "$AGENTS_DIR/skills"
  
  run agentctl add-skill "$TEST_SKILL_DIR"
  
  [ "$status" -eq 0 ]
  assert_dir_exists "$AGENTS_DIR/skills"
}

@test "add-skill resolves relative paths" {
  cd "$(dirname "$TEST_SKILL_DIR")"
  local relative_path="./$(basename "$TEST_SKILL_DIR")"
  
  run agentctl add-skill "$relative_path"
  
  [ "$status" -eq 0 ]
  
  cd - > /dev/null
}

@test "add-skill handles skill name with hyphens" {
  local hyphen_skill="$(mktemp -d)"
  create_test_skill "$hyphen_skill" "my-test-skill"
  
  run agentctl add-skill "$hyphen_skill"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Linked skill: my-test-skill"* ]]
  
  rm -rf "$hyphen_skill"
}

@test "add-skill git clone from URL" {
  skip "Requires network access and git repository"
  
  run agentctl add-skill https://github.com/example/skill-repo test-skill-from-git
  
  [ "$status" -eq 0 ]
  assert_dir_exists "$AGENTS_DIR/skills/test-skill-from-git"
}

@test "add-skill git clone fails if skill exists" {
  skip "Requires network access and git repository"
  
  agentctl add-skill https://github.com/example/skill-repo existing-skill
  
  run agentctl add-skill https://github.com/example/skill-repo existing-skill
  
  [ "$status" -eq 1 ]
  [[ "$output" == *"already exists"* ]]
}

@test "add-skill preserves skill SKILL.md file" {
  agentctl add-skill "$TEST_SKILL_DIR"
  
  assert_file_exists "$AGENTS_DIR/skills/test-skill/SKILL.md"
  assert_file_contains "$AGENTS_DIR/skills/test-skill/SKILL.md" "test-skill"
}
