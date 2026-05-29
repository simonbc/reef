# reef

Local programmable runtime for publishing markdown to the social web.

## Install

Install directly from GitHub with Bun:

```sh
bun install -g github:simonbc/reef
```

Then run Reef from any runtime directory:

```sh
reef
reef skill list
reef build
```

## Run

```sh
bun run reef
bun run reef skill list
bun run reef build
bun run reef open
bun run reef open post hello
bun run reef open page about
bun run reef "publish posts/hello.md to my wordpress"
bun run reef "publish my site to github pages"
bun run reef "post hello from Reef to mastodon"
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

Inside the harness, slash commands are available for common local actions:

```text
/build
/posts
/pages
/open
/open post hello
/open page about
/open post 1
/open page 1
/debug on
/debug off
/exit
```

You can also ask Reef to open built pages in the browser:

```text
let me view my latest post
open the about page
```

Open the local server or source markdown files from the CLI:

```sh
bun run reef open
bun run reef open post hello
bun run reef open page about
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

[mastodon]
instance = "https://mastodon.social"

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

WordPress publishing reads the site URL from `[wordpress].url` in merged config.
The agent can create a fill-in template for you:

```sh
bun run reef "set up wordpress"
```

By default this writes to `~/.reef/config.toml` so the same WordPress account can
be reused across Reef projects:

```toml
[wordpress]
url = "https://your-site.wordpress.com"
username = "your-wordpress-username"
app_password = "your-wordpress-application-password"
```

Environment variables are also supported:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export REEF_WP_URL=https://example.wordpress.com
export REEF_WORDPRESS_USERNAME=your-wordpress-username
export REEF_WORDPRESS_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
export REEF_MASTODON_ACCESS_TOKEN='...'
```

After a post is published to WordPress, Reef stores the returned WordPress post
id in local skill state. Later edits to the markdown source can update the same
WordPress post:

```sh
bun run reef "update posts/hello.md on wordpress"
```

GitHub Pages publishing expects `dist/` to exist and reads its target repository
from `[github-pages].repo` in merged config. `[github-pages].branch` defaults to
`gh-pages` when omitted:

```sh
bun run reef build
bun run reef "publish my site to github pages"
```

Mastodon publishing uses `[mastodon].instance` and a manually generated access
token for now. Create a
Mastodon application in your instance's Development settings with
`write:statuses`, then set:

```sh
export REEF_MASTODON_ACCESS_TOKEN='...'
```

Configure the instance:

```toml
[mastodon]
instance = "https://mastodon.social"
```

Then post direct text or publish an existing local markdown post:

```sh
bun run reef "post hello from Reef to mastodon"
bun run reef "publish posts/hello.md to mastodon"
```

Direct Mastodon status prompts create a dated markdown post in `posts/` first,
then publish that canonical source to Mastodon. Existing post prompts publish
from the named markdown file.

When Reef publishes a markdown post to Mastodon, it records the returned status
id in local skill state. Later prompts can update that same Mastodon status from
the edited markdown source:

```sh
bun run reef "update posts/hello.md on mastodon"
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
