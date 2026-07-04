import { expect, it } from "vitest";
import { createGame } from "../game/simulation";
import { FixedStepRuntime } from "../game/runtime";
import { stateHash } from "../game/hash";

it("different frame schedules reach the same tick and state", () => {
  const a = new FixedStepRuntime(createGame(9));
  const b = new FixedStepRuntime(createGame(9));
  for (let i = 0; i < 200; i += 1) a.advance(0.05);
  for (let i = 0; i < 600; i += 1) b.advance(1 / 60);
  expect(a.state.tick).toBe(b.state.tick);
  expect(stateHash(a.state)).toBe(stateHash(b.state));
});

it("does not accumulate or advance simulation time while paused", () => {
  const runtime = new FixedStepRuntime(createGame(9));
  runtime.advance(0.05);
  expect(runtime.state.tick).toBe(1);
  runtime.setPaused(true);
  for (let i = 0; i < 20; i += 1) runtime.advance(0.05);
  expect(runtime.state.tick).toBe(1);
  runtime.setPaused(false);
  runtime.advance(0.05);
  expect(runtime.state.tick).toBe(2);
});

it("advances twice as many fixed ticks at double speed", () => {
  const runtime = new FixedStepRuntime(createGame(9));
  runtime.setSpeed(2);
  runtime.advance(0.05);
  expect(runtime.state.tick).toBe(2);
});
