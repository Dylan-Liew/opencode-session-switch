/** @jsxImportSource @opentui/solid */
import { TextAttributes, type MouseEvent } from "@opentui/core";
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createSignal, For, onMount, Show } from "solid-js";

const PLUGIN_ID = "opencode-session-switch";
const MAX_RECENT_SESSIONS = 5;

interface SessionView {
  id: string;
  title: string;
  updated: number;
  current: boolean;
}

interface SessionListResult {
  data?: unknown;
  error?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function toSessionView(value: unknown, currentSessionID: string): SessionView | undefined {
  const session = asRecord(value);
  if (!session || typeof session.id !== "string") {
    return undefined;
  }

  const time = asRecord(session.time);
  const updated = typeof time?.updated === "number" ? time.updated : 0;
  const title = typeof session.title === "string" && session.title.trim() ? session.title.trim() : "Untitled session";
  return {
    id: session.id,
    title,
    updated,
    current: session.id === currentSessionID,
  };
}

function shortTitle(title: string): string {
  return title.length > 34 ? `${title.slice(0, 33)}...` : title;
}

async function fetchRecentSessions(api: TuiPluginApi, currentSessionID: string): Promise<SessionView[]> {
  const result = (await api.client.session.list()) as SessionListResult;
  if (result.error || !Array.isArray(result.data)) {
    return [];
  }

  return result.data
    .map((session) => toSessionView(session, currentSessionID))
    .filter((session): session is SessionView => Boolean(session))
    .sort((left, right) => right.updated - left.updated)
    .slice(0, MAX_RECENT_SESSIONS);
}

function clickPrimary(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function switchSession(api: TuiPluginApi, sessionID: string): void {
  try {
    api.route.navigate("session", { sessionID });
  } catch {
    api.ui.toast({ message: "Failed to switch session", variant: "error", duration: 2500 });
  }
}

function SidebarSessionSwitch(props: { api: TuiPluginApi; sessionID: string }) {
  const theme = props.api.theme.current;
  const [sessions, setSessions] = createSignal<SessionView[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [expanded, setExpanded] = createSignal(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setSessions(await fetchRecentSessions(props.api, props.sessionID));
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void refresh();
  });

  return (
    <box flexDirection="column" gap={0} paddingTop={1} paddingBottom={1}>
      <box
        flexDirection="row"
        gap={1}
        alignItems="center"
        onMouseDown={(event) => {
          clickPrimary(event);
          setExpanded((value) => !value);
        }}
      >
        <text fg={theme.text}>{expanded() ? "▼" : "▶"}</text>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Sessions
        </text>
      </box>

      <Show when={expanded()}>
        <Show when={!loading()} fallback={<text fg={theme.textMuted}>  Loading sessions...</text>}>
          <Show when={sessions().length > 0} fallback={<text fg={theme.textMuted}>  No other recent sessions</text>}>
            <box flexDirection="column" gap={0}>
              <For each={sessions()}>
                {(session) => (
                  <text
                    fg={session.current ? theme.primary : theme.text}
                    onMouseDown={(event) => {
                      clickPrimary(event);
                      switchSession(props.api, session.id);
                    }}
                  >
                    {`  ${shortTitle(session.title)}`}
                  </text>
                )}
              </For>
            </box>
          </Show>
        </Show>
      </Show>
    </box>
  );
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 250,
    slots: {
      sidebar_content(_ctx, props) {
        return <SidebarSessionSwitch api={api} sessionID={props.session_id} />;
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default plugin;
