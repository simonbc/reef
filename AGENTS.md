# Reef Agent Guide

This file is the operating contract for agents working on Reef. Read it before
changing code.

## Product Definition

Reef is a local programmable runtime for participating in the social web.

It stores local source/state, subscribes to web nodes, processes content,
publishes to web nodes, and exposes agent-operable capabilities through skills.

Reef is:

- local-first
- feed-first
- markdown-native
- URL-native
- agent-operable
- skill-based
- social-web-oriented

Reef is not:

- a centralized platform
- a hosting provider
- a closed social network
- primarily a website builder
- an enterprise CMS

Core thesis: Reef itself is not the node. Published endpoints are the nodes. The
web is the platform.

## Development Discipline

Reef is developed TDD red/green.

For each behavior change:

1. Write or update a focused test first.
2. Run the test and see it fail for the expected reason.
3. Implement the smallest change that makes it pass.
4. Run the relevant test again, then `bun run check`.

Do not skip the red step for core runtime behavior, skill loading, workspace I/O,
publishing behavior, subscription behavior, config parsing, state persistence, UI
command semantics, or CLI command semantics.

## Commands

```sh
bun test
bun run check
bun run reef skill list
bun run reef build
bun run reef "publish posts/hello.md to my wordpress"
```

`bun run check` must stay fast. It should run tests and bundle the real CLI.

## Test Layout

Tests live under `tests/`, not next to implementation files.

Use this shape:

```text
tests/
  core/
  skills/
```

Keep tests behavior-focused. They may import runtime modules and skill entrypoints,
but should not force production code to expose internals solely for tests.

## Runtime Model

A Reef runtime is a local environment rooted in a directory:

```sh
mkdir blog
cd blog
reef
```

Running `reef` should eventually:

- initialize runtime state if needed
- start a local server
- open `http://localhost:3000`

The browser UI is the primary interface. CLI one-shot prompts exist because
hackers need them, but the product shape is browser-first.

## Canonical Workspace

Markdown files are canonical source. Database/state is derived or operational.

Target workspace shape:

```text
posts/
pages/
media/
skills/
reef.toml
state.db
```

Posts are the primary primitive: chronological social/web entries.

Pages are supporting stable resources: about pages, project pages, reference
pages.

Media contains images/files/assets used by posts/pages.

State contains connector state, subscriptions, sync metadata, and cache. Do not
make state canonical when markdown can be canonical.

## Feed-First Rule

Reef is feed-first.

Primary primitive: posts/events.

Primary output: feed.

Derived outputs: websites, RSS, profile pages, platform posts.

When a design decision pits `posts/` against `pages/`, prefer posts unless the
content is clearly stable reference material.

## Identity Model

Identity is primarily a domain or a publishing endpoint:

- `simonbc.com`
- a WordPress blog
- a Mastodon account
- a Bluesky account

Do not introduce a required Reef account, hosted control plane, or centralized
identity service.

## Skills Model

Skills are first-class agent-operable capabilities.

A skill may include:

- instructions
- available tools/actions
- required config
- required secrets
- safety rules
- output mapping

Skills may publish, subscribe, render, manage secrets, manipulate runtime state,
or transform source.

Built-in and third-party skills should use the same folder and manifest shape.
Avoid special cases for built-ins unless the behavior is truly core runtime.

Current skill shape:

```text
skills/<name>/
  skill.toml
  index.ts
```

Tool names are namespaced as `<skill>_<tool>` when exposed to the agent.

Skills should compose through the agent and shared runtime model, not by directly
calling each other.

## Processing Model

Processing operations include:

- create post
- edit post
- delete post
- reply
- publish
- sync
- import
- render
- organize

Processing may be initiated by humans, agents, or automations. Agents and humans
must operate on the same canonical runtime model.

## Config Model

Runtime config is split between global user config and project config.

Global user config lives at `~/.reef/config.toml`. It is for reusable account
defaults, publishing targets, and machine/user preferences.

Project config lives at `./reef.toml`. It is for runtime identity and
project-specific intent. The project directory must stay self-describing enough
to git clone and understand.

Example:

```toml
title = "Simon's Blog"
domain = "simonbc.com"

[wordpress]
url = "https://example.wordpress.com"
```

Project config wins over global config. A project can override one key in a
skill section while inheriting the rest from global config.

Global config may also contain reusable named accounts:

```toml
[wordpress.personal]
url = "https://personal.wordpress.com"

[github-pages.personal]
repo = "git@github.com:simonbc/simonbc.github.io.git"
branch = "gh-pages"
```

Config may contain identity, domains, subscriptions, theme config, preferences,
skill config, and reusable account targets.

