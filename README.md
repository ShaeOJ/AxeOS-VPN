# AxeOS-VPN

Secure remote monitoring solution for Axe OS cryptocurrency mining rigs. Monitor hashrate, temperature, and power metrics from anywhere via desktop (Windows/Mac/Linux) and mobile (iOS/Android) apps.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUD SERVER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Auth Service│  │Relay Server │  │ Metrics DB  │              │
│  │  (JWT/API)  │  │ (WebSocket) │  │ (TimeSeries)│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│Desktop Client│     │Mobile Client │     │AxeOS Agent   │
│  (Electron)  │     │(React Native)│     │  (Node.js)   │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Project Structure

```
axeos-vpn/
├── apps/
│   ├── desktop/          # Electron app (Windows/Mac/Linux)
│   ├── mobile/           # React Native app (iOS/Android)
│   ├── backend/          # Relay server + REST API
│   └── agent/            # Runs on mining rig
├── packages/
│   ├── shared-types/     # TypeScript interfaces
│   ├── shared-utils/     # Common utilities
│   └── tunnel-client/    # WebSocket client library
└── tools/
    └── docker/           # Docker configs
```

## Prerequisites

- Node.js 18+
- PNPM 8+
- PostgreSQL 15+
- Docker (optional, for development)

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up the database

Copy the example environment file and configure your database:

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env` with your PostgreSQL connection string.

### 3. Initialize the database

```bash
cd apps/backend
pnpm db:generate
pnpm db:push
```

### 4. Start the development servers

From the root directory:

```bash
# Start the backend (REST API + WebSocket server)
pnpm --filter @axeos-vpn/backend dev

# In another terminal, start the desktop app
pnpm --filter @axeos-vpn/desktop dev

# In another terminal, start the mobile app
pnpm --filter @axeos-vpn/mobile start
```

### 5. Set up an agent (on your mining rig)

```bash
# Run the setup wizard
pnpm --filter @axeos-vpn/agent setup

# Start the agent
pnpm --filter @axeos-vpn/agent dev
```

## Development

### Building packages

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter @axeos-vpn/shared-types build
```

### Running tests

```bash
pnpm test
```

### Type checking

```bash
pnpm typecheck
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login, get tokens |
| POST | `/api/v1/auth/refresh` | Refresh access token |
| GET | `/api/v1/devices` | List user's devices |
| POST | `/api/v1/devices/pair` | Get pairing code |
| POST | `/api/v1/devices/verify` | Verify pairing code |
| GET | `/api/v1/metrics/:deviceId` | Historical metrics |
| WSS | `/ws` | WebSocket tunnel |

## WebSocket Protocol

The WebSocket relay server uses a JSON-based protocol. See `packages/shared-types/src/protocol.ts` for message type definitions.

### Message Types

- `authenticate` - Client/agent authentication
- `subscribe` / `unsubscribe` - Device subscription management
- `metrics_update` - Real-time metrics from agent
- `device_status` - Online/offline notifications
- `heartbeat` / `heartbeat_ack` - Keep-alive messages

## License

MIT
