```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                    RE-TEK INC INDUSTRIES PRESENTS                            ║
║                                                                              ║
║              ░█████╗░██╗░░██╗███████╗░█████╗░░██████╗                        ║
║              ██╔══██╗╚██╗██╔╝██╔════╝██╔══██╗██╔════╝                        ║
║              ███████║░╚███╔╝░█████╗░░██║░░██║╚█████╗░                        ║
║              ██╔══██║░██╔██╗░██╔══╝░░██║░░██║░╚═══██╗                        ║
║              ██║░░██║██╔╝╚██╗███████╗╚█████╔╝██████╔╝                        ║
║              ╚═╝░░╚═╝╚═╝░░╚═╝╚══════╝░╚════╝░╚═════╝░                        ║
║                                                                              ║
║                        VPN MONITOR USER MANUAL                               ║
║                           Document R-TEK-2077-M                              ║
║                                                                              ║
║                    CLASSIFICATION: OPERATOR EYES ONLY                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

# 📖 RE-TEK INC OPERATOR'S MANUAL

> **Security Clearance Required: LEVEL 3 - MAINTENANCE TECHNICIAN**

Congratulations on your assignment to the **Re-Tek Inc Mining Operations Division**! This manual will guide you through the operation of the AxeOS VPN Monitor system. Please read carefully - your performance metrics are being tracked.

---

## 📋 TABLE OF CONTENTS

```
[DOCUMENT NAVIGATION]
├── 1. SYSTEM OVERVIEW ................ Section 1
├── 2. INSTALLATION PROTOCOL .......... Section 2
├── 3. DEVICE MANAGEMENT .............. Section 3
├── 4. UNDERSTANDING METRICS .......... Section 4
├── 5. REMOTE ACCESS CONFIGURATION .... Section 5
├── 6. WEB DASHBOARD OPERATION ........ Section 6
├── 7. MOBILE COMPANION APP ........... Section 7
├── 8. TROUBLESHOOTING ................ Section 8
└── APPENDIX: ERROR CODES ............. Section 9
```

---

## 📟 SECTION 1: SYSTEM OVERVIEW

### 1.1 What is AxeOS VPN Monitor?

AxeOS VPN Monitor is a **comprehensive monitoring solution** for your Bitcoin mining hardware. Think of it as a Pip-Boy for your mining rigs - always showing you the vital stats you need to keep operations running smoothly.

### 1.2 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌──────────────┐      ┌──────────────┐                    │
│   │  Desktop App │◄────►│ Mining Rigs  │                    │
│   │  (Command    │      │ (BitAxe,     │                    │
│   │   Center)    │      │  NerdAxe,    │                    │
│   └──────┬───────┘      │  ClusterAxe) │                    │
│          │              └──────────────┘                    │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────┐      ┌──────────────┐                    │
│   │ Web Dashboard│      │  Mobile App  │                    │
│   │ (Remote      │      │  (Pip-Boy    │                    │
│   │  Access)     │      │   Edition)   │                    │
│   └──────────────┘      └──────────────┘                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 SECTION 2: INSTALLATION PROTOCOL

### 2.1 Pre-Installation Checklist

Before proceeding, ensure you have:

- [ ] **Node.js 18+** installed on your terminal
- [ ] **PNPM 8+** package manager
- [ ] At least one **BitAxe-compatible device** on your local network
- [ ] A cup of **Nuka-Cola** (optional but recommended)

### 2.2 Installation Steps

```bash
# STEP 1: Acquire the source code
git clone https://github.com/YOUR_USERNAME/AxeOS-VPN.git

# STEP 2: Enter the directory
cd AxeOS-VPN

# STEP 3: Initialize dependencies
pnpm install

