# Challenge Arena — Screenshot Requirements

Final assets go in `assets/store/{ios,android}/`.

## iOS (required sizes for App Store Connect, 2025+)

- **6.7" iPhone (1290×2796)** — REQUIRED. Use iPhone 15 Pro Max simulator.
- **6.5" iPhone (1284×2778 or 1242×2688)** — REQUIRED for older review device.
- **5.5" iPhone (1242×2208)** — OPTIONAL.
- iPad — OPTIONAL since we set `supportsTablet: false`.

## Android (Play Console)

- **Phone screenshots: 1080×1920 minimum, 7680×3840 max**, 16:9 or 9:16.
- 2 minimum, 8 recommended.
- Feature graphic: 1024×500 PNG (no transparency).

## Content per screen (3-shot set, both platforms)

1. **Catalog** — show category chips with one selected; cards visible
   showing variety of categories. Caption overlay: "Pick from 30+ challenges."
2. **Home with streak** — username + 7-day streak chip + two Today cards +
   suggested rail. Caption: "Build a streak. Show off."
3. **Celebration** — XP counter mid-animation + flame tick + level-up overlay
   visible. Caption: "Win something every day."

## Capture tips

- Use a sample account with username "mira\_" pre-seeded with realistic data
  (level 3, ~240 XP, 5-day streak, 2 accepted challenges).
- Disable status bar clock variability via simulator override (Cmd+1 in
  Simulator → Device → Status Bar... pinned 9:41).
- Don't forget Dynamic Island clearance on the 6.7" capture.
