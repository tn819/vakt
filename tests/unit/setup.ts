import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const sandboxHome = mkdtempSync(join(tmpdir(), "vakt-test-"));
process.env["HOME"] = sandboxHome;
process.env["AGENTS_DIR"] = join(sandboxHome, ".agents");
process.env["AGENTS_SECRETS_BACKEND"] = "env"; // never touch real keychain in tests
