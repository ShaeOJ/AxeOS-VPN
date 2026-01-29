# AxeOS VPN Monitor - User Guide

A Vault-Tec Mining Operations Division application for managing and monitoring your BitAxe ASIC miners.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Getting Started](#getting-started)
4. [Adding Devices](#adding-devices)
5. [Monitoring Your Miners](#monitoring-your-miners)
6. [Performance Charts](#performance-charts)
7. [Controlling Devices](#controlling-devices)
8. [Pool Settings](#pool-settings)
9. [Device Groups](#device-groups)
10. [Price Ticker](#price-ticker)
11. [Profitability Calculator](#profitability-calculator)
12. [Remote Access](#remote-access)
13. [QR Code Pairing](#qr-code-pairing)
14. [Cloudflare Tunnel](#cloudflare-tunnel)
15. [Alerts & Notifications](#alerts--notifications)
16. [Settings & Options](#settings--options)
17. [Themes](#themes)
18. [Keyboard Shortcuts](#keyboard-shortcuts)
19. [Tips & Troubleshooting](#tips--troubleshooting)

---

## System Requirements

### Minimum Requirements

| Component | Requirement |
|-----------|-------------|
| **RAM** | 4 GB (8 GB recommended) |
| **Storage** | 200 MB free disk space |
| **Display** | 1280 x 720 resolution minimum |
| **Network** | Local network access to your BitAxe devices |

### Operating System Requirements

| Platform | Minimum Version | Architecture |
|----------|-----------------|--------------|
| **Windows** | Windows 10 or later | 64-bit (x64) |
| **macOS** | macOS 10.15 (Catalina) or later | Intel (x64) or Apple Silicon (arm64) |
| **Linux** | Ubuntu 18.04, Debian 10, or equivalent | 64-bit (x64) |

### Network Requirements

- Your computer must be on the same local network as your BitAxe miners
- Devices communicate over HTTP (typically port 80 for BitAxe API)
- For remote access, an internet connection is required for Cloudflare Tunnel

---

## Installation

### Windows

1. Download the installer: `AxeOS-VPN-Monitor-X.X.X-Setup.exe`
2. Run the installer
3. Choose installation options:
   - Installation directory (default or custom)
   - Create desktop shortcut
   - Create Start Menu shortcut
4. Click **Install**
5. Launch from desktop shortcut or Start Menu

**Note:** Windows may show a SmartScreen warning for unsigned apps. Click "More info" → "Run anyway" to proceed.

### macOS

**For Apple Silicon (M1/M2/M3):**
1. Download: `AxeOS-VPN-Monitor-X.X.X-macOS-arm64.dmg`

**For Intel Macs:**
1. Download: `AxeOS-VPN-Monitor-X.X.X-macOS-x64.dmg`

**Installation:**
1. Open the `.dmg` file
2. Drag **AxeOS VPN Monitor** to the **Applications** folder
3. Eject the disk image
4. Open from Applications (first launch may require right-click → Open due to Gatekeeper)

**Alternative:** ZIP archives are also available if you prefer not to use DMG.

### Linux

**AppImage (Universal):**
1. Download: `AxeOS-VPN-Monitor-X.X.X-Linux.AppImage`
2. Make executable: `chmod +x AxeOS-VPN-Monitor-*.AppImage`
3. Run: `./AxeOS-VPN-Monitor-*.AppImage`

**Debian/Ubuntu (.deb):**
1. Download: `AxeOS-VPN-Monitor-X.X.X-Linux.deb`
2. Install: `sudo dpkg -i AxeOS-VPN-Monitor-*.deb`
3. Or double-click to open with your package manager
4. Launch from application menu

---

## Getting Started

When you first launch AxeOS VPN Monitor, you'll see the main Dashboard. The interface consists of:

- **Sidebar** (left) - Navigation, server status, price ticker, and profitability display
- **Main Area** (center) - Device cards and summary statistics
- **Title Bar** (top) - Window controls

---

## Adding Devices

### Option A: Manual Add

1. Click the **"Add Device"** button on the Dashboard
2. Enter your BitAxe device's IP address (e.g., `192.168.1.100`)
3. Click **"Test Connection"** to verify it's reachable
4. Review the device details shown (hostname, model, current hashrate)
5. Optionally give it a custom name
6. If the device requires authentication, enter credentials
7. Click **"Add Device"**

### Option B: Auto-Discovery

1. Click the **"Discover"** button on the Dashboard
2. The app will scan your local network for BitAxe devices
3. Watch the progress bar as IPs are scanned
4. Check the boxes next to devices you want to add
5. Click **"Add Selected"**

**Note:** Devices already added will show an indicator so you don't add duplicates.

---

## Monitoring Your Miners

### Dashboard Overview

The dashboard displays:

- **Summary Cards** (top) - Aggregate totals for all online miners:
  - Total Hashrate (GH/s or TH/s)
  - Average Temperature
  - Total Power Consumption
  - Overall Efficiency (J/TH)
  - Total Accepted Shares
  - Best Difficulty (with "NEW!" badge for records)
  - Daily Power Cost
  - Expected Block Time & Odds

- **Device Cards** - Individual miner statistics

### Understanding the Metrics

| Metric | Description | Good Values |
|--------|-------------|-------------|
| **Hashrate** | Mining speed | Higher is better |
| **Temperature** | ASIC chip temp | Green (<60°C), Yellow (60-70°C), Red (>70°C) |
| **Power** | Electricity draw (watts) | Depends on model |
| **Efficiency** | Watts per terahash (J/TH) | Lower is better |
| **Best Diff** | Highest difficulty share found | Higher = closer to block |
| **Shares** | Accepted work submissions | Should increase steadily |

### Status Indicators

- **Green dot** = Device is online and responding
- **Red dot** = Device is offline or unreachable
- **"NEW!" badge** = Current best difficulty beats all-time record

---

## Performance Charts

1. Click **"Charts"** in the sidebar
2. Select which devices to compare using the checkboxes
3. Choose a metric from the dropdown:
   - Hashrate
   - Temperature
   - Power
   - Efficiency
4. Select a time range: **1h**, **6h**, **24h**, **7d**, or **30d**
5. Toggle between **Line** and **Area** chart styles
6. Hover over the chart to see exact values at any point

The statistics table below the chart shows:
- Current value
- Average over the period
- Minimum value
- Maximum value

---

## Controlling Devices

1. Click on any device card to open its detail page
2. Find the **Device Control** panel
3. Adjust settings:

| Control | Description | Range |
|---------|-------------|-------|
| **Fan Speed** | Cooling fan percentage | 0-100% |
| **Frequency** | ASIC clock speed (MHz) | Model-dependent |
| **Voltage** | Core voltage (mV) | Model-dependent |

4. Click **"Save"** after each change
5. Wait for the success confirmation message

### Restarting a Device

1. Open the device detail page
2. Click the **"Restart"** button
3. Confirm the action
4. The device will reboot and reconnect automatically

---

## Pool Settings

1. Open a device's detail page
2. Scroll to the **Pool Settings** section
3. Enter your mining pool details:

| Field | Example | Notes |
|-------|---------|-------|
| **Stratum URL** | `public-pool.io` | Do NOT include `stratum+tcp://` |
| **Port** | `21496` | Separate from URL |
| **Worker Name** | `bc1q...` or `username.worker1` | Your wallet address or pool username |
| **Password** | `x` | Usually `x` or leave blank |

4. Click **"Save Pool Settings"**

---

## Device Groups

Organize your miners into color-coded groups:

1. Click the **"Groups"** button on the Dashboard
2. Click **"+ New Group"**
3. Enter a name (e.g., "Garage Miners", "Office Rig")
4. Choose a color from the 10 Fallout-themed presets
5. Click **"Create"**

To assign devices to groups:
- Edit device settings and select the group
- Groups appear as collapsible sections on the Dashboard

---

## Price Ticker

The sidebar displays a live cryptocurrency price ticker.

### Selecting a Coin

Click the coin dropdown (e.g., **BTC**) to choose from:

| Coin | Symbol | Description |
|------|--------|-------------|
| Bitcoin | BTC | The original cryptocurrency |
| Bitcoin Cash | BCH | BTC fork with larger blocks |
| Bitcoin SV | BSV | BCH fork |
| DigiByte | DGB | Multi-algorithm coin |
| Bitcoin II | BC2 | SHA-256 altcoin |
| Bitcoin Silver | BTCS | SHA-256 altcoin |
| Peercoin | PPC | Proof-of-stake pioneer |
| Namecoin | NMC | Decentralized DNS |

### Selecting a Currency

Click the currency dropdown (e.g., **USD**) to choose from:

| Currency | Symbol |
|----------|--------|
| US Dollar | $ |
| Euro | € |
| British Pound | £ |
| Australian Dollar | A$ |
| Canadian Dollar | C$ |
| Japanese Yen | ¥ |
| Swiss Franc | CHF |
| Chinese Yuan | ¥ |

### Ticker Display

- **Price** - Current market price
- **24h Change** - Percentage change with up/down arrow
- **Sparkline** - 7-day mini price chart (green = up, red = down)

Your selections are saved and restored between sessions.

---

## Profitability Calculator

The sidebar shows estimated mining earnings based on your total hashrate.

### Viewing Profitability

1. Click the profitability panel in the sidebar to expand details
2. Use the coin dropdown to switch between:
   - **BTC** - Bitcoin
   - **BCH** - Bitcoin Cash
   - **DGB** - DigiByte (SHA-256 algorithm)
   - **BC2** - Bitcoin II
   - **BTCS** - Bitcoin Silver

### Earnings Display

- **Daily** estimated earnings
- **Weekly** estimated earnings
- **Monthly** estimated earnings
- **Yearly** estimated earnings

### Network Statistics

- Current network difficulty
- Block reward for selected coin
- Your share of network hashrate

### Power Costs

Set your electricity rate in **Settings** to see accurate profit after power costs.

---

## Remote Access

Access your dashboard from any device on your local network.

### Local Network Access

1. Go to **Settings** in the sidebar
2. Find the **Local Network Access** section
3. The app shows all network addresses where you can access the dashboard
4. Click any URL to open it in your browser, or click the copy button
5. A **QR code** is displayed for easy mobile scanning

Example: `http://192.168.1.50:3000`

---

## QR Code Pairing

QR codes make it easy to access your dashboard from mobile devices.

### Local Network QR Code

1. Go to **Settings** > **Local Network Access**
2. Scan the QR code with your phone's camera
3. Your phone will open the dashboard in a browser

### Remote Access QR Code

1. Go to **Settings** > **Remote Access**
2. Enable the Cloudflare Tunnel (see below)
3. Once connected, a QR code appears for the tunnel URL
4. Scan to access your dashboard from anywhere

---

## Cloudflare Tunnel

Access your dashboard securely from anywhere on the internet - no port forwarding required.

### How It Works

Cloudflare Tunnel creates a secure connection from your computer to Cloudflare's network, giving you a public URL like `https://random-words.trycloudflare.com`.

### Enabling Remote Access

1. Go to **Settings** > **Remote Access (Internet)**
2. Click **"Enable Remote Access"**
3. Wait for the tunnel to connect (may take up to 60 seconds on first use)
4. The first time, cloudflared binary will be downloaded automatically
5. Once connected, you'll see:
   - A green "Remote Access Active" indicator
   - Your unique tunnel URL (e.g., `https://happy-fox-123.trycloudflare.com`)
   - A QR code for easy mobile access

### Important Notes

- **Temporary URL** - The tunnel URL changes each time you enable it
- **Password Required** - You must set a password before accessing remotely
- **No Router Config** - Works without port forwarding or firewall changes
- **Secure** - Traffic is encrypted through Cloudflare

### Disconnecting

Click **"Disconnect"** to stop the tunnel when not needed.

---

## Alerts & Notifications

### Configuring Alerts

1. Go to **Settings** > **Alerts & Notifications**
2. Enable/disable the master **Desktop Notifications** toggle
3. Configure individual alerts:

| Alert Type | Description | Default |
|------------|-------------|---------|
| **Device Offline** | Notifies when a miner stops responding | Enabled |
| **High Temperature** | Warns when temp exceeds threshold | 70°C |
| **Hashrate Drop** | Alerts on significant performance decrease | 20% drop |

### Testing Notifications

Click **"Test Notification"** to verify notifications are working on your system.

### False Offline Prevention

Devices must fail **3 consecutive polls** before being marked offline, preventing alerts from temporary network blips.

---

## Settings & Options

### Application Settings

| Setting | Description |
|---------|-------------|
| **Minimize to System Tray** | Closing window minimizes to tray instead of quitting |

### Security Settings

| Setting | Description |
|---------|-------------|
| **Password** | Protects remote access (min 6 characters) |
| **Change Password** | Update your existing password |
| **Reset Password** | Remove password (will need to set a new one) |

### About Section

- **Version** - Current app version
- **Check for Updates** - Query GitHub for newer releases
- **Platform** - Your operating system
- **GitHub Link** - Project repository
- **Buy Me a Coffee** - Support development

### Danger Zone

- **Reset App Data** - Delete all devices, settings, and start fresh

---

## Themes

Choose from 6 Fallout-inspired themes:

| Theme | Colors | Description |
|-------|--------|-------------|
| **Vault-Tec** | Yellow/Green on dark blue | Classic Pip-Boy style |
| **Nuka-Cola** | Red/Pink on dark red | Vintage soda aesthetic |
| **Brotherhood** | Blue/Silver on dark blue | Military tech feel |
| **Institute** | Teal/White on light gray | Clean futuristic look |
| **NCR** | Tan/Brown on dark brown | Desert wasteland vibe |
| **Enclave** | Red/Gold on very dark | Patriotic darkness |

### Changing Theme

1. Go to **Settings** > **Appearance**
2. Click on any theme card
3. Theme applies immediately
4. Your selection is saved

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Refresh data |
| `Ctrl+,` | Open settings |
| `Escape` | Close modal/dialog |

---

## Tips & Troubleshooting

### Device Won't Connect

- Verify the IP address is correct
- Ensure device is powered on and connected to your network
- Check if device requires authentication
- Try accessing the device directly in a browser

### High Temperature Warnings

- Increase fan speed in device controls
- Reduce frequency/voltage for less heat
- Improve physical cooling (airflow, ambient temp)
- Clean dust from heatsinks

### Low Hashrate

- Check device isn't thermal throttling
- Verify pool connection is stable
- Try increasing frequency (watch temperature)
- Restart the device

### Web UI Not Loading

- Check the server is running (green indicator in sidebar)
- Verify you're using the correct URL/port
- Try restarting the server in Settings
- Check firewall isn't blocking the port

### Cloudflare Tunnel Issues

- First startup may take 60+ seconds to download cloudflared
- If tunnel fails, try disabling and re-enabling
- Check your internet connection
- Tunnel URL changes each time - update bookmarks

### Bitmain S9 Notes

- S9 support is in **BETA**
- Displays combined hashrate from all 3 chains
- Shows maximum temperature across chains
- Amps calculated using 120V mains voltage

---

## Support

- **GitHub Issues**: Report bugs and request features
- **Buy Me a Coffee**: Support development at https://buymeacoffee.com/shaeoj

---

*Vault-Tec Mining Operations Division - Building a Better Tomorrow, Underground*