# STEP 4: Launch the application
pnpm dev
```

### 2.3 First Launch

Upon first launch, the desktop application will:
1. Open automatically in your default window manager
2. Display an empty device list
3. Await your command to add mining devices

```
╔═══════════════════════════════════════════╗
║      FIRST LAUNCH SUCCESSFUL              ║
║                                           ║
║  Status: AWAITING DEVICE REGISTRATION     ║
║  Action: Click "Add Device" to begin      ║
╚═══════════════════════════════════════════╝
```

---

## ⛏️ SECTION 3: DEVICE MANAGEMENT

### 3.1 Adding a New Device

1. Click the **"+ Add Device"** button (looks like a mining rig with a plus sign)
2. Enter the device information:
   - **Name**: A friendly identifier (e.g., "Reactor Room Miner #1")
   - **IP Address**: The local IP of your mining device (e.g., 192.168.1.100)
3. Click **"Test Connection"** to verify
4. Click **"Add"** to save

### 3.2 Device Status Indicators

```
┌────────────────────────────────────────────────────┐
│                STATUS LEGEND                        │
├────────────────────────────────────────────────────┤
│  🟢 ONLINE   - Device responding, metrics flowing  │
│  🔴 OFFLINE  - No response from device             │
│  🟡 WARNING  - Device online but needs attention   │
└────────────────────────────────────────────────────┘
```

### 3.3 Removing a Device

1. Click on the device card to open details
2. Scroll to the bottom
3. Click **"Remove Device"** (the red button - handle with care!)
4. Confirm your decision

---

## 📊 SECTION 4: UNDERSTANDING METRICS

### 4.1 Primary Metrics Display

| Metric | Unit | Description | Optimal Range |
|--------|------|-------------|---------------|
| **Hashrate** | TH/s or GH/s | Mining computation speed | Device-specific |
| **Temperature** | °C | ASIC chip temperature | 40-70°C |
| **Power** | Watts | Electrical consumption | Device-specific |
| **Efficiency** | J/TH | Joules per Terahash | Lower is better |

### 4.2 Temperature Status Colors

```
TEMPERATURE MONITORING SYSTEM
═════════════════════════════

  ≤70°C     🟢 OPTIMAL     - Operating within safe parameters
  71-80°C   🟠 WARM        - Consider improving cooling
  >80°C     🔴 CRITICAL    - IMMEDIATE ACTION REQUIRED
```

### 4.3 Efficiency Explained

**J/TH (Joules per Terahash)** measures how efficiently your miner converts electricity into hashes.

```
EFFICIENCY FORMULA
══════════════════

  Efficiency = Power (W) ÷ Hashrate (TH/s)

  Example: 150W ÷ 5 TH/s = 30 J/TH

  Lower numbers = Better efficiency = More profit
```

### 4.4 Best Difficulty

This shows your miner's best share difficulty - essentially your "high score" for the mining session. Higher is better and represents your best work submitted to the pool.

---

## 🌐 SECTION 5: REMOTE ACCESS CONFIGURATION

### 5.1 Enabling Remote Access

Remote access uses **Cloudflare Tunnel** to securely expose your dashboard to the internet without port forwarding.

**To Enable:**
1. Navigate to **Settings** (gear icon)
2. Find the **Remote Access** section
3. Click **"Enable Remote Access"**
4. Wait for the secure tunnel to establish

### 5.2 Accessing Remotely

Once enabled, you'll see:
- A **URL** (e.g., `https://random-words.trycloudflare.com`)
- A **QR Code** for easy mobile access

```
╔═══════════════════════════════════════════════════════════╗
║                   REMOTE ACCESS ACTIVE                     ║
╠═══════════════════════════════════════════════════════════╣
║                                                            ║
║   URL: https://re-tek-monitor.trycloudflare.com            ║
║                                                            ║
║   ▄▄▄▄▄▄▄ ▄▄▄▄▄ ▄▄▄▄▄▄▄    Scan this QR code with        ║
║   █ ▄▄▄ █ ▀█ ▄ █ ▄▄▄ █    your Pip-Boy (phone) to        ║
║   █ ███ █ ▄▀ ▀ █ ███ █    access the dashboard           ║
║   █▄▄▄▄▄█ █ ▄▀█ █▄▄▄▄▄█    remotely.                      ║
║                                                            ║
╚═══════════════════════════════════════════════════════════╝
```

### 5.3 Security Note

⚠️ **RE-TEK INC SECURITY ADVISORY**

The remote dashboard is protected by password. On first access from a new device, you'll need to set up or enter your password. Keep this password secure - it's like the key to your vault!

---

## 💻 SECTION 6: WEB DASHBOARD OPERATION

### 6.1 Dashboard Layout

