# Vaesen – Action & Damage Helper

Small add‑on module for **Foundry VTT (v13+)** that **tracks Long/Short actions per turn** and adds an **“Apply Damage”** button to chat cards, with a dialog to convert **extra successes** into extra damage. It is **system‑agnostic** for Vaesen because you can **map the target actor fields** (HP or Conditions) via settings—no changes to the Vaesen system needed.

## Features
- **Per‑turn action tracking:** buttons in the Combat Tracker for **Long** and **Short** actions; reset on turn change.
- **Damage dialog:** click “Apply Damage” on a chat message to open a dialog; set base damage and number of extra successes to convert; optionally mark as **Mental** damage.
- **Configurable field mapping:** choose whether damage is **numeric** (e.g., subtract HP) or **conditions** (increment a counter); configure **Physical** and **Mental** paths like `system.hp.value` or `system.conditions.physical`.
- **Non‑intrusive:** it doesn't modify the Vaesen system—just reads and updates whatever path you configure.

## Installation
### Manual (local)
1. Download the ZIP from the Releases page.
2. Extract into your data folder under `Data/modules/vaesen-action-damage-helper`.
3. Enable the module in your Vaesen world.

### Manifest (GitHub)
Once you publish the repository:
- **Manifest URL:** `https://raw.githubusercontent.com/USERNAME/vaesen-action-damage-helper/main/module.json`
- **Download URL:** `https://github.com/USERNAME/vaesen-action-damage-helper/releases/download/v0.1.0/vaesen-action-damage-helper-0.1.0.zip`

> Replace `USERNAME` with your GitHub username and tag the release as `v0.1.0`.

## Settings
- **Blocca azioni oltre il consentito** (`blockIllegalActions`) – hard‑block or only warn.
- **Azioni Brevi per turno** (`shortActionsPerTurn`) – default 1.
- **Modalità Danno** (`damageMode`) – `numeric` (subtract a value) or `conditions` (increment a counter).
- **Path attributo FISICO** (`targetPathPhysical`) – e.g. `system.hp.value` or `system.conditions.physical`.
- **Path attributo MENTALE** (`targetPathMental`) – e.g. `system.hp.value` or `system.conditions.mental`.
- **Selettore chat** (`chatButtonSelector`) – CSS selector where the button should be injected.

## Usage
- During combat, the active combatant shows **Segna Lunga** and **Breve x/y** in the tracker.
- On any roll message, click **Applica Danno** → set **base damage** and **extra successes** → select targets (controlled tokens) → **Applica**.
- Switch between Physical and Mental damage via the checkbox (uses the configured paths).

## Roadmap
- Auto‑parse extra successes from Vaesen roll data (if available in ChatMessage flags).
- Token HUD buttons for actions.
- Optional enforcement that disables certain buttons after actions are spent.

## Development
- Foundry v13+.
- No external deps. ESModule entry at `scripts/module.js`.

## Credits & License
Author: **Tommaso Paitowsky** (+ GPT‑5 Thinking)  
License: **MIT** (see `LICENSE`).  
Part of the “Moduli per Foundry” project.
