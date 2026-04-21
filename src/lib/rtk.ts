import { spawn } from "child_process";
import { promisify } from "util";

const exec = promisify(spawn);

export interface RtkWrapOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface RtkWrapResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  tokenSavings?: number;
}

/**
 * Check if RTK is installed and available in PATH
 */
export async function isRtkAvailable(): Promise<boolean> {
  try {
    const result = spawn("rtk", ["--version"], { stdio: "pipe" });
    return new Promise((resolve) => {
      result.on("error", () => resolve(false));
      result.on("exit", (code) => resolve(code === 0));
    });
  } catch {
    return false;
  }
}

/**
 * Wrap a command with RTK for token compression
 * Usage: rtk wrap -- <command> [args...]
 */
export async function rtkWrap(
  options: RtkWrapOptions,
): Promise<RtkWrapResult> {
  const { command, args = [], cwd, env, timeout = 60000 } = options;

  // Check if RTK is available
  const rtkAvailable = await isRtkAvailable();
  if (!rtkAvailable) {
    // Fallback: run command without RTK
    return runWithoutRtk(options);
  }

  return new Promise((resolve, reject) => {
    const rtkArgs = ["wrap", "--", command, ...args];
    const child = spawn("rtk", rtkArgs, {
      cwd,
      env: { ...process.env, ...env },
      timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      // Parse token savings from stderr if available
      const tokenSavings = parseTokenSavings(stderr);

      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
        tokenSavings,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Run command without RTK (fallback)
 */
async function runWithoutRtk(
  options: RtkWrapOptions,
): Promise<RtkWrapResult> {
  const { command, args = [], cwd, env, timeout = 60000 } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
      });
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Parse token savings from RTK stderr output
 * Format: "[rtk] Saved X tokens (Y%)"
 */
function parseTokenSavings(stderr: string): number | undefined {
  const match = stderr.match(/\[rtk\] Saved (\d+) tokens/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Get RTK analytics/gain for the current session
 */
export async function getRtkGain(): Promise<{
  totalSaved: number;
  commands: number;
} | null> {
  try {
    const result = spawn("rtk", ["gain", "--json"], { stdio: "pipe" });

    return new Promise((resolve) => {
      let output = "";

      result.stdout?.on("data", (data) => {
        output += data.toString();
      });

      result.on("exit", (code) => {
        if (code === 0 && output) {
          try {
            const data = JSON.parse(output);
            resolve({
              totalSaved: data.total_saved || 0,
              commands: data.commands || 0,
            });
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      result.on("error", () => resolve(null));
    });
  } catch {
    return null;
  }
}

/**
 * Compress text using RTK's deduplication
 * Useful for audit log compression before feeding to LLM
 */
export async function compressWithRtk(text: string): Promise<string> {
  const rtkAvailable = await isRtkAvailable();
  if (!rtkAvailable) {
    // Fallback: return text as-is with basic deduplication
    return basicDeduplication(text);
  }

  return new Promise((resolve, reject) => {
    const child = spawn("rtk", ["compress"], { stdio: "pipe" });

    let output = "";

    child.stdout?.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(output);
      } else {
        // Fallback on error
        resolve(basicDeduplication(text));
      }
    });

    child.on("error", () => {
      resolve(basicDeduplication(text));
    });

    child.stdin?.write(text);
    child.stdin?.end();
  });
}

/**
 * Basic deduplication fallback when RTK is not available
 */
function basicDeduplication(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let currentLine = "";
  let repeatCount = 0;

  for (const line of lines) {
    if (line === currentLine) {
      repeatCount++;
    } else {
      if (repeatCount > 1) {
        result.push(`[repeated ${repeatCount} times]`);
      }
      result.push(line);
      currentLine = line;
      repeatCount = 1;
    }
  }

  if (repeatCount > 1) {
    result.push(`[repeated ${repeatCount} times]`);
  }

  return result.join("\n");
}
