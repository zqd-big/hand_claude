import { describe, it, expect } from "vitest";
import {
  parseProviderModel,
  resolveRoute,
  applyProviderTransformers
} from "../src/router/router";

const CONFIG = {
  Providers: [
    {
      name: "p1",
      api_base_url: "http://example.com",
      api_key: "sk",
      models: ["m1", "m2"],
      transformer: {
        use: [["maxtoken", { max_tokens: 999 }]]
      }
    }
  ],
  Router: {
    default: "p1,m1",
    LOG: false
  }
};

describe("router", () => {
  it("parses provider,model", () => {
    expect(parseProviderModel("a,b")).toEqual({
      providerName: "a",
      modelName: "b"
    });
  });

  it("resolves default route", () => {
    const route = resolveRoute(CONFIG as any);
    expect(route.providerName).toBe("p1");
    expect(route.modelName).toBe("m1");
  });

  it("injects transformer max_tokens only when absent", () => {
    const route = resolveRoute(CONFIG as any);
    const req1 = applyProviderTransformers(route.provider, {});
    expect(req1.max_tokens).toBe(999);

    const req2 = applyProviderTransformers(route.provider, { max_tokens: 5 });
    expect(req2.max_tokens).toBe(5);
  });
});