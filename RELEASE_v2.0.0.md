```
        ▐▓▓▓▌  A · S · I · C   M I N I N G   T E R M I N A L  ▐▓▓▓▌
        ══════════════════════════════════════════════════════════
             R E - T E K   I N C   ·   FIELD BULLETIN  v2.0.0
                 " Provisioning Tomorrow's Hashrate "
        ══════════════════════════════════════════════════════════
```

# ⚛ AxeOS-VPN Monitor — **v2.0.0 "Command Deck"**

> **NOTICE TO ALL OPERATORS:** The Remote Terminal has been fully re-fabricated.
> Your browser is now a certified mining command deck. Adjust your goggles.

A major release. The **web dashboard** — the thing you open on your phone, tablet,
or the cracked laptop taped to the mining shelf — has been rebuilt from the studs
to mirror the desktop app, tile for tile. Plus real fixes to the desktop, the
tray, and LuxOS rigs.

---

## 📡 THE REMOTE COMMAND DECK *(web dashboard)*

The browser view is no longer the "lite" cousin. It's the whole console.

- **🛰️ Fleet Share-Globe** — a live wireframe Earth spins in the sidebar with your
  miners plotted as nodes; every accepted share fires a **green comet** streaking
  to the pool hub, which **flashes** on impact. Comets grey out on the dark side
  of the world and warm to green as they rotate into view. Purely for morale.
- **🟨 Hero + Cluster layout** — a big **Total Hashrate** hero flanked by a
  Temp / Power / Efficiency / Shares cluster, with Best Diff / Blocks / Power Cost
  / Block Time grouped below. Just like the desktop.
- **📈 Gradient graphs everywhere** — the old progress bars are gone. Every stat
  card now carries a smooth gradient sparkline (bezier-smoothed, no jitter). The
  hero hashrate graph adds **X/Y axes** and a **1H / 6H / 12H** window toggle,
  fed by real bucketed history from the node — not guesswork.
- **🎛️ Per-device Pool editing** — retarget any BitAxe's stratum URL / port /
  worker / password straight from the miner popup. Point the fleet wherever you
  like without touching the firmware UI.
- **🔮 Block odds, decoded** — chance of solving a block **per day / week / year**,
  plus a "best share vs network" breakdown so you know exactly how close the
  luckiest nonce came.
- **🎨 Total theme obedience** — pick a theme and *everything* obeys: cards,
  graphs, buttons, nav tabs, sliders, the miner popup (now a subtly **see-through
  frosted-glass** panel), and the Device Control deck. Six themes, one look.
- **📐 Responsive down to the pocket** — the command-deck format holds and shrinks
  gracefully on tablets; stacks cleanly on phones. Cards stay rectangular; nothing
  spills outside the lines.
- **⚡ Faster on the wire** — the dashboard is now **gzip-compressed and cached**
  (~310KB → ~125KB), so it snaps in over the tunnel instead of crawling.
- 🧹 Retired the background matrix rain (the globe does the ambience now) and
  added a **Donate** hatch for keeping asicpool.space free & zero-fee.

---

## 🖥️ DESKTOP & HARDWARE

- **🩹 Tray icon un-blanked** — the system-tray icon was showing up empty in packaged
  builds. It now loads from an embedded source and always appears.
- **⛏️ LuxOS S19j Pro — fully mapped** — real per-board temps, live fan RPM & %,
  frequency, chip count, and correct model detection, verified against actual
  hardware. Antminers on LuxOS report like grown-ups now.
- **🏷️ Badge discipline** — device-card badges (LUXOS / BETA / SCRYPT) stay put and
  the model name truncates cleanly at any window size — no more crowding.

---

## 🛠️ UNDER THE HOOD

- Charts are **SQL-aggregated** (no more parsing thousands of fat history blobs) —
  faster loads, lighter memory, and a fix for an average-inflation bug.
- New `/api/fleet-history` endpoint powering the web graphs' time windows.
- Smoothing math (clamped Catmull-Rom) shared across desktop + web so lines curve
  without overshoot squiggles.

---

```
   ⚛  Stay curtailed. Stay hashing. Stay Re-Tek certified.  ⚛
      ── mine to it @ stratum+tcp://asicpool.space:<port> ──
```

*Windows / macOS / Linux installers attached below. Auto-update will offer this
build to existing Operators.*
