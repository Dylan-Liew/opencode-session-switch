/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes, type MouseEvent } from "@opentui/core";
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";

const PLUGIN_ID = "opencode-session-switch";
const SESSION_CACHE_TTL_MS = 10_000;
const SESSION_FETCH_TIMEOUT_MS = 5_000;
const SESSION_LIST_LIMIT = 50;
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
type SessionSortBy = "title" | "activity";

interface PluginSettings {
  sortBy?: SessionSortBy;
}

let cachedSessions: SessionView[] = [];
let cachedAt = 0;
let cacheDirty = true;
let refreshPromise: Promise<SessionView[]> | undefined;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function sessionArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }

  const result = asRecord(value) as SessionListResult | undefined;
  if (!result || result.error) {
    return undefined;
  }

  if (Array.isArray(result.data)) {
    return result.data;
  }

  const data = asRecord(result.data);
  if (Array.isArray(data?.sessions)) {
    return data.sessions;
  }

  if (Array.isArray(data?.items)) {
    return data.items;
  }

  return undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });
  promise.then(
    () => timer && clearTimeout(timer),
    () => timer && clearTimeout(timer),
  );

  return Promise.race([promise, timeout]);
}

function toSessionView(value: unknown): SessionView | undefined {
  const session = asRecord(value);
  if (!session || typeof session.id !== "string") {
    return undefined;
  }

  const parentID = session.parentID ?? session.parentId;
  if (typeof parentID === "string" && parentID.trim()) {
    return undefined;
  }

  const time = asRecord(session.time);
  const created = numberValue(time?.created) ?? numberValue(session.created) ?? 0;
  const updated = numberValue(time?.updated) ?? numberValue(session.updated) ?? created;
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

function sortSessions(left: SessionView, right: SessionView, sortBy: SessionSortBy): number {
  if (sortBy === "activity") {
    const updated = right.updated - left.updated;
    if (updated !== 0) {
      return updated;
    }
  }

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

async function fetchRecentSessions(api: TuiPluginApi, sortBy: SessionSortBy): Promise<SessionView[]> {
  let result: unknown;
  try {
    result = await withTimeout(api.client.session.list({ roots: true, limit: SESSION_LIST_LIMIT }), SESSION_FETCH_TIMEOUT_MS);
  } catch {
    return cachedSessions;
  }

  const data = sessionArray(result);
  if (!data) {
    return cachedSessions;
  }

  cachedSessions = data
    .map(toSessionView)
    .filter((session): session is SessionView => Boolean(session))
    .sort((left, right) => sortSessions(left, right, sortBy));
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

async function refreshRecentSessions(api: TuiPluginApi, currentSessionID: string, sortBy: SessionSortBy): Promise<SessionView[]> {
  refreshPromise ??= fetchRecentSessions(api, sortBy).finally(() => {
    refreshPromise = undefined;
  });

  return withCurrentSession(await refreshPromise, currentSessionID);
}

function clickPrimary(event: MouseEvent): boolean {
  if (event.button !== MouseButton.LEFT) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
}

function switchSession(api: TuiPluginApi, sessionID: string): void {
  try {
    api.route.navigate("session", { sessionID });
  } catch {
    api.ui.toast({ message: "Failed to switch session", variant: "error", duration: 2500 });
  }
}

function SidebarSessionSwitch(props: { api: TuiPluginApi; sessionID: string; sortBy: SessionSortBy }) {
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
      setSessions(await refreshRecentSessions(props.api, props.sessionID, props.sortBy));
    } catch {
      setSessions(getCachedSessions(props.sessionID));
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

  void refresh();

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
        onMouseUp={(event) => {
          if (clickPrimary(event)) {
            setExpanded((value) => !value);
          }
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
                        onMouseUp={(event) => {
                          if (clickPrimary(event)) {
                            selectSession(session.id);
                          }
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

const tui: TuiPlugin = async (api, options) => {
  const settings = (options ?? {}) as PluginSettings;
  const sortBy: SessionSortBy = settings.sortBy === "activity" ? "activity" : "title";

  api.slots.register({
    order: 175,
    slots: {
      sidebar_content(_ctx, props) {
        return <SidebarSessionSwitch api={api} sessionID={props.session_id} sortBy={sortBy} />;
      },
    },
  });
};

const plugin: TuiPluginModule & { id: string } = {
  id: PLUGIN_ID,
  tui,
};

export default plugin;
