# 42 Verification Bot

A Discord bot that links Discord accounts with 42 Intra accounts through OAuth 2.0, then updates server roles after a successful verification.

Built with **Node.js**, **discord.js**, **Express**, and the **42 API**.

## How it works

```text
Discord /verify or button click
            │
            ▼
     42 OAuth consent page
            │
            ▼
 Express callback validates state
            │
            ▼
 Exchange code → fetch 42 profile
            │
            ▼
 Add member role → remove newcomer role → send confirmation DM
```

When the bot starts, it registers a `/verify` slash command in the configured Discord server and posts a verification button in the configured channel. Both paths open a private 42 OAuth link for the user.

## Features

- Discord `/verify` slash command
- Channel button that starts verification without exposing the link publicly
- 42 OAuth 2.0 authorization-code flow
- Callback-state validation that ties an OAuth response to the requesting Discord user
- Authenticated profile request to `https://api.intra.42.fr/v2/me`
- Automatic role update and direct-message confirmation after verification
- HTTP health endpoint at `/` for hosting-provider or uptime checks

## Requirements

- Node.js 18 or later (Node.js 20+ recommended)
- npm
- A Discord application and bot
- A 42 OAuth application
- A publicly reachable HTTPS URL for the OAuth callback in production

The Discord bot needs permission to send messages and manage roles. Its highest role must be above both the member role it adds and the newcomer role it removes.

## Setup

```bash
git clone https://github.com/Jaaf4r/42-Verification-Bot.git
cd 42-Verification-Bot
npm install
```

Create a local `.env` file. Do not commit this file or any credentials.

```dotenv
# Discord
DISCORD_TOKEN=
APP_ID=
GUILD_ID=
CHANNEL_ID=
MEMBER_ROLE_ID=
NEWCOMER_ROLE_ID=

# 42 OAuth application
CLIENT_ID=
CLIENT_SECRET=
REDIRECT_URI=http://localhost:3000/callback

# Optional; defaults to 3000
PORT=3000
```

Load the variables and start the bot:

```bash
set -a
source .env
set +a
npm start
```

> The application reads configuration from environment variables. It does not automatically load `.env`, so use the commands above locally or configure variables in your deployment platform.

## Configure Discord

1. Create a Discord application and bot in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Copy the application ID to `APP_ID` and the bot token to `DISCORD_TOKEN`.
3. Invite the bot to the target server with the `bot` and `applications.commands` scopes.
4. Set `GUILD_ID` to that server, `CHANNEL_ID` to the channel where the verification button should appear, and configure the two role IDs.
5. Give the bot **Manage Roles** permission and place its role above the roles it manages.

The `/verify` command is registered as a guild command on startup, so updates are available in the configured server without the delay associated with global command registration.

## Configure 42 OAuth

1. Create an OAuth application in the 42 Intra.
2. Set `CLIENT_ID` and `CLIENT_SECRET` from that application.
3. Register the exact callback URL used by `REDIRECT_URI`, for example `https://your-domain.example/callback`.
4. Use the same value for `REDIRECT_URI` in the hosting environment.

The callback URL must match the value registered with 42 exactly.

## Environment reference

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token used to connect to Discord. |
| `APP_ID` | Discord application ID used to register `/verify`. |
| `GUILD_ID` | Discord server where the command and role update apply. |
| `CHANNEL_ID` | Channel where the verification button is posted. |
| `MEMBER_ROLE_ID` | Role assigned after successful verification. |
| `NEWCOMER_ROLE_ID` | Role removed after successful verification, if present. |
| `CLIENT_ID` | 42 OAuth application client ID. |
| `CLIENT_SECRET` | 42 OAuth application client secret. |
| `REDIRECT_URI` | Registered 42 OAuth callback URL. |
| `PORT` | HTTP port; defaults to `3000`. |

## Verification policy

The current implementation verifies that a user successfully authorizes with a 42 account, retrieves that account's profile, and then updates the Discord roles. It does **not** currently enforce a specific active-student status: the status-policy hook is marked as a TODO in [`main.js`](main.js).

Before using this as an active-student-only gate, add and test the policy you need (for example, rejecting alumni or inactive accounts) before the role-update step.

## Deployment notes

- Configure every environment variable in your host's secret/environment dashboard instead of committing them.
- Set `REDIRECT_URI` to the public `/callback` route of the deployed service.
- The server binds to `0.0.0.0` and provides `GET /`, which is suitable for a basic health check.
- Verification state is stored in memory. Restarting or redeploying the service invalidates any verification flow already in progress.

## Project structure

```text
.
├── main.js       # Discord interactions, 42 OAuth callback, and role updates
├── package.json  # Runtime dependencies and npm scripts
└── README.md
```

## Security

- Keep bot tokens, client secrets, and OAuth callback URLs out of commits and logs.
- Use HTTPS for production callbacks.
- Treat the verification state as short-lived and single-use; the application removes it after the callback is handled.
- Review Discord role hierarchy carefully: a bot cannot manage roles at or above its own role.
