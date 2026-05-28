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
