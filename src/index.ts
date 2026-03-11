#!/usr/bin/env bun
import { Command } from "commander";
import { registerConfig } from "./commands/config";
import { registerAddServer } from "./commands/add-server";
import { registerAddSkill } from "./commands/add-skill";
import { registerInit } from "./commands/init";
import { registerSecrets } from "./commands/secrets";
import { registerSync } from "./commands/sync";
import { registerList } from "./commands/list";
import { registerImport } from "./commands/import";
import { registerUpgrade } from "./commands/upgrade";

const program = new Command();
program
  .name("agentctl")
  .description("Provider-agnostic MCP and skills manager")
  .version("0.0.1");

registerConfig(program);
registerAddServer(program);
registerAddSkill(program);
registerInit(program);
registerSecrets(program);
registerSync(program);
registerList(program);
registerImport(program);
registerUpgrade(program);

program.parse();
