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
import { registerSearch } from "./commands/search";
import { registerAudit } from "./commands/audit";
import { registerDaemon } from "./commands/daemon";
import { registerProxy } from "./commands/proxy";

const program = new Command();
program
  .name("vakt")
  .description("Secure MCP runtime — policy, audit, registry, multi-provider sync")
  .version("0.1.0");

registerConfig(program);
registerAddServer(program);
registerAddSkill(program);
registerInit(program);
registerSecrets(program);
registerSync(program);
registerList(program);
registerImport(program);
registerUpgrade(program);
registerSearch(program);
registerAudit(program);
registerDaemon(program);
registerProxy(program);

program.parse();
