# Headless AxeOS VPN Monitor on Orange Pi / Raspberry Pi (ARM64)

Run the monitor as an always-on service on a single-board computer with **no
monitor attached**, and use it entirely through its **web dashboard** (over LAN
or the built-in Cloudflare tunnel).

Requires a **64-bit (aarch64/arm64)** board and OS. Most current Orange Pi
boards (5 / 5 Plus / 3 / 4 / Zero 2W / Zero 3) and Raspberry Pi 3/4/5 qualify.
32-bit boards are **not** supported — Electron dropped ARM32 Linux long ago.

Confirm 64-bit:

```bash
uname -m        # must print: aarch64
```

---

## Why build on the Pi

The app uses **better-sqlite3**, a native module that must be compiled for the
exact CPU arch + Electron ABI (Electron 28.3.3 = ABI v119). Cross-compiling an
arm64 package on an x64 CI machine ships an x64 `.node` inside an "arm64"
package that crashes on first DB access. Building **on the board** makes the
native module match automatically. This is the reliable path.

## 1. Build the arm64 package (on the board)

```bash
sudo apt update
sudo apt install -y build-essential python3 git

# clone + install (repo uses pnpm 8)
npm install -g pnpm@8
git clone https://github.com/ShaeOJ/AxeOS-VPN.git
cd AxeOS-VPN
pnpm install --shamefully-hoist

# compile the native module for Electron, build, then package
cd apps/desktop
npx @electron/rebuild -f -w better-sqlite3 -v 28.3.3
pnpm --filter @axeos-vpn/shared-types build
pnpm --filter @axeos-vpn/shared-utils build
pnpm run build
pnpm run dist:linux        # -> release/AxeOS-VPN-Monitor-<ver>-Linux-arm64.deb
```

## 2. Install + the headless runtime deps

```bash
sudo apt install -y xvfb                     # virtual display for Electron
sudo dpkg -i release/AxeOS-VPN-Monitor-*-Linux-arm64.deb
sudo apt install -f -y                       # pull any missing libs
```

## 3. Install the service

```bash
# edit User=/Group= in the unit first if your login isn't "orangepi"
sudo cp deploy/axeos-vpn-headless.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now axeos-vpn-headless

systemctl status axeos-vpn-headless
journalctl -u axeos-vpn-headless -f          # logs print the dashboard URL
```

## 4. First-run setup (from any browser on the LAN)

Open `http://<board-ip>:45678`. On first launch the web UI prompts you to set
an admin password (there is no default). Then add miners by IP / run discovery.

- Default web-server port is **45678** (change it in Settings if needed).
- For remote access, enable the **Cloudflare tunnel** in Settings — no port
  forwarding required.

---

## Notes / troubleshooting

- **Headless flag:** the service sets `HEADLESS=1` and passes `--headless`, so
  no window or tray is created — only the Express web server + device poller.
- **Data location:** SQLite DB + settings live under the service user's home:
  `~/.config/AxeOS VPN Monitor/`. Back this up to keep devices/history.
- **Metrics retention** defaults to 14 days (Settings → Data & Storage). On a
  small board keep this modest so the SD/eMMC doesn't fill.
- **`xvfb-run: command not found`** → `sudo apt install -y xvfb`.
- **Electron exits immediately / sandbox error** → the unit already passes
  `--no-sandbox`; make sure it's running as a normal user, not root.
- **AppImage instead of .deb?** Works too, but needs FUSE
  (`sudo apt install -y libfuse2`) or run with `--appimage-extract-and-run`.
  The .deb is simpler for a systemd service.
