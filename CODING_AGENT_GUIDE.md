# Coding Agent Guide — Geeks Against Zombies

## Purpose

This document tells coding agents how to modify Geeks Against Zombies safely and consistently. Read it together with [ARCHITECTURE.md](./ARCHITECTURE.md) before making architectural changes.

The application is a deterministic, one-screen lane-defense game built with:

- TypeScript
- Vite
- Babylon.js
- Babylon Flow Graph
- Plain HTML and CSS

Do not introduce React, Next.js, JSX, component frameworks, CSS frameworks, UI libraries, or browser-authoritative gameplay logic.

## First steps for every task

1. Read the user request and identify which architectural layer owns the change.
2. Inspect the relevant files before editing.
3. Preserve unrelated work and existing behavior.
4. Make the smallest complete change that satisfies the request.
5. Format modified files.
6. Validate in proportion to the change.
7. Report what changed and which checks passed.

Useful initial commands:

```bash
rg --files
npm run typecheck
npm test
```

Use `rg` for text and file searches. Do not scan or edit `node_modules` unless diagnosing Babylon APIs.

## Architectural ownership

### `src/game`

Owns all authoritative gameplay:

- Tick number and match status
- Entity IDs and entity state
- Board occupancy
- Health, damage, movement, cooldowns, and targeting
- Energy, costs, score, waves, victory, and defeat
- Command validation
- Replay, serialization, and hashing

Rules for this directory:

- Never import Babylon.js.
- Never import DOM or browser APIs.
- Never use rendering frame rate for game rules.
- Never use `Date.now()`, `performance.now()`, timers, animations, audio, or physics callbacks.
- Use integers for authoritative time and gameplay positions.
- Keep entity processing in stable ID order.
- Add deterministic tests for new rules.

### `src/app`

Owns application coordination:

- Current runtime
- Selected geek and movement selection
- Hover and feedback state
- Pause, speed, restart, and first-load state
- DOM listener cleanup
- Scene and Flow Graph lifecycle

The application controller may queue commands, but it must not directly mutate entity health, position, energy, wave state, or match outcomes.

### `src/flow`

Owns browser/scene event adaptation:

- Scene tick to fixed-step runtime advancement
- Pointer events to typed application interaction
- Observer registration and disposal

Flow Graph blocks must remain narrow. They must not calculate cost, damage, movement, cooldowns, spawning, or command validity.

### `src/presentation`

Owns Babylon rendering:

- Engine, scene, camera, and lighting
- Board and entity meshes
- Materials and post-process shaders
- Health bars and previews
- Entity reconciliation by stable ID
- Visual-only interaction feedback

Presentation may read simulation state but must never decide gameplay outcomes.

### `index.html` and `src/styles.css`

Own semantic markup, HUD controls, overlays, accessibility attributes, and the one-screen responsive layout.

The document must not scroll at supported viewport sizes.

## Core deterministic contract

The simulation runs at 20 fixed ticks per second.

Commands are sorted by:

```text
(tick, playerId, sequence)
```

Commands must apply completely or reject without partial mutation.

Current command types:

- `place`
- `move`

When adding a command:

1. Add its type to `src/game/model.ts`.
2. Add atomic validation and application in `src/game/simulation.ts`.
3. Emit a semantic success or rejection event.
4. Queue it through `GameApp`; do not call simulation internals from input code.
5. Add success, rejection, and determinism tests.
6. Consider replay and serialization compatibility.

Current simulation order:

1. Increment tick.
2. Apply sorted commands.
3. Spawn scheduled enemies.
4. Generate resources.
5. Acquire targets and fire.
6. Move projectiles.
7. Resolve projectile hits.
8. Move zombies or resolve attacks.
9. Remove destroyed entities.
10. Evaluate victory and defeat.

Do not reorder systems without documenting and testing the behavioral change.

## Runtime rules

`FixedStepRuntime` converts rendered frame deltas into fixed simulation ticks.

Current behavior:

- Fixed rate: 20 Hz
- Frame delta clamp: 0.25 seconds
- Maximum catch-up: five ticks per rendered frame
- Pause freezes simulation without accumulating elapsed time
- Speed may be set to 1x or 2x

Speed changes multiply the accumulator input. They must not alter damage, cooldown, movement, or wave definitions.

When changing runtime behavior, test:

- Equal final state under different frame schedules
- Pause without accumulated time
- Resume continuity
- Speed multiplier tick counts

## Babylon scene rules

Entity meshes are reconciled by authoritative entity ID.

When adding a new entity view:

1. Create it only when its ID first appears.
2. Store its `entityId` in metadata for interaction/debugging.
3. Update its transform from simulation state.
4. Dispose it and all owned children when the entity disappears.
5. Keep it non-authoritative.

Babylon physics and collisions must not determine hits, occupancy, blocking, or movement.

### Picking trap

The project explicitly imports:

```ts
import "@babylonjs/core/Culling/ray.js";
```

Do not remove it. Tree-shaken Babylon builds require this side-effect registration for `scene.pick()`.

`QueueCommandBlock` uses public scene pointer observers as Flow Graph pending tasks because Babylon's experimental mesh-pick event can miss gestures consumed by camera controls.

Always remove observers during block cancellation/disposal.

### Health bars

Health bars are presentation-only and contextual:

- Hidden by default
- Shown for 60 simulation ticks after damage
- Shown while an entity is hovered
- Shown while a geek is selected for movement

Do not add health-bar visibility to `GameState`.

## Network post-process shader

The fullscreen shader is stored and configured in `src/presentation/scene.ts`.

Modes:

- `off`: normal gameplay
- `secure`: teal start and victory effect
- `breach`: red defeat effect

Use `setNetworkEffect()` to change modes. Do not create duplicate post-process instances.

