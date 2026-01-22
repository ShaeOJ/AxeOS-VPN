# AxeOS VPN Monitor - Development Notes

## Project Overview
Vault-Tec Mining Operations Division - BitAxe Monitoring System for managing multiple BitAxe ASIC miners.

## Tech Stack
- **Desktop**: Electron + React + TypeScript + Tailwind CSS
- **Database**: better-sqlite3
- **State Management**: Zustand
- **Charts**: Recharts
- **Build**: electron-vite + electron-builder

## Recent Changes (v1.5.2)

### Device Card Enhancements
Added per-device statistics to miner cards in both desktop and web UI:

**Amps Display:**
- Shows calculated amperage next to power consumption
- Uses reported `current` field from AxeOS API when available
- Falls back to calculated value (power / voltage) if not reported
- Displayed in both device cards and detail views

**Solo Block Chance:**
- Per-device block probability based on individual hashrate
- Uses Bitcoin network difficulty to calculate:
  - Expected time to find a block
  - Daily odds percentage
- Shows on device cards (compact) and detail modal (expanded)
- Network stats fetched every 5 minutes

**Files modified:**
- `components/DeviceCard.tsx` - Added amps display, block chance calculation
- `pages/DashboardPage.tsx` - Fetches network stats, passes to DeviceCard
- `main/server/index.ts` - Added amps and block chance to web UI cards and detail modal

**Block Chance Formula:**
```typescript
networkHashrateHs = (difficulty * 2^32) / 600
probPerBlock = deviceHashrateHs / networkHashrateHs
daysToBlock = 1 / (probPerBlock * 144)  // 144 blocks per day
dailyOdds = 1 - (1 - probPerBlock)^144
```

---

## Previous Changes (v1.5.0)

### Web UI Theme Support
Extended the 6 Fallout-inspired themes to the web interface:
- All desktop themes now available in web UI
- Improved mobile UX for theme selection
- Fixed z-index stacking issues with theme dropdown
- Theme persistence across sessions

### Bug Fixes & Improvements
- **Logo Loading**: Fixed logo not appearing in web UI production builds and packaged app
- **Modal Fixes**: Resolved modal being cut off by header
- **Dropdown UX**: Fixed backdrop blocking theme dropdown clicks
- **Database**: Fixed migration order for group_id index
- **IPC Handlers**: Fixed missing get-app-version handler that prevented app launch
- **Profitability Calculator**: Clarified that calculations use Bitcoin network stats

---

## Previous Changes (v1.3.0)

### Theme Selector Feature
Added 6 Fallout-inspired color themes with live switching:

| Theme | Description | Primary Colors |
|-------|-------------|----------------|
| Vault-Tec (default) | Classic yellow/green | #FFB000, #00FF41 |
| Nuka-Cola | Red/pink tones | #FF3131, #FF6B6B |
| Brotherhood of Steel | Blue/silver military | #4A90D9, #87CEEB |
| Institute | Clean white/teal (light) | #00A0A0, #00CED1 |
| NCR | Desert tan/brown | #C4A35A, #8B7355 |
| Enclave | Dark patriotic | #B22222, #FFD700 |

**Files modified:**
- `globals.css` - CSS custom property overrides per theme
- `SettingsPage.tsx` - Theme selector UI with preview cards
- `Layout.tsx` - Loads saved theme on startup

### Device Groups Feature
Organize miners into custom groups with color coding:

**Database schema:**
```sql
CREATE TABLE device_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#FFB000',
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

ALTER TABLE devices ADD COLUMN group_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL;
```

**Files created:**
- `database/groups.ts` - CRUD operations for groups

**Files modified:**
- `database/index.ts` - Added device_groups table, migration
- `database/devices.ts` - Added group_id field, setDeviceGroup()
- `main/index.ts` - IPC handlers for group operations
- `preload/index.ts` - Group API methods and types
- `stores/deviceStore.ts` - Groups state and actions
- `components/GroupManager.tsx` - Modal for managing groups
- `components/DeviceCard.tsx` - Group selector dropdown
- `pages/DashboardPage.tsx` - Collapsible grouped device display

### Solo Mining Statistics
Added "Block Chance" display showing:
- Time to find a block based on current hashrate
- Daily/weekly/monthly/yearly block probability
- Network hashrate comparison

## Architecture Notes

### IPC Communication Pattern
```
Renderer -> Preload (electronAPI) -> Main (ipcMain.handle) -> Database/Service
```

### Device Polling
- `axeos-poller.ts` polls each device at configurable intervals
- Metrics stored in SQLite with timestamp
- Real-time updates sent to renderer via `device-metrics` event

### Theme System
- CSS custom properties defined in `:root`
- Theme classes override properties (`.theme-nuka-cola`, etc.)
- Theme saved to settings table, applied to `document.documentElement`

### Group System
- Groups stored in `device_groups` table
- Devices reference groups via `group_id` foreign key
- ON DELETE SET NULL ensures devices become ungrouped when group deleted

## Common Commands
```bash
# Development
cd apps/desktop
npm run dev

# Build for production
npm run build
npm run dist:win  # Windows installer

# Type checking
npm run typecheck
```

## File Structure
```
apps/desktop/
├── src/
│   ├── main/           # Electron main process
│   │   ├── database/   # SQLite operations
│   │   ├── server.ts   # Express web server
│   │   └── index.ts    # Main entry, IPC handlers
│   ├── preload/        # Context bridge
│   └── renderer/       # React UI
│       ├── components/
│       ├── pages/
│       ├── stores/     # Zustand stores
│       └── styles/
└── resources/          # App icons
```
