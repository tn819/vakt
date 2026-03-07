#!/usr/bin/env bats
# End-to-end tests for agentctl secrets command

load '../test_helper'

setup() {
  setup_test_env
  mock_secrets_backend
  agentctl init
}

teardown() {
  teardown_test_env
}

@test "secrets set stores a secret" {
  run agentctl secrets set TEST_KEY "test_value"
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Stored: TEST_KEY"* ]]
}

@test "secrets get retrieves a secret" {
  agentctl secrets set TEST_KEY "test_value"
  
  run agentctl secrets get TEST_KEY
  
  [ "$status" -eq 0 ]
  [ "$output" = "test_value" ]
}

@test "secrets get fails for non-existent key" {
  run agentctl secrets get NON_EXISTENT
  
  [ "$status" -eq 1 ]
}

@test "secrets delete removes a secret" {
  agentctl secrets set TEST_KEY "test_value"
  
  run agentctl secrets delete TEST_KEY
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"Deleted: TEST_KEY"* ]]
  
  run agentctl secrets get TEST_KEY
  [ "$status" -eq 1 ]
}

@test "secrets list shows all stored secrets" {
  agentctl secrets set KEY1 "value1"
  agentctl secrets set KEY2 "value2"
  
  run agentctl secrets list
  
  [ "$status" -eq 0 ]
  [[ "$output" == *"KEY1"* ]]
  [[ "$output" == *"KEY2"* ]]
}

@test "secrets set prompts for value if not provided" {
  run agentctl secrets set TEST_KEY <<< "prompted_value"
  
  [ "$status" -eq 0 ]
  
  run agentctl secrets get TEST_KEY
  [ "$output" = "prompted_value" ]
}

@test "secrets handles special characters in values" {
  local special_value='value with "quotes" and $symbols'
  
  run agentctl secrets set SPECIAL_KEY "$special_value"
  [ "$status" -eq 0 ]
  
  run agentctl secrets get SPECIAL_KEY
  [ "$output" = "$special_value" ]
}

@test "secrets handles multiline values" {
  local multiline_value=$'line1\nline2\nline3'
  
  run agentctl secrets set MULTILINE_KEY "$multiline_value"
  [ "$status" -eq 0 ]
  
  run agentctl secrets get MULTILINE_KEY
  [ "$output" = "$multiline_value" ]
}

@test "secrets empty list returns nothing" {
  run agentctl secrets list
  
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "secrets can update existing key" {
  agentctl secrets set TEST_KEY "original_value"
  agentctl secrets set TEST_KEY "updated_value"
  
  run agentctl secrets get TEST_KEY
  
  [ "$status" -eq 0 ]
  [ "$output" = "updated_value" ]
}

@test "secrets interactive mode starts" {
  skip "Interactive mode requires terminal emulator"
  run agentctl secrets
  
  [ "$status" -eq 0 ]
}