The shader currently contains:

- Drifting network nodes
- Traveling packets
- Organic and chord connections
- Warped topology grid
- Pulsing grid intersections
- Pointer-driven local deformation
- Secure and breach palettes

Shader effects are visual only. Shader time may use render deltas because it cannot affect simulation state.

When editing the shader:

- Preserve WebGL-compatible GLSL syntax.
- Use fixed loop bounds.
- Avoid excessive loops or expensive nested noise on mobile.
- Keep aspect-ratio correction.
- Verify both secure and breach palettes.
- Ensure the board and modal text remain readable.

## UI state and controls

Current controls:

- Geek deck selection
- Tile placement
- Click placed geek/tile, then destination to move
- Pause/Resume
- 1x/2x speed
- Help
- Restart after victory/defeat
- Keyboard shortcuts

Geek selection is one-shot: a successful placement clears selection. Rejected placement keeps it for retry.

The first-load modal pauses simulation but leaves rendering active for the network shader. Background controls are disabled until the player starts.

Pause stops both the fixed-step runtime and Babylon render loop. Resume must reuse the same stable render callback to avoid duplicate loops.

Restart must reset:

- Game state
- Runtime pause
- Runtime speed to 1x
- Application pause and speed flags
- Placement and movement selection
- Hover state
- Feedback state
- Command sequence

The first-load modal should not reappear on ordinary restart unless explicitly requested.

## Accessibility requirements

- Use native buttons for actions.
- Use `aria-pressed` for toggles.
- Keep rejection messages in a restrained live region.
- Focus the start button when the first-load modal opens.
- Focus the restart button when victory/defeat opens.
- Restore focus to the canvas after overlays close.
- Do not communicate state through color alone.
- Keep touch targets at least 44 CSS pixels.
- Preserve visible keyboard focus.

## One-screen layout requirements

The root shell must retain:

```css
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}
```

The app grid uses header, deck, and remaining canvas space. The canvas container must keep `min-height: 0` and `overflow: hidden`.

When changing layout, check at least:

- 360×640
- 768×1024
- 1366×768
- 1920×1080

Overlays must remain inside the canvas region and must not increase document height.

## Common implementation workflows

### Add a geek or zombie type

1. Extend the union in `model.ts`.
2. Add data to `config.ts`.
3. Implement rule behavior in `simulation.ts`.
4. Add a distinct presentation in `scene.ts`.
5. Update HUD/deck markup if player-selectable.
6. Add deterministic tests.
7. Verify replay hashes remain stable for identical versions.

### Add a gameplay rule

1. Decide which tick-order phase owns it.
2. Implement it in `src/game` only.
3. Keep all inputs serializable.
4. Emit semantic events for presentation effects.
5. Add headless tests.
6. Render the result without feeding presentation state back into simulation.

### Add a visual effect

1. Trigger it from state differences or semantic events.
2. Keep it disposable.
3. Ensure missing effects cannot halt simulation.
4. Respect reduced motion where applicable.
5. Do not wait for animation completion before applying game rules.

### Add a HUD control

1. Add semantic HTML in `index.html`.
2. Query it once in `DomView`.
3. Register its listener once in `GameApp.start()`.
4. Store cleanup through the controller's listener helper.
5. Reflect state using text, classes, disabled state, and ARIA.
6. Ensure restart/disposal does not duplicate listeners.

## Validation commands

Use these commands after code changes:

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The complete gate is:

```bash
npm run check
```

Minimum validation by change type:

| Change                 | Required checks                                                           |
| ---------------------- | ------------------------------------------------------------------------- |
| Documentation only     | `npm run format:check`                                                    |
| CSS/HTML               | format, lint, typecheck, browser viewport check                           |
| Application controller | format, lint, typecheck, tests                                            |
| Simulation/config      | format, lint, typecheck, tests                                            |
| Babylon/Flow Graph     | format, lint, typecheck, tests, production build, browser smoke test      |
| Shader                 | format, typecheck, production build, browser smoke test on desktop/mobile |

If a sandbox blocks Vitest or Vite configuration resolution, rerun the same command with the required approval rather than changing project configuration to work around the sandbox.

## Testing expectations

Tests live in `src/tests` and run in Node.

Keep headless simulation tests independent from Babylon and browser APIs.

Important regression cases:

- Same replay produces the same hash
- Serialization/restoration continues identically
- Invalid commands do not partially mutate state
- Movement preserves energy
- Pause does not accumulate time
- 2x speed advances twice as many fixed ticks
- Different frame schedules produce the same state at the same tick
- Flow Graph adapters remain wired

Add browser automation for interaction or layout regressions when practical.

## Dependency policy

Production dependencies should remain minimal. Prefer browser and Babylon public APIs over additional packages.

Before adding a dependency:

1. Confirm the platform or Babylon does not already provide the capability.
2. Explain why the dependency is necessary.
3. Keep it narrowly scoped.
4. Check production bundle impact.

Do not add remote production assets or Babylon loaders until local assets require them.

## Known risks and technical debt

- Babylon Flow Graph is experimental.
- The main Babylon bundle remains large and needs profiling/code splitting.
- Character views still use simple generated primitives.
- Visual interpolation is limited.
- Browser automation does not yet cover every required viewport and lifecycle path.
- Replay import/export UI and debug tooling are not complete.

Do not conceal these limitations by weakening validation or moving authoritative logic into presentation.

## Definition of done

A task is complete when:

- The requested behavior works in the correct architectural layer.
- Deterministic boundaries remain intact.
- New resources and listeners are disposed.
- Keyboard and pointer behavior remain usable.
- The one-screen layout remains intact.
- Relevant tests are added or updated.
- Formatting, typecheck, and proportionate validation pass.
- The final report states what changed and any remaining risk.
