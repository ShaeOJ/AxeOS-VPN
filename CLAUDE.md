# AxeOS VPN Monitor - Development Notes

## Project Overview
Vault-Tec Mining Operations Division - BitAxe Monitoring System for managing multiple BitAxe ASIC miners.

## Tech Stack
- **Desktop**: Electron + React + TypeScript + Tailwind CSS
- **Database**: better-sqlite3
- **State Management**: Zustand
- **Charts**: Recharts
- **Build**: electron-vite + electron-builder

## Current Version: v1.7.2

---

## Recent Changes (v1.7.2)

### Hashrate Display Improvements
- **Dynamic TH/s Formatting** - Hashrate now displays in TH/s when >= 1000 GH/s (e.g., 21475.90 GH/s → 21.48 TH/s)
- **Desktop Profitability Panel** - Total hashrate in earnings calculator now uses TH/s for large values
- **Web UI Charts** - Chart axes, tooltips, and stats now dynamically switch to TH/s when appropriate
- **PH/s Support** - Added PH/s display for extremely large hashrates (>= 1,000,000 GH/s)

---

## Previous Changes (v1.7.1)

### New Mining Coins Added
- **Bitcoin II (BC2)** - SHA-256 coin with 50 BC2 block reward, ~95 min block time
- **Bitcoin Silver (BTCS)** - SHA-256 coin with 50 BTCS block reward, ~5.3 min block time
- Both coins use WhatToMine API for live difficulty and block reward data

### DGB Calculation Fix
- **Fixed DigiExplorer API** - Old API was returning 404, causing 700-1000x overestimated earnings
- **New WhatToMine API** - Now uses `whattomine.com/coins/113.json` for accurate DGB SHA-256 stats
- **Updated Block Reward** - Changed from 665 DGB to ~274 DGB (current actual value)
- **Realistic Fallback** - Fallback difficulty increased from 1M to 500M

### Coin Ticker & Profitability Tool Fixes
- **Rate Limiting Protection** - Added 60s backoff after CoinGecko 429 errors to prevent API spam
- **Fallback Prices** - Auto-populates fallback prices when cache is empty (prevents "NO ACTIVE MINERS" on startup)
- **API Timeout Handling** - 5 second timeout on profitability API calls to prevent UI hangs
- **Background Fetching** - Returns cached/fallback data immediately while fetching fresh data in background
- **Expanded Coin Support** - Price ticker now includes BSV, PPC, NMC alongside mining coins
- **Dynamic Block Rewards** - WhatToMine API updates block rewards automatically when they change

### Profitability API Sources
| Coin | Difficulty API | Fallback Difficulty |
|------|----------------|---------------------|
| BTC | blockchain.info | ~110T |
| BCH | blockchair.com | ~500B |
| DGB | whattomine.com/coins/113.json | 500M |
| BC2 | whattomine.com/coins/452.json | 38B |
| BTCS | whattomine.com/coins/422.json | 370M |

---

## Previous Changes (v1.7.0)

### Multi-Coin Earnings Calculator
- **Coin Selector** - Switch between BTC, BCH, DGB, BC2, BTCS for profitability calculations
- **Coin-Specific Network Stats** - Fetches difficulty from blockchain.info (BTC), Blockchair (BCH), WhatToMine (DGB, BC2, BTCS)
- **Accurate Block Rewards** - Uses correct block rewards per coin (3.125 BTC/BCH, 274 DGB, 50 BC2/BTCS)
- **Multi-Algo Support** - DGB SHA-256 calculations account for 1-of-5 algo rotation (75s effective block time)
- **CoinGecko Integration** - Live price fetching for all supported coins
- **Settings Persistence** - Selected coin saved and restored between sessions

### UI/UX Improvements
- **Device Card Icons** - Added themed icons to all stat labels (hashrate, temp, power, efficiency, shares, fan)
- **Improved Typography** - Larger font sizes and better visual hierarchy on device cards
- **Web UI Layout** - Changed secondary stats from 5-col to 3-col grid for better readability
- **Adaptive Modals** - Discovery, Groups, and Add Device modals now adapt to window size
- **Mobile Theme Menu** - Fixed theme dropdown getting cut off on mobile browsers

### Bitmain S9 Fixes
- **Amps Calculation** - Fixed to use mains voltage (120V) instead of chain voltage
- **Per-Board Stats** - Display shows "~7.08 A (3 boards)" for multi-board miners

---

## Previous Changes (v1.6.1 BETA)

### UI/UX Visual Enhancements
- **Modal & Card Animations** - Smooth transitions with backdrop fade and content slide
- **Desktop Logo Glow** - Eerie wavy glow effect using theme accent color
- **Responsive Sidebar** - Overflow scrolling for smaller window sizes
- **Staggered Card Animations** - Dashboard cards animate in with delay cascade

