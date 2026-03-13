#!/usr/bin/env bun
/**
 * Validates every docs/adr/NNNN-*.md against the required ADR structure.
 * Run: bun run scripts/check-adrs.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ADR_DIR = join(import.meta.dir, "..", "docs", "adr");
const REQUIRED_SECTIONS = ["## Context", "## Decision", "## Alternatives Considered", "## Consequences"];
const VALID_STATUSES    = ["proposed", "accepted", "deprecated", "superseded"];

let errors = 0;

function fail(file: string, msg: string): void {
  process.stderr.write(`  ✗  ${file}: ${msg}\n`);
  errors++;
}

const files = readdirSync(ADR_DIR)
  .filter(f => /^\d{4}-/.test(f) && f.endsWith(".md"))
  .sort();

if (files.length === 0) {
  process.stderr.write("check-adrs: no ADR files found in docs/adr/\n");
  process.exit(1);
}

for (const file of files) {
  const content = readFileSync(join(ADR_DIR, file), "utf-8");

  // Frontmatter
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) {
    fail(file, "missing YAML frontmatter (expected --- block at top)");
    continue;
  }

  const fmText = fm[1]!;
  const status = fmText.match(/^status:\s*(.+)$/m)?.[1]?.trim().toLowerCase();
  const date   = fmText.match(/^date:\s*(.+)$/m)?.[1]?.trim();

  if (!status) fail(file, "frontmatter missing 'status' field");
  else if (!VALID_STATUSES.some(s => status.startsWith(s)))
    fail(file, `invalid status '${status}' — must be one of: ${VALID_STATUSES.join(", ")}`);

  if (!date) fail(file, "frontmatter missing 'date' field");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    fail(file, `invalid date '${date}' — must be YYYY-MM-DD`);

  // Required sections
  for (const section of REQUIRED_SECTIONS) {
    if (!content.includes(section)) fail(file, `missing section '${section}'`);
  }
}

if (errors === 0) {
  process.stdout.write(`  ✓  ${files.length} ADR(s) valid\n`);
} else {
  process.stderr.write(`\n  ${errors} error(s) in ADR validation\n`);
  process.exit(1);
}
