#!/usr/bin/env bun
import { Command } from "commander";

const program = new Command();
program
  .name("agentctl")
  .description("Provider-agnostic MCP and skills manager")
  .version("0.0.1");

program.parse();
