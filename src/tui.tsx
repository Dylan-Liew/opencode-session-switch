/** @jsxImportSource @opentui/solid */
import { TextAttributes, type MouseEvent } from "@opentui/core";
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

const PLUGIN_ID = "opencode-session-switch";
const SESSION_CACHE_TTL_MS = 10_000;
const SWITCH_GUARD_MS = 350;
const SESSION_LIST_MAX_HEIGHT = 12;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

interface SessionView {
  id: string;
  title: string;
  created: number;
  updated: number;
  current: boolean;
}

interface SessionListResult {
  data?: unknown;
  error?: unknown;
}

type SessionEventName = "session.created" | "session.updated" | "session.deleted";
type SessionStatusLabel = "busy" | "retry" | "idle";

let cachedSessions: SessionView[] = [];
let cachedAt = 0;
let cacheDirty = true;
let refreshPromise: Promise<SessionView[]> | undefined;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function toSessionView(value: unknown): SessionView | undefined {
  const session = asRecord(value);
  if (!session || typeof session.id !== "string") {
    return undefined;
  }

  if (typeof session.parentID === "string" && session.parentID.trim()) {
    return undefined;
  }

  const time = asRecord(session.time);
  const created = typeof time?.created === "number" ? time.created : 0;
  const updated = typeof time?.updated === "number" ? time.updated : 0;
  const title = typeof session.title === "string" && session.title.trim() ? session.title.trim() : "Untitled session";
  return {
    id: session.id,
    title,
    created,
    updated,
    current: false,
  };
}

function shortTitle(title: string): string {
  return title.length > 26 ? `${title.slice(0, 25)}...` : title;
}

function sortSessions(left: SessionView, right: SessionView): number {
  const title = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  if (title !== 0) {
    return title;
  }

  return left.id.localeCompare(right.id);
}

function getSessionStatus(api: TuiPluginApi, sessionID: string): SessionStatusLabel {
  const status = api.state.session.status(sessionID);
  if (status?.type === "busy") {
    return "busy";
  }

  if (status?.type === "retry") {
    return "retry";
  }

  return "idle";
}

function spinnerFrame(index: number): string {
  return SPINNER_FRAMES[index % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0]!;
}

function withCurrentSession(sessions: SessionView[], currentSessionID: string): SessionView[] {
  return sessions.map((session) => ({
    ...session,
    current: session.id === currentSessionID,
  }));
}

async function fetchRecentSessions(api: TuiPluginApi): Promise<SessionView[]> {
  const result = (await api.client.session.list()) as SessionListResult;
  if (result.error || !Array.isArray(result.data)) {
    return cachedSessions;
  }

  cachedSessions = result.data
    .map(toSessionView)
    .filter((session): session is SessionView => Boolean(session))
    .sort(sortSessions);
  cachedAt = Date.now();
  cacheDirty = false;

  return cachedSessions;
}

function getCachedSessions(currentSessionID: string): SessionView[] {
  return withCurrentSession(cachedSessions, currentSessionID);
}

function shouldRefreshSessions(): boolean {
  return cacheDirty || cachedSessions.length === 0 || Date.now() - cachedAt > SESSION_CACHE_TTL_MS;
}

async function refreshRecentSessions(api: TuiPluginApi, currentSessionID: string): Promise<SessionView[]> {
  refreshPromise ??= fetchRecentSessions(api).finally(() => {
    refreshPromise = undefined;
  });

  return withCurrentSession(await refreshPromise, currentSessionID);
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
  const [sessions, setSessions] = createSignal<SessionView[]>(getCachedSessions(props.sessionID));
  const [loading, setLoading] = createSignal(cachedSessions.length === 0);
  const [expanded, setExpanded] = createSignal(true);
  const [switchingSessionID, setSwitchingSessionID] = createSignal<string | undefined>();
  const [spinnerIndex, setSpinnerIndex] = createSignal(0);
  const visibleSessions = createMemo(() => withCurrentSession(sessions(), props.sessionID));

  const refresh = async (force = false) => {
    if (!force && !shouldRefreshSessions()) {
      setSessions(getCachedSessions(props.sessionID));
      setLoading(false);
      return;
    }

    setLoading(cachedSessions.length === 0);
    try {
      setSessions(await refreshRecentSessions(props.api, props.sessionID));
    } finally {
      setLoading(false);
    }
  };

  const selectSession = (sessionID: string) => {
    if (switchingSessionID() || sessionID === props.sessionID) {
      return;
    }

    setSwitchingSessionID(sessionID);
    switchSession(props.api, sessionID);
    setTimeout(() => setSwitchingSessionID(undefined), SWITCH_GUARD_MS);
  };

  onMount(() => {
    void refresh();
  });

  const spinnerTimer = setInterval(() => {
    setSpinnerIndex((index) => index + 1);
  }, SPINNER_INTERVAL_MS);

  const sessionEvents: SessionEventName[] = ["session.created", "session.updated", "session.deleted"];
  const disposers = sessionEvents.map((event) =>
    props.api.event.on(event, () => {
      cacheDirty = true;
      void refresh(true);
    }),
  );
  onCleanup(() => {
    clearInterval(spinnerTimer);
    disposers.forEach((dispose) => dispose());
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
          <Show when={visibleSessions().length > 0} fallback={<text fg={theme.textMuted}>  No other recent sessions</text>}>
            <scrollbox maxHeight={SESSION_LIST_MAX_HEIGHT}>
              <box flexDirection="column" gap={0}>
                <For each={visibleSessions()}>
                  {(session) => {
                    const status = () => getSessionStatus(props.api, session.id);
                    return (
                      <box
                        flexDirection="row"
                        gap={1}
                        onMouseDown={(event) => {
                          clickPrimary(event);
                          selectSession(session.id);
                        }}
                      >
                        <text fg={session.current || switchingSessionID() === session.id ? theme.primary : theme.text}>
                          {`  ${shortTitle(session.title)}`}
                        </text>
                        <Show
                          when={status() === "busy"}
                          fallback={
                            <Show when={status() === "retry"}>
                              <text fg={theme.warning}>retry</text>
                            </Show>
                          }
                        >
                          <text fg={theme.textMuted}>{spinnerFrame(spinnerIndex())}</text>
                        </Show>
                      </box>
                    );
                  }}
                </For>
              </box>
            </scrollbox>
          </Show>
        </Show>
      </Show>
    </box>
  );
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 175,
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
