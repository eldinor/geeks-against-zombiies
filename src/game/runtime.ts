import type { GameCommand, GameState } from "./model";
import { step } from "./simulation";

export class FixedStepRuntime {
  readonly secondsPerTick = 1 / 20;
  private accumulator = 0;
  private paused = false;
  private speed = 1;
  private readonly commands: GameCommand[] = [];
  constructor(public state: GameState) {}
  queue(command: GameCommand): void {
    this.commands.push(command);
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
  }
  setSpeed(speed: 1 | 2): void {
    this.speed = speed;
  }
  advance(deltaSeconds: number): number {
    if (this.paused) return 0;
    this.accumulator += Math.min(Math.max(deltaSeconds, 0), 0.25) * this.speed;
    let count = 0;
    while (this.accumulator >= this.secondsPerTick && count < 5) {
      const tick = this.state.tick + 1;
      step(
        this.state,
        this.commands.filter((command) => command.tick === tick),
      );
      this.accumulator -= this.secondsPerTick;
      count += 1;
    }
    return count;
  }
  singleStep(): void {
    step(
      this.state,
      this.commands.filter((command) => command.tick === this.state.tick + 1),
    );
  }
  get interpolation(): number {
    return this.accumulator / this.secondsPerTick;
  }
}
