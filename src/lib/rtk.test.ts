import { describe, it, expect } from "bun:test";
import { isRtkAvailable, rtkWrap, compressWithRtk } from "./rtk";

describe("RTK Integration", () => {
  describe("isRtkAvailable", () => {
    it("returns boolean without throwing", async () => {
      const result = await isRtkAvailable();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("rtkWrap", () => {
    it("executes command and returns output", async () => {
      const result = await rtkWrap({
        command: "echo",
        args: ["hello"],
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hello");
    });

    it("handles commands with non-zero exit codes", async () => {
      const result = await rtkWrap({
        command: "false",
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe("compressWithRtk", () => {
    it("returns compressed or original text", async () => {
      const input = "line1\nline1\nline1\nline2";
      const result = await compressWithRtk(input);

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("handles empty input", async () => {
      const result = await compressWithRtk("");
      expect(result).toBe("");
    });
  });
});
