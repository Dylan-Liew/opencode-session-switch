import type { Hooks, Plugin, PluginModule } from "@opencode-ai/plugin";
import type { Plugin as V2Plugin } from "@opencode/plugin";

const PLUGIN_ID = "opencode-session-switch";

const server: Plugin = async (): Promise<Hooks> => ({});

const module: PluginModule & V2Plugin.Plugin = {
  id: PLUGIN_ID,
  server,
  setup() {},
};

export default module;
