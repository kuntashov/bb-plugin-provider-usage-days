# Provider Usage Days

Standalone derivative of [BB Provider Usage](https://github.com/get-bb/bb/tree/main/plugins/provider-usage),
with quota consumption expressed in budget days. See [UPSTREAM.md](UPSTREAM.md)
for the pinned base revision and [LICENSE](LICENSE) for the MIT license.

## Day meters

Codex weekly windows show 7 rectangular segments; Cursor (`acp-cursor`) shows 30.
Each segment represents 1/7 or 1/30 of the total quota. Fractional days fill part of
one segment: 50% means 3.5 / 7 days for Codex or 15 / 30 days for Cursor. These are
budget equivalents, independent of calendar days elapsed or billing-month length.
The sidebar and settings each show a single meter and the percentage used. An
arrow below the segmented meter marks the current day, calculated from the reset
time and the fixed 7- or 30-day window. The arrow is hidden when the reset time
is missing, invalid, or has passed. The meter tooltip and accessible description
report used and remaining budget days. Windows without a day breakdown use a
plain bar.

Codex regular resets and optional additional reset credits are shown in Moscow
time. The sidebar can reuse the bundled Provider Usage display's machine selection
when it has no saved selection of its own.

## Install

Requires BB Plugin SDK 0.6.104 or newer within major version 0.

```sh
bb plugin install git:https://github.com/kuntashov/bb-plugin-provider-usage-days.git@main
```

For this private repository, the BB server needs GitHub access. To build from an
already authenticated local checkout:

```sh
npm ci
bb plugin build .
bb plugin install .
```

After verifying Provider Usage Days loads and reports usage, disable the original
`bb--provider-usage` plugin to leave one footer card. This does not disable the
providers that supply usage data. Re-enable it to return to the built-in display.

## Develop and verify

```sh
npm ci
npm run typecheck
npm run lint
npm test
bb plugin build .
```

UI components are vendored locally. Runtime access to BB uses the public
`@get-bb/plugin-sdk`; no BB monorepo checkout is required.

## Usage sources and display

Shows usage from enabled usage-source plugins in the sidebar. When a location has
more than one provider, the card opens on an **All** tab that stacks every provider
tab's accounts, each marked with its provider icon. Provider tabs use provider icons,
with pooled accounts stacked under each provider. Each account shows its plan and,
per usage window, a bar, the percent used, and the time until reset.

The card lists account metadata cheaply, then fetches the accounts on the selected
tab. Unopened tabs have no quota badge until measured, and a badge shows only while
that provider's accounts are off screen. Shared sources such as Account Pooler are selected by default; an explicit
machine selection shows that machine’s local usage instead.

An unconfigured shared source remains selectable and shows setup guidance.
Failed refreshes retain the last available measurements with a retry notice.
Account authentication failures and plans without reported limits have separate
states; unavailable usage is never represented as zero consumption.

Settings → Installed plugins → Provider Usage Days contains the usage page, using its
full-size provider groups with email-labeled accounts and fetching only resources in the selected pool or machine. Both surfaces share the plugin’s aggregation and cache. Neither display is required for source
plugins to publish their usage.

Use `bb plugin rpc list --method provider-usage.v1.listResources --json` to find sources
and `bb plugin rpc inspect <plugin-id> provider-usage.v1.listResources --json`
to inspect their published contracts. RPC calls accept JSON through
`--input-file`. See the Plugin Guide for the contract API.

`bb settings usage --json` and `bb.sdk.system.usageLimits()` remain the
host-local provider-maintenance view; they do not aggregate shared pool accounts.

Codex, Claude Code, and ACP provider plugins explicitly implement the usage contract
for their own providers. Account Pooler implements it for shared accounts. The
contract is owned here and copied into each source; no additional adapter plugin,
provider-kit helper, or core runtime convention is required. Other providers must
explicitly implement the contract to appear in these displays.

OpenCode's host-local source reports OpenCode Go subscription limits when a Go
Console account or API key is configured on the selected machine. Its five-hour, weekly, and monthly
windows come from Go's usage API. Other providers used through OpenCode and Zen
pay-as-you-go spending are not included.

Known provider-issued account identities are deduplicated within the selected
location. Unknown identities are never merged by email. Structured plan and quota
window metadata give both displays consistent labels.

Provider Usage is enabled by default for newly registered installations. Existing
explicit enable/disable choices are preserved. Right-click the footer shortcut and
choose **Hide** to move it into **More**. Settings → Appearance → Sidebar footer
controls order and visibility for every footer action. The usage settings page
remains available. These preferences belong to BB, not the plugin.
