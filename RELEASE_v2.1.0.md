```
        ▐▓▓▓▌  A · S · I · C   M I N I N G   T E R M I N A L  ▐▓▓▓▌
        ══════════════════════════════════════════════════════════
            a s i c p o o l . s p a c e   ·   FIELD BULLETIN  v2.1.0
                 " Provisioning Tomorrow's Hashrate "
        ══════════════════════════════════════════════════════════
```

# ⚛ AxeOS-VPN Monitor — **v2.1.0 "Big Iron"**

> **NOTICE TO ALL OPERATORS:** The Terminal now commands the heavy machinery.
> Your Antminers on LuxOS answer to the console like the little rigs always have.

A feature release. The headline: **full write-control for Antminer S19 / S21 rigs
running LuxOS** — temperature, tuning profile, fans, and power state, from both
the desktop app *and* the browser command deck. Plus a reliability fix for the
NerdAxe family.

---

## ⛏️ LUXOS COMMAND & CONTROL *(the big one)*

Until now, LuxOS rigs were **look-but-don't-touch** — the app could read an
Antminer S19j Pro but any control button fell through to the BitAxe API the
miner doesn't speak, and errored. That's over. LuxOS speaks the **cgminer API on
port 4028**, and the Terminal now speaks it back — with the proper
logon → command → logoff handshake handled invisibly under the hood.

- **🌡️ Temperature control** — set the board **target temperature** (the
  `/config/temperature` setpoints) straight from the panel. Hot & danger trip
  points shown alongside.
- **🎚️ Tuning profiles** — a live dropdown of every LuxOS profile
  (145 → 645 MHz), each showing its **frequency · hashrate · wattage**, with the
  active one preselected. Apply a new one in one click. ATM auto-tuning is
  detected and flagged (a manual profile applies, but ATM may re-adjust within
  its cap — the panel tells you).
- **🌀 Fan control** — set a manual fan %, or hand it back to the automatic
  temperature-driven curve with **Auto**. Live fan count & RPM displayed.
- **⏻ Power state** — **Wake**, **Sleep** (curtail), and **Reboot Board**,
  right there.
- **🖥️ Both surfaces** — the desktop app gets a dedicated **LuxOS Control**
  panel on the device page; the **web dashboard** gets the same controls in the
  device popup (replacing the BitAxe sliders for LuxOS rigs). Every command
  signature was verified live against LUXminer 2026.8.11 on real hardware.

*S19/S21 owners: open your rig → LuxOS Control → Show Controls. That's it.*

---

## 🩹 RELIABILITY

- **NerdAxe false-offline fixed** — the poller was piling overlapping requests
  onto slow-to-answer NerdAxe Ultra boards, tipping them into a phantom
  "offline" state. It now **skips a poll while one is still in flight** and
  carries a wider offline tolerance, so a healthy-but-busy miner stays green.

---

## 🛠️ UNDER THE HOOD

- New `luxos-control` module: session-safe cgminer transport, temperature /
  profile / fan / curtail / reboot commands, and a parsed control-state summary
  shared by both UIs.
- Device control now **routes by device type** — LuxOS rigs go to the cgminer
  path automatically; existing Restart / Fan / Pool buttons "just work," and a
  requested frequency snaps to the nearest LuxOS profile.
- New `/api/devices/:id/lux/*` endpoints power the web dashboard controls.

---

```
   ⚛  Stay curtailed. Stay hashing. Stay asicpool.space certified.  ⚛
      ── mine to it @ stratum+tcp://asicpool.space:<port> ──
```

*Windows / macOS / Linux installers attached below. Auto-update will offer this
build to existing Operators.*
