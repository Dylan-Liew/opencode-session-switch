/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes, type MouseEvent } from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

const PLUGIN_ID = "opencode-session-switch";
const SWITCH_GUARD_MS = 350;
const SESSION_LIST_MAX_HEIGHT = 12;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

interface SessionView {
  id: string;
  title: string;
  updated: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function toSessionView(value: unknown): SessionView | undefined {
  const session = asRecord(value);
  if (!session || typeof session.id !== "string") return;

  const parentID = session.parentID ?? session.parentId;
  if (typeof parentID === "string" && parentID.trim()) return;

  const time = asRecord(session.time);
  const created = typeof time?.created === "number" ? time.created : 0;
  const updated = typeof time?.updated === "number" ? time.updated : created;
  return {
    id: session.id,
    title: typeof session.title === "string" && session.title.trim() ? session.title.trim() : "Untitled session",
    updated,
  };
}

function shortTitle(title: string): string {
  return title.length > 26 ? `${title.slice(0, 25)}...` : title;
}

function clickPrimary(event: MouseEvent): boolean {
  if (event.button !== MouseButton.LEFT) return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function SidebarSessionSwitch(props: { context: Context; sessionID: string }) {
  const theme = props.context.theme;
  const [sessions, setSessions] = createSignal<SessionView[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [expanded, setExpanded] = createSignal(true);
  const [switchingSessionID, setSwitchingSessionID] = createSignal<string>();
  const [spinnerIndex, setSpinnerIndex] = createSignal(0);
  let refreshing: Promise<void> | undefined;

  const refresh = async () => {
    refreshing ??= props.context.client.session
      .list({ parentID: null, limit: 50, order: "desc" })
      .then((result) => {
        setSessions(
          result.data
            .map(toSessionView)
            .filter((session): session is SessionView => Boolean(session))
            .sort((left, right) => right.updated - left.updated),
        );
      })
      .catch(() => {
        props.context.ui.toast.show({ message: "Failed to load sessions", variant: "error", duration: 2500 });
      })
      .finally(() => {
        refreshing = undefined;
        setLoading(false);
      });
    return refreshing;
  };

  onMount(() => void refresh());
  const stopCreated = props.context.data.on("session.created", () => void refresh());
  const stopRenamed = props.context.data.on("session.renamed", () => void refresh());
  const stopDeleted = props.context.data.on("session.deleted", () => void refresh());
  const spinnerTimer = setInterval(() => setSpinnerIndex((index) => index + 1), SPINNER_INTERVAL_MS);
  const switchTimers = new Set<ReturnType<typeof setTimeout>>();

  onCleanup(() => {
    clearInterval(spinnerTimer);
    switchTimers.forEach(clearTimeout);
    stopCreated();
    stopRenamed();
    stopDeleted();
  });

  const selectSession = (sessionID: string) => {
    if (switchingSessionID() || sessionID === props.sessionID) return;
    setSwitchingSessionID(sessionID);
    props.context.ui.router.navigate({ type: "session", sessionID });
    const timer = setTimeout(() => {
      switchTimers.delete(timer);
      setSwitchingSessionID(undefined);
    }, SWITCH_GUARD_MS);
    switchTimers.add(timer);
  };

  return (
    <box flexDirection="column" gap={0} paddingTop={1} paddingBottom={1}>
      <box
        flexDirection="row"
        gap={1}
        alignItems="center"
        onMouseUp={(event) => {
          if (clickPrimary(event)) setExpanded((value) => !value);
        }}
      >
        <text fg={theme.text.default}>{expanded() ? "▼" : "▶"}</text>
        <text fg={theme.text.default} attributes={TextAttributes.BOLD}>Sessions</text>
      </box>

      <Show when={expanded()}>
        <Show when={!loading()} fallback={<text fg={theme.text.subdued}>  Loading sessions...</text>}>
          <Show when={sessions().length > 0} fallback={<text fg={theme.text.subdued}>  No other recent sessions</text>}>
            <scrollbox maxHeight={SESSION_LIST_MAX_HEIGHT}>
              <box flexDirection="column" gap={0}>
                <For each={sessions()}>
                  {(session) => {
                    const running = () => props.context.data.session.status(session.id) === "running";
                    const current = () => session.id === props.sessionID;
                    return (
                      <box
                        flexDirection="row"
                        justifyContent="space-between"
                        gap={1}
                        onMouseUp={(event) => {
                          if (clickPrimary(event)) selectSession(session.id);
                        }}
                      >
                        <text
                          fg={
                            current() || switchingSessionID() === session.id
                              ? theme.text.action.primary.default
                              : theme.text.default
                          }
                        >
                          {`  ${shortTitle(session.title)}`}
                        </text>
                        <Show when={running()} fallback={<text fg={theme.text.subdued}>idle</text>}>
                          <text fg={theme.text.subdued}>{SPINNER_FRAMES[spinnerIndex() % SPINNER_FRAMES.length]}</text>
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

export default Plugin.define({
  id: PLUGIN_ID,
  setup(context) {
    return context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarSessionSwitch context={context} sessionID={props.sessionID} />,
    });
  },
});
