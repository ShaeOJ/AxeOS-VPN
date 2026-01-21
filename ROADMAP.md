# ☢️ VAULT-TEC DEVELOPMENT ROADMAP ☢️
### AxeOS VPN Monitor - Future Enhancement Proposals

---

## 📜 DEVELOPMENT LOG

| Date | Feature | Status |
|------|---------|--------|
| 2026-01-21 | **v1.2.0 STABLE RELEASE** | ✅ Released |
| | - Auto-Discovery: Scan network for BitAxe devices | |
| | - System Tray Mode: Minimize to tray, quick stats | |
| | - Alert System: Offline, temperature, hashrate drop alerts | |
| | - Device Control: Remote restart with confirmation | |
| | - Web UI feature parity with desktop app | |
| | - Multi-firmware pool difficulty support | |
| | - Historical metrics display fix | |
| 2026-01-20 | Web UI Feature Parity | ✅ Implemented |
| | - Profitability calculator widget added to web UI | |
| | - Device management (add/edit/delete) in web UI | |
| | - API endpoints for device CRUD operations | |
| | - Network stats API for profitability calculation | |
| 2026-01-20 | v1.2.0-beta.12 | 🔧 In Development |
| | - Fixed tunnel start error (getServerPort export) | |
| | - Fixed NaN in profitability (btcPrice.price) | |
| | - Fixed dropdown overflow with React portals | |
| | - Fixed IPC handler function name mismatches | |
| | - Added Reset App Data in settings | |
| | - Updated application icon | |
| 2026-01-19 | v1.1.2 Stable Release | ✅ Released |
| 2026-01-19 | Multi-Coin Crypto Ticker | ✅ Implemented |
| | - BTC, BCH, BSV, DGB, PPC, NMC support | |
| | - Dropdown coin selector | |
| | - 24h change indicators | |
| | - Saved preferences | |
| 2026-01-19 | Mining Profitability Calculator | ✅ Implemented |
| | - Daily/weekly/monthly/yearly earnings | |
| | - Power cost calculations | |
| | - Net profit display | |
| | - Network difficulty & block height | |
| | - Configurable electricity rate | |

---

## 🎨 THEMES & CUSTOMIZATION

- [ ] **Theme Selector** - Switch between visual themes
  - [ ] Classic Vault-Tec (current green/gold)
  - [ ] Nuka-Cola Red
  - [ ] Brotherhood of Steel (blue/silver)
  - [ ] Institute (clean white/blue)
  - [ ] NCR (desert tan/brown)
  - [ ] Enclave (dark/patriotic)
- [ ] **Custom Accent Colors** - User-defined color picker
- [ ] **Reduced Motion Mode** - Disable glitch/scan effects for accessibility
- [ ] **Compact Mode** - Denser UI for more devices on screen

---

## 📊 LIVE TICKERS & MARKET DATA

- [x] **Crypto Price Ticker** - Real-time price display ✅ IMPLEMENTED
  - [x] Multi-coin support (BTC, BCH, BSV, DGB, PPC, NMC)
  - [x] Price change indicators (24h)
  - [x] Coin selector dropdown
  - [x] Saved preference persistence
  - [x] Multiple fiat currency support (USD, EUR, GBP, AUD, CAD, JPY, CHF, CNY) ✅ IMPLEMENTED
  - [x] Mini chart sparkline (7-day price history) ✅ IMPLEMENTED
- [x] **Mining Profitability Calculator** ✅ IMPLEMENTED
  - [x] Estimate earnings based on hashrate
  - [x] Power cost calculations
  - [x] Net profit display
  - [x] Configurable electricity rate
- [x] **Network Difficulty Tracker** ✅ IMPLEMENTED (in profitability panel)
- [x] **Block Height Display** ✅ IMPLEMENTED (in profitability panel)
- [ ] **Mempool Status** - Transaction fee estimates
- [ ] **Portfolio Value** - Track accumulated sats value

---

## 🎮 DEVICE CONTROL

- [x] **On-Demand Device Control** - Send commands to BitAxe units ✅ IMPLEMENTED
  - [x] Restart device
  - [x] Adjust fan speed (API ready)
  - [x] Change frequency/voltage (API ready)
  - [x] Switch mining pools (API ready)
- [ ] **Batch Operations** - Control multiple devices at once
- [ ] **Scheduling** - Set operating schedules (e.g., mine during off-peak hours)
- [ ] **Power Profiles** - Save/load device configurations
  - [ ] "Eco Mode" - Lower power, lower heat
  - [ ] "Performance Mode" - Maximum hashrate
  - [ ] "Balanced" - Optimal efficiency

