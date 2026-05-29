# reef

Local programmable runtime for publishing markdown to the social web.

## Run

```sh
bun run reef skill list
bun run reef build
bun run reef "publish posts/hello.md to my wordpress"
bun run reef "publish my site to github pages"
```

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
