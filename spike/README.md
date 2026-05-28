# reef spike

This is the throwaway proof for reef's core wedge:

```text
markdown file -> Claude tool loop -> WordPress REST API -> live post
```

It intentionally skips the real reef platform pieces: no skill manifest, no PGlite,
no browser UI, no secret store, no generic loader.

## Setup

Set these environment variables:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export REEF_WP_URL=https://example.wordpress.com
export REEF_WP_USERNAME=your-wordpress-username
export REEF_WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
```

Optional:

```sh
export CLAUDE_MODEL=claude-opus-4-7
export REEF_WP_STATUS=publish
```

## Run

From this directory:

```sh
bun run reef "publish posts/hello.md to my wordpress"
```

Expected result: Claude calls the single available tool, the post is created in
WordPress, and the CLI prints the live URL.

