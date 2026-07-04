import type { FlowGraphCoordinator } from "@babylonjs/core/FlowGraph/flowGraphCoordinator.js";
import { createGameGraph } from "../flow/create-game-graph";
import type { GeekKind } from "../game/model";
import { FixedStepRuntime } from "../game/runtime";
import { createGame } from "../game/simulation";
import { createScene, type GameScene } from "../presentation/scene";
import { DomView } from "./dom-view";

export class GameApp {
  private runtime = new FixedStepRuntime(createGame(0xc0ffee));
  private selected: GeekKind | null = null;
  private movingId: number | null = null;
  private hoverCell: { row: number; col: number } | null = null;
  private hoveredEntityId: number | null = null;
  private feedback: { text: string; until: number } | null = null;
  private sequence = 0;
  private paused = false;
  private doubledSpeed = false;
  private awaitingStart = true;
  private scene?: GameScene;
  private graph?: FlowGraphCoordinator;
  private resize?: ResizeObserver;
  private cleanup: Array<() => void> = [];
  private cursor = { row: 2, col: 0 };
  private readonly renderFrame = (): void => {
    this.scene?.render();
  };
  constructor(private readonly view = new DomView()) {}
  start(): void {
    this.scene = createScene(this.view.canvas);
    this.graph = createGameGraph(
      this.scene.scene,
      this.runtime,
      this.scene.tiles,
      () => this.publish(),
      (metadata) => this.handleBoardPick(metadata),
      (metadata) => this.handleBoardHover(metadata),
    );
    this.resize = new ResizeObserver(() => this.scene?.engine.resize());
    this.resize.observe(this.view.stage);
    this.runtime.setPaused(true);
    this.scene.engine.runRenderLoop(this.renderFrame);
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window,
      name: K,
      listener: (event: HTMLElementEventMap[K]) => void,
    ): void => {
      target.addEventListener(name, listener as EventListener);
      this.cleanup.push(() => target.removeEventListener(name, listener as EventListener));
    };
    on(this.view.deck, "click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("[data-geek]");
      if (button?.dataset.geek) this.selectGeek(button.dataset.geek as GeekKind);
    });
    on(this.view.pauseButton, "click", () => this.togglePause());
    on(this.view.speedButton, "click", () => this.toggleSpeed());
    on(this.view.helpButton, "click", () => this.view.showHelp(true));
    on(this.view.closeHelpButton, "click", () => this.view.showHelp(false));
    on(this.view.restartButton, "click", () => this.restart());
    on(this.view.startButton, "click", () => this.beginGame());
    on(window, "keydown", (event) => this.keydown(event as KeyboardEvent));
    this.publish();
    this.view.showStart(true);
  }
  selectGeek(kind: GeekKind): void {
    if (this.awaitingStart) return;
    this.selected = kind;
    this.movingId = null;
    this.publish();
  }
  private handleBoardPick(metadata: unknown): void {
    if (this.awaitingStart) return;
    if (!metadata || typeof metadata !== "object") return;
    const value = metadata as { row?: unknown; col?: unknown; entityId?: unknown; entityType?: unknown };
    if (value.entityType === "geek" && typeof value.entityId === "number") {
      this.movingId = value.entityId;
      this.feedback = null;
      this.publish();
      return;
    }
    if (typeof value.row === "number" && typeof value.col === "number") {
      const occupant = this.runtime.state.geeks.find((geek) => geek.row === value.row && geek.col === value.col);
      if (this.movingId === null && occupant) {
        this.movingId = occupant.id;
        this.feedback = null;
        this.publish();
        return;
      }
      this.queuePlacement(value.row, value.col);
    }
  }
  private handleBoardHover(metadata: unknown): void {
    if (this.awaitingStart) return;
    const value =
      metadata && typeof metadata === "object"
        ? (metadata as { row?: unknown; col?: unknown; entityId?: unknown })
        : null;
    this.hoverCell =
      typeof value?.row === "number" && typeof value.col === "number" ? { row: value.row, col: value.col } : null;
    this.hoveredEntityId = typeof value?.entityId === "number" ? value.entityId : null;
    this.publish();
  }
  queuePlacement(row: number, col: number): void {
    if (this.paused || this.runtime.state.status !== "playing") return;
    const common = { tick: this.runtime.state.tick + 1, playerId: 1, sequence: this.sequence++, row, col };
    if (this.movingId !== null) {
      this.runtime.queue({ type: "move", ...common, entityId: this.movingId });
      return;
    }
    if (this.selected === null) {
      this.feedback = { text: "Select a geek first", until: this.runtime.state.tick + 40 };
      this.publish();
      return;
    }
    this.runtime.queue({ type: "place", ...common, kind: this.selected });
  }
  private keydown(event: KeyboardEvent): void {
    if (this.awaitingStart) {
      if (event.key === "Enter") this.beginGame();
      return;
    }
    if (event.key >= "1" && event.key <= "3")
      this.selectGeek((["hacker", "engineer", "scientist"] as const)[Number(event.key) - 1] ?? "hacker");
    else if (event.code === "Space") {
      event.preventDefault();
      this.togglePause();
    } else if (event.key.toLowerCase() === "r") this.restart();
    else if (event.key === "ArrowUp") this.cursor.row = Math.max(0, this.cursor.row - 1);
    else if (event.key === "ArrowDown") this.cursor.row = Math.min(4, this.cursor.row + 1);
    else if (event.key === "ArrowLeft") this.cursor.col = Math.max(0, this.cursor.col - 1);
    else if (event.key === "ArrowRight") this.cursor.col = Math.min(8, this.cursor.col + 1);
    else if (event.key === "Enter") this.queuePlacement(this.cursor.row, this.cursor.col);
  }
  private togglePause(): void {
    if (this.awaitingStart) return;
    this.paused = !this.paused;
    this.runtime.setPaused(this.paused);
    if (this.paused) this.scene?.engine.stopRenderLoop(this.renderFrame);
    else this.scene?.engine.runRenderLoop(this.renderFrame);
    this.publish();
  }
  private toggleSpeed(): void {
    if (this.awaitingStart) return;
    this.doubledSpeed = !this.doubledSpeed;
    this.runtime.setSpeed(this.doubledSpeed ? 2 : 1);
    this.publish();
  }
  private beginGame(): void {
    if (!this.awaitingStart) return;
    this.awaitingStart = false;
    this.runtime.setPaused(false);
    this.runtime.setSpeed(1);
    this.scene?.setNetworkEffect("off");
    this.view.showStart(false);
    this.publish();
  }
  restart(seed = 0xc0ffee): void {
    this.runtime.state = createGame(seed);
    this.runtime.setPaused(false);
    this.runtime.setSpeed(1);
    if (this.paused) this.scene?.engine.runRenderLoop(this.renderFrame);
    this.sequence = 0;
    this.paused = false;
    this.doubledSpeed = false;
    this.movingId = null;
    this.hoverCell = null;
    this.hoveredEntityId = null;
    this.feedback = null;
    this.publish();
  }
  private publish(): void {
    if (!this.scene) return;
    const rejection = this.runtime.state.events.find((event) => event.type === "rejected");
    if (rejection?.reason) this.feedback = { text: rejection.reason, until: this.runtime.state.tick + 40 };
    if (this.runtime.state.events.some((event) => event.type === "placed")) {
      this.selected = null;
      this.feedback = null;
    }
    if (this.runtime.state.events.some((event) => event.type === "moved")) {
      this.movingId = null;
      this.feedback = null;
    }
    if (this.movingId !== null && !this.runtime.state.geeks.some((geek) => geek.id === this.movingId))
      this.movingId = null;
    if (this.feedback && this.runtime.state.tick >= this.feedback.until) this.feedback = null;
    this.scene.reconcile(this.runtime.state);
    this.scene.setNetworkEffect(
      this.awaitingStart || this.runtime.state.status === "won"
        ? "secure"
        : this.runtime.state.status === "lost"
          ? "breach"
          : "off",
    );
    this.scene.setInteraction(this.runtime.state, this.selected, this.hoverCell, this.hoveredEntityId, this.movingId);
    this.view.render(
      this.runtime.state,
      this.selected,
      this.paused,
      this.doubledSpeed,
      this.feedback?.text ?? null,
      this.movingId !== null,
    );
  }
  dispose(): void {
    this.cleanup.splice(0).forEach((dispose) => dispose());
    this.resize?.disconnect();
    this.scene?.engine.stopRenderLoop(this.renderFrame);
    this.graph?.dispose();
    this.scene?.dispose();
    this.graph = undefined;
    this.scene = undefined;
  }
}
