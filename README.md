# reef

Local programmable runtime for publishing markdown to the social web.

## Run

```sh
bun run reef skill list
bun run reef "publish posts/hello.md to my wordpress"
```

WordPress publishing currently reads credentials from environment variables:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export REEF_WP_URL=https://example.wordpress.com
export REEF_WORDPRESS_USERNAME=your-wordpress-username
export REEF_WORDPRESS_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx'
```

The spike-compatible `REEF_WP_USERNAME` and `REEF_WP_APP_PASSWORD` names still
work during this transition.

## Spike

The first proof is in `spike/`. It tests the core wedge before the full runtime
exists:

```text
markdown file -> Claude tool loop -> WordPress REST API -> live post
```

See `spike/README.md` for setup and run instructions.

From the repo root, the spike can still be run directly:

```sh
bun run spike/bin/reef.ts "publish spike/posts/hello.md to my wordpress"
```
