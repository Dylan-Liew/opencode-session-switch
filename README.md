# OpenCode Session Switch

Adds a compact session dropdown to the OpenCode sidebar.

## Install

Recommended:

```bash
opencode plugin -g opencode-session-switch
```

If OpenCode already has an older cached copy, force a refresh:

```bash
opencode plugin -g -f opencode-session-switch
```

Manual install:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-session-switch"]
}
```

For local development, add your local checkout path to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/path/to/opencode-session-switch"]
}
```

Restart OpenCode after changing TUI plugin config.

## Use It

- Sidebar: expand `Sessions` and click a session name to switch to it.

## Notes

The sidebar uses OpenCode's TUI route API for direct session switching.

## License

MIT
