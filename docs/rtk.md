# RTK Integration

This module provides integration with [RTK](https://github.com/rtk-ai/rtk) (Rust Token Killer) for token compression in vakt.

## Features

- **Command Wrapping**: Automatically wrap subprocess calls with RTK for 60-90% token reduction
- **Audit Log Compression**: Compress audit logs before feeding to LLMs for analysis
- **Token Analytics**: Track per-agent token savings using RTK analytics
- **Graceful Fallback**: Works without RTK installed (uses basic deduplication)

## Usage

### Wrapping Commands

```typescript
import { rtkWrap } from "./lib/rtk";

const result = await rtkWrap({
  command: "git",
  args: ["status"],
  cwd: "/path/to/repo",
});

console.log(result.stdout); // Compressed output
console.log(result.tokenSavings); // Tokens saved
```

### Compressing Audit Logs

```typescript
import { compressWithRtk } from "./lib/rtk";

const compressed = await compressWithRtk(auditLogText);
// Use compressed text for LLM analysis
```

### Check RTK Availability

```typescript
import { isRtkAvailable } from "./lib/rtk";

if (await isRtkAvailable()) {
  console.log("RTK is installed and ready");
}
```

## Installation

RTK is optional. To install:

```bash
brew install rtk-ai/tap/rtk
# or
cargo install rtk
```

## Configuration

Future: Add policy-driven filter profiles per tool or agent role.
