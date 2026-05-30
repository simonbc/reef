---
name: reef
description: "Use when working with a Reef runtime from Codex: inspect posts/pages/config, edit canonical markdown/theme/config files, build the local site, run the dev harness, set up publishing targets, and publish or update WordPress, Mastodon, or GitHub Pages through Reef CLI commands."
metadata:
  short-description: Operate a Reef runtime from Codex
---

# Reef

Reef is a local runtime for publishing markdown to the social web. Codex is the
agent harness; Reef is the source/state/publishing runtime.

## Core Rules

- Markdown in `posts/` and `pages/` is canonical source.
- Theme source lives in `theme/layout.html` and `theme/styles.css`.
- Project config lives in `reef.toml`; user config lives in `~/.reef/config.toml`.
- Platform ids/URLs live in `.reef/skill-state/`.
- Do not publish/update remote platforms unless the user explicitly asks.
- For new content, create or edit markdown first, then publish through Reef.
- Prefer explicit CLI commands and `--json` over the prompt harness.

## Inspect

Use these before changing content or publishing:

```sh
reef posts --json
reef pages --json
reef post read <slug|path|number> --json
reef page read <slug|path|number> --json
reef config show --json
reef skill list
```

If global `reef` is stale or unavailable inside this repo, use:

```sh
bun run ~/code/reef/bin/reef.ts <command>
```

## Edit

Edit canonical files directly when practical:

```text
posts/*.md
pages/*.md
theme/layout.html
theme/styles.css
reef.toml
```

For simple project config edits, prefer:

```sh
reef config set title "Site Title" --json
reef config set domain "https://example.com" --json
reef config set github-pages.branch gh-pages --json
```

## Build And Preview

```sh
reef build
reef
```

Bare `reef` starts the local harness/server. The served site is at
`http://localhost:3000/`. Browser tabs auto-refresh when the harness rebuilds.

## Setup

Use setup commands to create fill-in templates. Do not invent secret values.

```sh
reef setup wordpress --json
reef setup mastodon --json
reef setup github-pages --json
```

Use `--project` when the config should be written to local `reef.toml` instead
of global `~/.reef/config.toml`.

## Publish And Update

Use explicit publish/update commands only after direct user intent:

```sh
reef publish wordpress <slug|path|number> --json
reef update wordpress <slug|path|number> --json
reef publish mastodon <slug|path|number> --visibility public --json
reef update mastodon <slug|path|number> --json
reef publish github-pages --json
```

If update reports that no platform state is recorded, explain that Reef needs an
existing recorded remote id before it can update in place.

## Validation

After changing Reef code, run:

```sh
bun run check
```

After changing a Reef runtime/site, run:

```sh
reef build
```