### Web UI Enhancements
- **Matrix SHA256 Hash Rain** - Subtle background animation with falling hex characters
- **Theme-Aware Animation** - Matrix rain color matches current theme accent
- **Theme-Aware Charts** - Chart colors now update when switching themes

### Bug Fixes
- **System Tray Icon** - Fixed icon not appearing (dynamic logo file finding for Vite hashes)
- **Web UI Theme Colors** - Fixed background animation not reading accent color from body element

---

## Complete Feature List

### Device Management
| Feature | Description |
|---------|-------------|
| Add Devices | Manually add devices by IP address |
| Auto-Discovery | Scan local network for BitAxe devices |
| QR Code Pairing | Pair devices via QR code |
| Device Groups | Organize miners into color-coded groups |
| Device Detail Page | Full device info and controls |

### Device Monitoring
| Feature | Description |
|---------|-------------|
| Real-time Metrics | Hashrate, temperature, power, efficiency |
| Amps Display | Shows current draw (from API or calculated) |
| Solo Block Chance | Per-device probability to find a block |
| Best Diff Tracking | All-time best difficulty with "NEW!" badge |
| Online/Offline Status | Live status indicators |

### Device Control
| Feature | Description |
|---------|-------------|
| Restart Device | Remote restart via API |
| Set Frequency | Adjust ASIC frequency (MHz) |
| Set Core Voltage | Adjust core voltage (mV) |
| Set Fan Speed | Adjust fan speed (0-100%) |
| Pool Settings | Update stratum URL/user/password |

### Alerts & Notifications
| Feature | Description |
|---------|-------------|
| Device Offline Alerts | Notification when device goes offline |
| Temperature Alerts | Warning when temp exceeds threshold |
| Hashrate Drop Alerts | Alert on significant hashrate decrease |
| Configurable Thresholds | Customize alert triggers |
| Desktop Notifications | Native OS notifications |
| In-App Alerts | Alert display in the UI |

### Financial Tools
| Feature | Description |
|---------|-------------|
| Multi-Coin Price Ticker | Live price display for BTC, BCH, DGB, BC2, BTCS |
| Multi-Coin Profitability | Estimate earnings for BTC, BCH, DGB, BC2, BTCS with coin-specific calculations |
| Network Stats | Difficulty and hashrate for selected coin |

### Analytics & Charts
| Feature | Description |
|---------|-------------|
| Performance Charts | Historical charts for hashrate, temp, power, efficiency |
| Multi-Device Comparison | Compare metrics across multiple devices |
| Time Range Selection | 1h, 6h, 24h, 7d, 30d historical data |
| Statistics Table | Min/max/avg per device for selected metric |
| Chart Type Toggle | Switch between line and area charts |

### Theming & UI
| Feature | Description |
|---------|-------------|
| 6 Fallout Themes | Vault-Tec, Nuka-Cola, Brotherhood, Institute, NCR, Enclave |
| Vault-Tec Style Icons | Themed icons on dashboard cards |
| CRT Scanline Effects | Retro terminal aesthetic |
| Responsive Design | Works on desktop and mobile (web UI) |

### Remote Access
| Feature | Description |
|---------|-------------|
| Web UI | Access dashboard from any browser |
| Web UI Charts | Full interactive charts in web UI (Chart.js) |
| Mobile Support | Responsive web interface |
| Theme Support | All themes available in web UI |
| Password Protection | Secure remote access |

---

## Recent Changes (v1.6.0)

### Web UI Charts
- **Full Chart Support** - Interactive charts in web UI matching desktop functionality
- **Chart.js Integration** - High-performance charting via CDN
- **Metric Types** - Hashrate, Temperature, Power, Efficiency
- **Time Ranges** - 1h, 6h, 24h, 7d, 30d historical data
- **Multi-Device Comparison** - Compare multiple miners on one chart with color-coded lines
- **Real-Time Stats** - Current, Average, Min, Max values displayed
- **Navigation Tabs** - Dashboard/Charts toggle in header

### Bug Fixes
- **Best Diff Parsing** - Fixed parsing of formatted difficulty strings (56.4M, 18.6G, 2.3T, etc.)
- **S9 Frequency Display** - Fixed excessive decimal places in web UI (was showing 473.6466666666667 MHz)
- **Build System** - Resolved electron-vite cache issues causing stale code in production builds

### Updated Assets
- Optimized logo and icon files for smaller bundle size

---

## Previous Changes (v1.5.8)

### Bitmain S9/Antminer Support (BETA)
- **Auto-detection** - Automatically detects BitAxe vs Bitmain miners
- **S9 API Integration** - Fetches data from `/cgi-bin/get_miner_status.cgi`
- **Transformed Metrics** - Maps S9 data to unified display format:
  - Hashrate from all 3 chains combined
  - Max temperature across chains
  - Total power consumption
  - Calculated efficiency (J/TH)
  - Fan RPM
  - Shares and best difficulty