```
┌──────────────────────────────────────────────────────────┐
│ [LOGO]                              [FX] [LOGOUT]        │
├──────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ HASHRATE │ │   TEMP   │ │  POWER   │ │EFFICIENCY│    │
│  │  6.5 TH  │ │   62°C   │ │  450 W   │ │ 30 J/TH  │    │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
├──────────────────────────────────────────────────────────┤
│  DEVICES                                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Miner #1        🟢 ONLINE                          │ │
│  │ 192.168.1.100   BitAxe Ultra                       │ │
│  │ Hashrate: 2.1 TH/s  Temp: 58°C  Power: 150W       │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Miner #2        🟢 ONLINE                          │ │
│  │ 192.168.1.101   BitAxe Gamma                       │ │
│  │ Hashrate: 1.8 TH/s  Temp: 55°C  Power: 130W       │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 6.2 FX Toggle (Network Animation)

Click the **FX** button to toggle the animated particle network background:
- **ON**: Beautiful flowing nodes and connections
- **OFF**: Clean, distraction-free interface

Your preference is saved automatically.

### 6.3 Device Details Modal

Click any device card to view detailed information:
- Full metrics history
- Device configuration
- Firmware version
- Pool connection status
- Best difficulty achieved

---

## 📱 SECTION 7: MOBILE COMPANION APP

### 7.1 Features

The mobile app (Pip-Boy Edition) provides:
- Real-time device monitoring
- Push notifications for alerts
- Pull-to-refresh with glitch animation
- Same metrics as desktop

### 7.2 Setting Up

1. Open the mobile app
2. Enter your server URL and credentials
3. View your devices anywhere!

---

## 🔧 SECTION 8: TROUBLESHOOTING

### 8.1 Common Issues

```
╔════════════════════════════════════════════════════════════════╗
║                    TROUBLESHOOTING GUIDE                        ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  PROBLEM: Device shows as "Offline"                            ║
║  ─────────────────────────────────────                         ║
║  → Check device is powered on                                   ║
║  → Verify IP address is correct                                 ║
║  → Ensure device is on same network                             ║
║  → Try pinging the device IP                                    ║
║                                                                 ║
║  PROBLEM: Metrics not updating                                  ║
║  ─────────────────────────────────────                         ║
║  → Refresh the page                                             ║
║  → Check device hasn't crashed                                  ║
║  → Restart the desktop app                                      ║
║                                                                 ║
║  PROBLEM: Remote access not working                             ║
║  ─────────────────────────────────────                         ║
║  → Disable and re-enable remote access                          ║
║  → Check internet connection                                    ║
║  → Try a different browser                                      ║
║                                                                 ║
║  PROBLEM: QR code not scanning                                  ║
║  ─────────────────────────────────────                         ║
║  → Ensure good lighting                                         ║
║  → Clean your camera lens                                       ║
║  → Try copying the URL manually                                 ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
```

### 8.2 Getting Help

If issues persist:
1. Check the GitHub Issues page
2. Submit a bug report with details
3. Join our community (if available)

---

## 📜 APPENDIX: ERROR CODES

```
╔══════════════════════════════════════════════════════════════╗
║                    RE-TEK INC ERROR CODES                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  E-001    Connection refused       Device not responding     ║
║  E-002    Authentication failed    Wrong password            ║
║  E-003    Tunnel error             Cloudflare issue          ║
║  E-004    Parse error              Invalid device response   ║
║  E-005    Timeout                  Device too slow           ║
║                                                               ║
║  If you see code E-111, please exit the vault immediately    ║
║  and report to your Overseer.                                ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 📞 RE-TEK INC SUPPORT HOTLINE

```
╔══════════════════════════════════════════════════════════════╗
║                                                               ║
║   For technical support, please contact:                      ║
║                                                               ║
║   📧 Submit an issue on GitHub                                ║
║   📖 Check the README for updates                             ║
║   🤖 Ask the community for help                               ║
║                                                               ║
║   "Re-Tek Inc: We'll be there... eventually!"                 ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

---

<p align="center">
<strong>RE-TEK INC INDUSTRIES</strong><br>
<em>Document Classification: PUBLIC RELEASE</em><br>
<em>Revision: 1.0.0 | Date: 2077</em><br><br>
"Preparing for the Future, Today!"
</p>
