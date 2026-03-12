import { describe, expect, it } from "vitest";
import { SearchService } from "../../server/core/services/searchService";
import {
  BaseAsyncPlugin,
  PluginManager,
} from "../../server/core/plugins/manager";
import type { SearchResult } from "../../server/core/types/models";

class ThrowingPlugin extends BaseAsyncPlugin {
  async search(): Promise<SearchResult[]> {
    throw new Error("plugin exploded");
  }
}

class SuccessPlugin extends BaseAsyncPlugin {
  async search(): Promise<SearchResult[]> {
    return [
      {
        message_id: "1",
        unique_id: "ok-1",
        channel: "success-plugin",
        datetime: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        title: "ok result",
        content: "ok result",
        links: [{ type: "quark", url: "https://example.com/1", password: "" }],
      },
    ];
  }
}

function createService(plugin: BaseAsyncPlugin) {
  const manager = new PluginManager();
  manager.registerPlugin(plugin);

  return new SearchService(
    {
      priorityChannels: [],
      defaultChannels: [],
      defaultConcurrency: 2,
      pluginTimeoutMs: 100,
      cacheEnabled: false,
      cacheTtlMinutes: 1,
    },
    manager
  );
}

function createServiceWithPlugins(plugins: BaseAsyncPlugin[]) {
  const manager = new PluginManager();
  for (const plugin of plugins) {
    manager.registerPlugin(plugin);
  }

  return new SearchService(
    {
      priorityChannels: [],
      defaultChannels: [],
      defaultConcurrency: 2,
      pluginTimeoutMs: 100,
      cacheEnabled: false,
      cacheTtlMinutes: 1,
    },
    manager
  );
}

describe("SearchService warnings", () => {
  it("returns warnings for the current failed search", async () => {
    const service = createService(new ThrowingPlugin("thrower", 1));

    const result = await service.searchWithWarnings(
      "test",
      [],
      1,
      false,
      "merged_by_type",
      "plugin",
      ["thrower"],
      undefined,
      {}
    );

    expect(result.response.total).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.source).toBe("plugin_search");
  });

  it("does not leak warnings into the next successful search", async () => {
    const service = createServiceWithPlugins([
      new ThrowingPlugin("thrower", 1),
      new SuccessPlugin("success", 1),
    ]);

    await service.searchWithWarnings(
      "test",
      [],
      1,
      false,
      "merged_by_type",
      "plugin",
      ["thrower"],
      undefined,
      {}
    );

    const result = await service.searchWithWarnings(
      "test",
      [],
      1,
      false,
      "merged_by_type",
      "plugin",
      ["success"],
      undefined,
      {}
    );

    expect(result.response.total).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});
