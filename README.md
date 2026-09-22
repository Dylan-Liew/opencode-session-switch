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

For an OpenCode V2 manual install, add the plugin to `~/.config/opencode/opencode.json`. OpenCode loads its server entrypoint and sends its `tui` entrypoint to the CLI:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-session-switch"]
}
```

OpenCode V1 continues to load the same package from `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["opencode-session-switch/tui"]
}
```

For local V2 development, use `file:///path/to/opencode-session-switch`. For V1, use the checkout path in `tui.json`. Restart OpenCode after changing plugin config.

## Use It

- Sidebar: expand `Sessions` and click a session name to switch to it.

## Notes

The sidebar uses OpenCode's local CLI route API for direct session switching. It supports OpenCode V1 1.18.31 and V2 2.0.7.

## License

MIT