- **BETA Badge** - Bitmain devices show "BETA" tag
- **Database Migration** - New `device_type` column for multi-miner support

---

## Previous Changes (v1.5.7)

### Charts Y-Axis Improvements
- Y-axis now displays unit label (GH/s, °C, W, J/TH)
- Auto-scaling domain for proper data visualization
- Unit label rotated vertically for better readability

---

## Previous Changes (v1.5.6)

### Performance Charts Page
- New **Charts** navigation item between Dashboard and Settings
- Multi-device comparison with color-coded lines
- 4 metric types: Hashrate, Temperature, Power, Efficiency
- 5 time ranges: 1h, 6h, 24h, 7d, 30d
- Toggle between Line and Area chart styles
- Statistics table showing min/max/avg per device
- Auto-selects first 3 online devices on page load

### macOS Compatibility Fix
- Now builds separate DMG/ZIP for Intel (x64) and Apple Silicon (arm64)
- Fixed compatibility with macOS Sequoia 15.x
- Minimum macOS version set to 10.15 (Catalina)

---

## Previous Changes (v1.5.5)

### Support Development
- Added **Buy Me a Coffee** donate button in Settings > About
- Link to https://buymeacoffee.com/shaeoj

---

## Previous Changes (v1.5.4)

### Update Checker
- Added "Check for Updates" button in Settings > About
- Queries GitHub releases API for latest version
- Shows notification when update is available with download link
- Displays "You're running the latest version" when up to date

### Settings Page Reorganization
- Moved About section to the bottom of Settings page
- Added GitHub repo link

---

## Previous Changes (v1.5.3)

### Best Diff Tracking
- Track all-time best difficulty per device
- "NEW!" badge when current session beats all-time record
- Stored in database for persistence

### Theme System Fix
- Updated Tailwind config to use CSS variables
- All colors now change correctly with theme selection
- Fixed hardcoded colors in dashboard cards and components

### Vault-Tec Style Icons
- Added themed icons to dashboard summary cards
- Icons for: Hashrate, Temperature, Power, Efficiency, Shares
- Web UI icons updated to match desktop style

---

## Previous Changes (v1.5.2)

### Device Card Enhancements
**Amps Display:**
- Shows calculated amperage next to power consumption
- Uses reported `current` field from AxeOS API when available
- Falls back to calculated value (power / voltage) if not reported

**Solo Block Chance:**
- Per-device block probability based on individual hashrate
- Uses Bitcoin network difficulty for calculations
- Shows expected time to find a block and daily odds

---

## Architecture Notes

### IPC Communication Pattern
```
Renderer -> Preload (electronAPI) -> Main (ipcMain.handle) -> Database/Service
```

### Key Modules
| Module | Purpose |
|--------|---------|
| `axeos-poller.ts` | Polls devices at configurable intervals |
| `device-control.ts` | Remote control (restart, settings) |
| `device-discovery.ts` | Network scanning for devices |
| `alert-system.ts` | Notifications and alerts |
| `profitability.ts` | Earnings calculations |
| `database/` | SQLite operations |

### Theme System
- CSS custom properties defined in `:root` and theme classes
- Tailwind config references CSS variables for dynamic theming
- Theme saved to settings table, applied to `document.documentElement`

### Database Schema
```sql
-- Devices
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL UNIQUE,
  is_online INTEGER DEFAULT 0,
  last_seen INTEGER,
  created_at INTEGER NOT NULL,
  group_id TEXT REFERENCES device_groups(id) ON DELETE SET NULL,
  all_time_best_diff REAL,
  all_time_best_diff_at INTEGER
);

-- Device Groups
CREATE TABLE device_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#FFB000',
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Metrics History
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
```

---

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
│   ├── main/              # Electron main process
│   │   ├── database/      # SQLite operations
│   │   ├── alert-system.ts
│   │   ├── axeos-poller.ts
│   │   ├── device-control.ts
│   │   ├── device-discovery.ts
│   │   ├── profitability.ts
│   │   ├── server/        # Express web server
│   │   └── index.ts       # Main entry, IPC handlers
│   ├── preload/           # Context bridge
│   └── renderer/          # React UI
│       ├── components/
│       │   ├── DeviceCard.tsx
│       │   ├── DiscoveryModal.tsx
│       │   ├── GroupManager.tsx
│       │   ├── ProfitabilityDisplay.tsx
│       │   └── ...
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── ChartsPage.tsx
│       │   ├── DeviceDetailPage.tsx
│       │   └── SettingsPage.tsx
│       ├── stores/        # Zustand stores
│       └── styles/
└── resources/             # App icons
```

---

## Roadmap (Potential Future Features)
- Export Data (CSV/JSON)
- Batch Operations (multi-device actions)