---

## 🔔 ALERTS & NOTIFICATIONS

- [x] **Alert System** - Configurable notifications ✅ IMPLEMENTED
  - [x] Device offline alerts
  - [x] Temperature threshold warnings
  - [x] Hashrate drop alerts
  - [ ] Power consumption alerts
- [ ] **Notification Channels**
  - [x] Desktop notifications (system tray) ✅ IMPLEMENTED
  - [ ] Email alerts
  - [ ] Discord webhook
  - [ ] Telegram bot
  - [ ] Push notifications (mobile)
- [ ] **Alert History** - Log of past alerts

---

## 📈 ADVANCED ANALYTICS

- [ ] **Efficiency Trends** - J/TH over time graphs
- [ ] **Comparative Analysis** - Compare device performance
- [ ] **Uptime Statistics** - Device reliability tracking
- [ ] **Heat Maps** - Visual temperature patterns
- [ ] **Export Data** - CSV/JSON export for analysis
- [ ] **Daily/Weekly/Monthly Reports** - Automated summaries
- [ ] **Pool Statistics** - Shares, rejected rates, luck

---

## 🌐 NETWORK & CONNECTIVITY

- [x] **Auto-Discovery** - Scan network for BitAxe devices ✅ IMPLEMENTED
- [ ] **Device Groups** - Organize devices by location/purpose
- [ ] **Multi-Network Support** - Monitor devices across different networks
- [ ] **VPN Integration** - Built-in WireGuard/OpenVPN client
- [ ] **Wake-on-LAN** - Power on devices remotely

---

## 📱 MOBILE APP ENHANCEMENTS

- [ ] **Push Notifications** - Real-time alerts on phone
- [ ] **Widget Support** - Home screen stats widget
- [ ] **Biometric Auth** - Face ID / Fingerprint login
- [ ] **Offline Mode** - Cache last known data
- [ ] **Dark/Light Theme Toggle**

---

## 🖥️ DESKTOP APP ENHANCEMENTS

- [x] **System Tray Mode** - Minimize to tray with quick stats ✅ IMPLEMENTED
- [ ] **Startup Launch** - Option to start with Windows/macOS
- [ ] **Keyboard Shortcuts** - Quick navigation
- [ ] **Multi-Window Support** - Detach charts/devices to separate windows
- [ ] **Mini Mode** - Small floating widget with key stats

---

## 🔐 SECURITY & AUTH

- [ ] **Two-Factor Authentication (2FA)** - TOTP support
- [ ] **Session Management** - View/revoke active sessions
- [ ] **API Keys** - Generate keys for external integrations
- [ ] **Audit Log** - Track all actions and changes
- [ ] **Role-Based Access** - Admin/viewer permissions

---

## 🔌 INTEGRATIONS

- [ ] **Home Assistant** - MQTT integration
- [ ] **Grafana** - Prometheus metrics export
- [ ] **IFTTT/Zapier** - Automation triggers
- [ ] **Mining Pool APIs** - Direct pool stats integration
- [ ] **Webhooks** - Custom event callbacks

---

## 🎯 QUALITY OF LIFE

- [ ] **Onboarding Wizard** - First-time setup guide
- [ ] **Device Nicknames & Icons** - Custom identifiers
- [ ] **Notes/Tags** - Add notes to devices
- [ ] **Search & Filter** - Find devices quickly
- [ ] **Drag & Drop Reordering** - Arrange dashboard layout
- [ ] **Backup/Restore Settings** - Export/import configuration

---

## 🐛 TECHNICAL IMPROVEMENTS

- [ ] **Database Optimization** - Metrics retention policies
- [ ] **Performance Mode** - Reduced polling for large deployments
- [ ] **Error Recovery** - Better handling of connection issues
- [ ] **Logging System** - Debug logs for troubleshooting
- [ ] **Auto-Updates** - In-app update mechanism

---

## 💡 IDEAS & SUGGESTIONS

*Add your feature ideas here!*

-
-
-

---

## 📋 PRIORITY LEGEND

| Priority | Description |
|----------|-------------|
| 🔴 High | Core functionality, user-requested |
| 🟡 Medium | Nice to have, planned |
| 🟢 Low | Future consideration |
| ⚪ Idea | Needs evaluation |

---

*"The future is in your hands, Vault Dweller!"*

**Last Updated:** 2026-01-20
