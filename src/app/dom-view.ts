import { GEEK, WAVES } from "../game/config";
import type { GameState, GeekKind } from "../game/model";

function required<T extends Element>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Required element missing: ${selector}`);
  return value;
}
export class DomView {
  private previousStatus: GameState["status"] = "playing";
  readonly canvas = required<HTMLCanvasElement>("#game-canvas");
  readonly stage = required<HTMLElement>("#stage");
  readonly deck = required<HTMLElement>("#deck");
  readonly pauseButton = required<HTMLButtonElement>("#pause");
  readonly speedButton = required<HTMLButtonElement>("#speed");
  readonly helpButton = required<HTMLButtonElement>("#help");
  readonly dialog = required<HTMLElement>("#dialog");
  readonly startDialog = required<HTMLElement>("#start-dialog");
  readonly startButton = required<HTMLButtonElement>("#start-game");
  readonly closeHelpButton = required<HTMLButtonElement>("#close-help");
  readonly restartButton = required<HTMLButtonElement>("#restart");
  private readonly energy = required<HTMLElement>("#energy");
  private readonly score = required<HTMLElement>("#score");
  private readonly wave = required<HTMLElement>("#wave");
  private readonly nextWave = required<HTMLElement>("#next-wave");
  private readonly remaining = required<HTMLElement>("#remaining");
  private readonly message = required<HTMLElement>("#message");
  private readonly messageText = required<HTMLElement>("#message-text");
  private readonly feedback = required<HTMLElement>("#feedback");
  render(
    state: GameState,
    selected: GeekKind | null,
    paused: boolean,
    doubledSpeed: boolean,
    feedback: string | null,
    moving: boolean,
  ): void {
    const nextSpawn = WAVES[state.waveIndex];
    const ticksUntilWave = nextSpawn ? Math.max(0, nextSpawn.tick - state.tick) : null;
    this.energy.textContent = String(state.energy);
    this.score.textContent = String(state.score);
    this.wave.textContent = `${state.waveIndex}/${WAVES.length}`;
    this.nextWave.textContent = ticksUntilWave === null ? "—" : `${Math.ceil(ticksUntilWave / 20)}s`;
    this.remaining.textContent = String(state.zombies.length + WAVES.length - state.waveIndex);
    this.pauseButton.textContent = paused ? "Resume" : "Pause";
    this.pauseButton.setAttribute("aria-pressed", String(paused));
    this.speedButton.textContent = doubledSpeed ? "1x" : "2x";
    this.speedButton.setAttribute("aria-pressed", String(doubledSpeed));
    this.speedButton.setAttribute("aria-label", doubledSpeed ? "Return to normal speed" : "Run at double speed");
    this.speedButton.disabled = state.status !== "playing";
    this.deck.querySelectorAll<HTMLButtonElement>("[data-geek]").forEach((button) => {
      const kind = button.dataset.geek as GeekKind;
      button.setAttribute("aria-pressed", String(kind === selected));
      button.disabled = state.energy < GEEK[kind].cost || state.status !== "playing";
    });
    this.message.hidden = state.status === "playing";
    this.messageText.textContent =
      state.status === "won" ? "System secured! You win." : state.status === "lost" ? "The network fell." : "";
    if (state.status !== "playing" && this.previousStatus === "playing") this.restartButton.focus();
    if (state.status === "playing" && this.previousStatus !== "playing") this.canvas.focus();
    this.previousStatus = state.status;
    this.feedback.hidden = feedback === null;
    this.feedback.textContent = feedback ?? "";
    this.canvas.setAttribute(
      "aria-label",
      moving ? "Geek selected. Choose a destination tile." : "Game board. Select a geek, then choose a board cell.",
    );
  }
  showHelp(show: boolean): void {
    this.dialog.hidden = !show;
    if (show) this.closeHelpButton.focus();
    else this.helpButton.focus();
  }
  showStart(show: boolean): void {
    this.startDialog.hidden = !show;
    this.pauseButton.disabled = show;
    this.speedButton.disabled = show;
    this.helpButton.disabled = show;
    this.canvas.tabIndex = show ? -1 : 0;
    this.deck.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = show;
    });
    if (show) this.startButton.focus();
    else this.canvas.focus();
  }
}
