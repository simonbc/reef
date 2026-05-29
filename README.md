# reef

Local programmable runtime for publishing markdown to the social web.

## Run

```sh
bun run reef
bun run reef skill list
bun run reef build
bun run reef "publish posts/hello.md to my wordpress"
bun run reef "publish my site to github pages"
bun run reef "make the site feel like a clean personal notebook"
```

Running `reef` with no arguments starts the terminal harness and serves the built
site at `http://localhost:3000`.

The terminal shows `>` when Reef is ready for a prompt:

```text
Built 4 files into dist/.
Serving site at http://localhost:3000
Type a prompt, /build, or /exit.
> 
```

`http://localhost:3000/` is the site itself, not a Reef admin UI.

## Configuration

Reef reads global user config from `~/.reef/config.toml` and project config from
`./reef.toml`.

Use global config for reusable account/project defaults:

```toml
anthropic_key_env = "ANTHROPIC_API_KEY"

[wordpress]
url = "https://example.wordpress.com"

[github-pages]
repo = "git@github.com:you/you.github.io.git"
branch = "gh-pages"

[wordpress.personal]
url = "https://personal.wordpress.com"

[github-pages.personal]
repo = "git@github.com:you/you.github.io.git"
branch = "gh-pages"
```

Use project config for the local runtime identity and project-specific overrides:

```toml
title = "My Reef"
domain = "https://example.com"

[github-pages]
branch = "project-pages"
```

Project config wins over global config. In the example above, Reef uses the
global GitHub Pages repo but publishes to the project-specific branch.

WordPress publishing currently reads credentials from environment variables:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export REEF_WORDPRESS_USERNAME=your-wordpress-username
export REEF_WORDPRESS_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
```

GitHub Pages publishing expects `dist/` to exist and reads its target repository
from merged config:

```sh
bun run reef build
bun run reef "publish my site to github pages"
```

## Theme

Design source lives in canonical theme files:

```text
theme/layout.html
theme/styles.css
```

`reef build` uses those files when present. If they do not exist, Reef uses a
small default theme.

The theme skill can read or replace them through prompts:

```sh
bun run reef "show me the current theme"
bun run reef "make the site feel like a clean personal notebook"
bun run reef "make the background warm and the post list more spacious"
```

Theme update tools rebuild `dist/` automatically. To inspect or rebuild manually:

```sh
bun run reef build
open dist/index.html
```
