# OpenCode Session Switch

Adds a compact session dropdown to the OpenCode sidebar.

> [!IMPORTANT]
> Version 1.x supports OpenCode v2 only. OpenCode v1 is no longer supported; use the final 0.x release if you must remain on v1.

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
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-session-switch"]
}
```

For local development, add your local checkout path to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["file:///path/to/opencode-session-switch"]
}
```

Reload or restart OpenCode after changing plugin config.

## Use It

- Sidebar: expand `Sessions` and click a session name to switch to it.

## Notes

The sidebar uses OpenCode's TUI route API for direct session switching.

## License

MIT
