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
reef posts --json
```

To teach Codex how to operate Reef projects from an agent harness, install the
global Codex skill once:

```sh
reef agent install codex
```

For a specific Reef project, optionally add project-local agent instructions:

```sh
reef agent init codex
```

## Agent-Native CLI

Reef is a local runtime. Agent harnesses such as Codex or Claude Code should
prefer explicit commands and direct file edits over the built-in prompt harness:

```sh
reef posts --json
reef pages --json
reef post read 1 --json
reef page read about --json
reef publish wordpress 1 --json
reef update wordpress 1 --json
reef publish mastodon 1 --visibility unlisted --json
reef update mastodon 1 --json
reef setup wordpress --json
reef setup mastodon --json
```

Markdown in `posts/` and `pages/` remains canonical source. Publish/update
commands use skill state in `.reef/skill-state/` to map local markdown to remote
platform ids and URLs.

## Prompt Harness

```sh
bun run reef
bun run reef skill list
bun run reef open
bun run reef open post hello
bun run reef open page about
bun run reef "publish posts/hello.md to my wordpress"
bun run reef "post hello from Reef to mastodon"
bun run reef "draft a short post about Reef"
```

Running `reef` with no arguments starts the terminal harness and serves the local
workspace app at `http://localhost:3000`.

The terminal shows `>` when Reef is ready for a prompt:

```text
Serving Reef workspace at http://localhost:3000
Type a prompt or /exit.
> 
```

`http://localhost:3000/` is a Reef app over local markdown source. It live-renders
posts and pages for inspection; it is not a preview of a generated site.

Inside the harness, slash commands are available for common local actions:

```text
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

You can also ask Reef to open local posts and pages in the browser:

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

[mastodon]
instance = "https://mastodon.social"

[wordpress.personal]
url = "https://personal.wordpress.com"
```

Use project config for the local runtime identity and project-specific overrides:

```toml
title = "My Reef"
domain = "https://example.com"
```

Project config wins over global config.

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