Secrets do not belong in `reef.toml`. Use environment variables for the current
early implementation; move toward `reef secret set <skill>.<name>` and encrypted
local storage.

## Scripting Model

Users express intent through prompting:

```text
Publish hello.md to WordPress
Create an about page
Follow Dave Winer
Move blog to /blog
Set up GitHub Pages
```

The agent manipulates source/state, invokes skills, proposes configuration
changes, renders previews, and publishes output.

Agent-generated content should default to drafts for human review. Do not publish
new agent-authored content unless the user clearly asked to publish.

## Subscription Model

Subscriptions are external feeds brought into the runtime:

- RSS
- Atom
- JSON Feed
- WordPress feeds
- Mastodon feeds
- other Reef feeds

Subscribed posts are runtime input/state, not canonical source.

Two streams exist:

```text
incoming feed = subscribed content
outgoing feed = published content
```

Do not store incoming feed items as canonical markdown posts unless the user
explicitly imports or remixes them into local source.

## UI Model

Running `reef` opens a local web UI.

The UI combines:

- feed reading
- writing
- editing
- subscriptions
- publishing
- agent prompting

The runtime should feel lightweight, web-native, conversational, and
writing-first.

It should not feel dashboard-heavy, admin-heavy, or enterprise CMS-like.

Avoid generic SaaS dashboard patterns unless they directly improve repeated local
publishing workflows.

## Editing Model

Users can manually create/edit posts/pages and prompt agents to create/edit
drafts.

Preferred agent content flow:

```text
prompt -> draft created -> editor opens -> human edits/reviews -> publish
```

Agent-generated content defaults to drafts. Existing user-authored markdown
should not be overwritten without an explicit edit action and a clear test.

## Publishing Model

Markdown is canonical source.

Examples:

```text
posts/hello.md -> WordPress post
pages/about.md -> WordPress page
```

Skills determine how content maps onto external systems.

WordPress owns presentation. Reef primarily publishes content.

GitHub Pages owns no presentation layer. Reef must render the full site.

Deleting local source should not automatically delete remote content. Prefer
explicit unpublish/remove tools.

## Themes

Themes are optional rendering layers used primarily for website outputs.

Themes are not canonical source. Do not let theme implementation leak into the
source model for posts/pages.

## Architecture Boundaries

Current source layout:

- `bin/reef.ts`: CLI entrypoint
- `src/core/`: runtime internals
- `src/skill-api/`: public API for skills
- `skills/`: built-in skills using the same shape as third-party skills
- `posts/`, `pages/`, `media/`: workspace content

Keep `src/skill-api/` small and stable. If a helper is only needed by one skill,
put it in that skill or `src/core/` until a second real use appears.

Keep `src/core/` independent of specific publishing platforms. Platform-specific
code belongs in skills.

## WordPress Skill

Purpose: publish content to WordPress.

Responsibilities:

- auth
- REST API usage
- publish posts
- publish pages
- update/delete content via explicit tools
- negotiate WordPress constraints

Requires:

- site URL
- username
- app password/token

WordPress owns presentation. Reef primarily publishes content.

## GitHub Pages Skill

Purpose: publish full static websites.

Responsibilities:

- render markdown to HTML
- apply themes/CSS
- generate site structure
- publish via git/GitHub API

GitHub Pages owns no presentation layer. Reef must render the full site.

Current build contract:

- `reef build` writes `dist/index.html`, per-post pages, per-page pages,
  `dist/feed.json`, and `dist/styles.css`.
- `github-pages_publish_site` publishes the existing `dist/` directory to the
  configured branch. It should not silently build first; explicit build keeps the
  generated artifact inspectable before publishing.

## Testing Expectations

Every core behavior needs focused tests:

- config parsing and defaults
- workspace read/write/list/search behavior
- skill manifest loading and validation
- tool namespacing
- missing config/secret behavior
- agent loop tool-result handling
- publishing request mapping
- subscription state mapping
- CLI command routing

Network behavior should be tested behind small functions with mocked `fetch`.
Do not require real Anthropic, WordPress, GitHub, or feed endpoints in unit tests.

End-to-end manual tests are allowed for live publishing, but they do not replace
unit tests around mapping, validation, and error handling.

## Implementation Bias

Prefer:

- boring TypeScript
- small modules with clear runtime ownership
- file-backed behavior before database abstraction
- structured schemas over stringly typed glue
- tests before refactors
- explicit safety behavior over surprising automation

Avoid:

- premature hosted services
- provider abstractions before a second provider exists
- large framework choices before the browser UI needs them
- treating pages as the primary product
- making themes or static-site rendering the center of the system
- adding skill-to-skill dependencies in v1
