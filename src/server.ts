import type { Hooks, Plugin, PluginModule } from "@opencode-ai/plugin";

const PLUGIN_ID = "opencode-session-switch";

const server: Plugin = async (): Promise<Hooks> => ({});

const module: PluginModule & { id: string } = {
  id: PLUGIN_ID,
  server,
};

export default module;
