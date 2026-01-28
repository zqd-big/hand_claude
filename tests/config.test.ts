import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config/loader";

const SAMPLE_CONFIG = {
  Providers: [
    {
      name: "huawei",
      api_base_url: "http://example.com/v1/chat/completions",
      api_key: "sk-file",
      models: ["m1"],
      transformer: {
        use: [["maxtoken", { max_tokens: 123 }]]
      }
    }
  ],
  Router: {
    default: "huawei,m1",
    LOG: true
  }
};

describe("config loader", () => {
  it("loads explicit config path", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "hcai-"));
    const file = path.join(dir, "hcai.config.json");
    await fsp.writeFile(file, JSON.stringify(SAMPLE_CONFIG, null, 2), "utf8");

    const loaded = await loadConfig({ configPath: file });
    expect(loaded.config.Providers[0]?.name).toBe("huawei");
    expect(loaded.path).toBe(file);
  });

  it("env overrides provider key", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "hcai-"));
    const file = path.join(dir, "hcai.config.json");
    await fsp.writeFile(file, JSON.stringify(SAMPLE_CONFIG, null, 2), "utf8");

    process.env.HCAI_HUAWEI_API_KEY = "sk-env";
    const loaded = await loadConfig({ configPath: file });
    expect(loaded.config.Providers[0]?.api_key).toBe("sk-env");
    delete process.env.HCAI_HUAWEI_API_KEY;
  });
});