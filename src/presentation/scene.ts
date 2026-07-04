import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess.js";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import "@babylonjs/core/Culling/ray.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { GameState, Geek, GeekKind } from "../game/model";
import { GEEK, ZOMBIE } from "../game/config";

export interface GameScene {
  engine: Engine;
  scene: Scene;
  tiles: AbstractMesh[];
  reconcile(state: GameState): void;
  setInteraction(
    state: GameState,
    selected: GeekKind | null,
    hover: { row: number; col: number } | null,
    hoveredEntityId: number | null,
    movingId: number | null,
  ): void;
  setNetworkEffect(mode: "off" | "secure" | "breach"): void;
  render(): void;
  dispose(): void;
}

function material(scene: Scene, name: string, color: Color3): StandardMaterial {
  const value = new StandardMaterial(name, scene);
  value.diffuseColor = color;
  value.specularColor = Color3.Black();
  return value;
}

export function createScene(canvas: HTMLCanvasElement): GameScene {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
  const scene = new Scene(engine);
  scene.clearColor.set(0.035, 0.055, 0.09, 1);
  const boardRoot = new TransformNode("board-root", scene);
  const portraitLayout = window.matchMedia("(max-width: 700px) and (orientation: portrait)");
  const updateBoardOrientation = (): void => {
    boardRoot.rotation.y = portraitLayout.matches ? -Math.PI / 2 : 0;
  };
  portraitLayout.addEventListener("change", updateBoardOrientation);
  updateBoardOrientation();
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, 0.72, 14, new Vector3(0, 0, 0), scene);
  camera.lowerRadiusLimit = 11;
  camera.upperRadiusLimit = 16;
  camera.attachControl(canvas, true);
  ShaderStore.ShadersStore.networkOverlayFragmentShader = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float time;
    uniform float intensity;
    uniform float danger;
    uniform vec2 screenSize;
    uniform vec2 pointer;

    float hash(float value) {
      return fract(sin(value * 91.3458) * 47453.5453);
    }

    vec2 nodePosition(float id) {
      vec2 home = vec2(hash(id + 2.7), hash(id * 2.31 + 8.4)) * 0.94 + 0.03;
      vec2 drift = vec2(
        sin(time * (0.11 + hash(id) * 0.07) + id * 1.73),
        cos(time * (0.09 + hash(id + 4.0) * 0.06) + id * 2.17)
      ) * 0.088;
      return home + drift;
    }

    float segmentDistance(vec2 point, vec2 start, vec2 end) {
      vec2 segment = end - start;
      float amount = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
      return length(point - start - segment * amount);
    }

    void main(void) {
      vec4 base = texture2D(textureSampler, vUV);
      float aspect = screenSize.x / max(screenSize.y, 1.0);
      vec2 scale = vec2(aspect, 1.0);
      vec2 point = (vUV - 0.5) * scale;
      float links = 0.0;
      float nodes = 0.0;
      float packets = 0.0;

      for (int index = 0; index < 14; index++) {
        float id = float(index);
        vec2 start = (nodePosition(id) - 0.5) * scale;
        vec2 end = (nodePosition(mod(id + 1.0, 14.0)) - 0.5) * scale;
        vec2 chord = (nodePosition(mod(id + 5.0, 14.0)) - 0.5) * scale;
        float breathing = 0.7 + 0.3 * sin(time * 0.8 + id * 1.9);
        links += (1.0 - smoothstep(0.002, 0.009, segmentDistance(point, start, end))) * breathing;
        links += (1.0 - smoothstep(0.001, 0.006, segmentDistance(point, start, chord))) * 0.3;
        nodes += (1.0 - smoothstep(0.008, 0.035, length(point - start))) * (0.7 + breathing * 0.5);

        float travel = smoothstep(0.0, 1.0, fract(time * (0.075 + id * 0.006) + hash(id + 12.0)));
        vec2 packetPosition = mix(start, end, travel);
        packets += 1.0 - smoothstep(0.003, 0.022, length(point - packetPosition));
      }

      float current = sin(point.x * 8.0 + sin(point.y * 6.0 - time * 0.35)) * 0.5 + 0.5;
      current *= sin(point.y * 9.0 - time * 0.28) * 0.5 + 0.5;
      current = pow(current, 7.0) * 0.07;

      vec2 topologyPoint = point;
      vec2 pointerPoint = (pointer - 0.5) * scale;
      vec2 pointerDelta = topologyPoint - pointerPoint;
      float pointerDistance = length(pointerDelta);
      float pointerInfluence = exp(-pointerDistance * pointerDistance * 8.0);
      float pointerWave = sin(pointerDistance * 18.0 - time * 2.2);
      topologyPoint += pointerDelta / max(pointerDistance, 0.001) * pointerWave * pointerInfluence * 0.052;
      topologyPoint += vec2(
        sin(point.y * 4.5 + time * 0.16),
        cos(point.x * 3.8 - time * 0.13)
      ) * 0.018;
      vec2 topologyGrid = topologyPoint * vec2(8.0, 9.0);
      vec2 topologyEdge = min(fract(topologyGrid), 1.0 - fract(topologyGrid));
      float topology = 1.0 - smoothstep(0.01, 0.038, min(topologyEdge.x, topologyEdge.y));
      float brokenPattern = smoothstep(0.06, 0.68, sin(topologyGrid.x * 1.7 + topologyGrid.y * 2.3 + time * 0.22) * 0.5 + 0.5);
      topology *= (0.45 + brokenPattern * 0.55) * 0.28;
      float intersection = 1.0 - smoothstep(0.012, 0.085, length(topologyEdge));
      float intersectionPulse = 0.55 + 0.45 * sin(time * 2.4 + topologyGrid.x * 0.8 + topologyGrid.y * 1.1);
      intersection *= (0.28 + intersectionPulse * 0.42) * (1.0 + pointerInfluence * 0.8);

      float scanPosition = fract(time * 0.045);
      float scan = 1.0 - smoothstep(0.0, 0.035, abs(vUV.y - scanPosition));
      scan *= 0.09 + links * 0.05;
      float vignette = 1.0 - smoothstep(0.56, 0.86, distance(vUV, vec2(0.5)));
      float organicSignal = links * 0.34 + nodes * 0.75 + packets + current;
      float signal = min(1.6, organicSignal + topology + intersection + scan) * vignette;
      vec3 secureColor = mix(
        vec3(0.04, 0.4, 0.62),
        vec3(0.38, 1.0, 0.82),
        clamp(nodes + packets + intersection * 0.7 + scan * 0.5, 0.0, 1.0)
      );
      vec3 breachColor = mix(
        vec3(0.48, 0.025, 0.08),
        vec3(1.0, 0.3, 0.08),
        clamp(nodes + packets + intersection * 0.8 + scan * 0.7, 0.0, 1.0)
      );
      vec3 networkColor = mix(secureColor, breachColor, danger);
      vec3 darkened = base.rgb * (1.0 - mix(0.28, 0.42, danger) * intensity);
      gl_FragColor = vec4(darkened + networkColor * signal * intensity, base.a);
    }
  `;
  let networkTime = 0;
  const networkEffect = new PostProcess(
    "start-network-overlay",
    "networkOverlay",
    ["time", "intensity", "danger", "screenSize", "pointer"],
    null,
    1,
    camera,
  );
  let shaderPointerX = 0.5;
  let shaderPointerY = 0.5;
  let networkDanger = 0;
  networkEffect.onApply = (effect) => {
    networkTime += engine.getDeltaTime() / 1000;
    const pointerTargetX = Math.max(0, Math.min(1, scene.pointerX / Math.max(canvas.clientWidth, 1)));
    const pointerTargetY = 1 - Math.max(0, Math.min(1, scene.pointerY / Math.max(canvas.clientHeight, 1)));
    shaderPointerX += (pointerTargetX - shaderPointerX) * 0.12;
    shaderPointerY += (pointerTargetY - shaderPointerY) * 0.12;
    effect.setFloat("time", networkTime);
    effect.setFloat("intensity", 1);
    effect.setFloat("danger", networkDanger);
    effect.setFloat2("screenSize", engine.getRenderWidth(), engine.getRenderHeight());
    effect.setFloat2("pointer", shaderPointerX, shaderPointerY);
  };
  let networkEffectEnabled = true;
  new HemisphericLight("sky", new Vector3(0, 1, 0), scene).intensity = 0.85;
  new DirectionalLight("key", new Vector3(-1, -2, 1), scene).intensity = 0.65;
  const tileA = material(scene, "tile-a", Color3.FromHexString("#263a48"));
  const tileB = material(scene, "tile-b", Color3.FromHexString("#304b58"));
  const geekMaterials = {
    hacker: material(scene, "hacker", Color3.FromHexString("#42d9d0")),
    engineer: material(scene, "engineer", Color3.FromHexString("#ffb347")),
    scientist: material(scene, "scientist", Color3.FromHexString("#b78cff")),
  };
  const zombieMaterial = material(scene, "zombie", Color3.FromHexString("#8dbf68"));
  const projectileMaterial = material(scene, "packet", Color3.FromHexString("#fff06a"));
  const healthBackMaterial = material(scene, "health-back", Color3.FromHexString("#301b24"));
  const healthMaterial = material(scene, "health", Color3.FromHexString("#62df79"));
  const previewMaterial = material(scene, "placement-preview", geekMaterials.hacker.diffuseColor.clone());
  previewMaterial.alpha = 0.48;
  const preview = MeshBuilder.CreateBox("placement-preview", { size: 0.64 }, scene);
  preview.parent = boardRoot;
  preview.material = previewMaterial;
  preview.isPickable = false;
  preview.setEnabled(false);
  const tiles: AbstractMesh[] = [];
  for (let row = 0; row < 5; row += 1)
    for (let col = 0; col < 9; col += 1) {
      const tile = MeshBuilder.CreateBox(`tile-${row}-${col}`, { width: 0.96, depth: 0.96, height: 0.08 }, scene);
      tile.parent = boardRoot;
      tile.position.set(col - 4, 0, row - 2);
      tile.material = (row + col) % 2 ? tileA : tileB;
      tile.metadata = { row, col };
      tiles.push(tile);
    }
  interface EntityView {
    mesh: AbstractMesh;
    health?: AbstractMesh;
    healthBack?: AbstractMesh;
    maxHp?: number;
    lastHp?: number;
    healthUntilTick?: number;
  }
  const views = new Map<number, EntityView>();
  const reconcile = (state: GameState): void => {
    const live = new Set<number>();
    const ensure = (
      entity: Geek | GameState["zombies"][number] | GameState["projectiles"][number],
      kind: "geek" | "zombie" | "projectile",
    ): EntityView => {
      live.add(entity.id);
      const existing = views.get(entity.id);
      if (existing) return existing;
      const mesh =
        kind === "projectile"
          ? MeshBuilder.CreateSphere(`projectile-${entity.id}`, { diameter: 0.14 }, scene)
          : kind === "zombie"
            ? MeshBuilder.CreateCapsule(`zombie-${entity.id}`, { height: 0.8, radius: 0.22 }, scene)
            : MeshBuilder.CreateBox(`geek-${entity.id}`, { size: 0.58 }, scene);
      mesh.parent = boardRoot;
      mesh.material =
        kind === "projectile"
          ? projectileMaterial
          : kind === "zombie"
            ? zombieMaterial
            : geekMaterials[(entity as Geek).kind];
      mesh.metadata =
        kind === "geek" ? { entityId: entity.id, entityType: "geek" } : { entityId: entity.id, entityType: kind };
      const view: EntityView = { mesh };
      if (kind !== "projectile") {
        const back = MeshBuilder.CreateBox(
          `health-back-${entity.id}`,
          { width: 0.68, height: 0.065, depth: 0.05 },
          scene,
        );
        back.parent = mesh;
        back.position.set(0, 0.68, 0);
        back.material = healthBackMaterial;
        back.isPickable = false;
        const health = MeshBuilder.CreateBox(
          `health-${entity.id}`,
          { width: 0.62, height: 0.035, depth: 0.055 },
          scene,
        );
        health.parent = mesh;
        health.position.set(0, 0.68, -0.005);
        health.material = healthMaterial;
        health.isPickable = false;
        back.setEnabled(false);
        health.setEnabled(false);
        view.health = health;
        view.healthBack = back;
        view.maxHp =
          kind === "zombie" ? ZOMBIE[(entity as GameState["zombies"][number]).kind].hp : GEEK[(entity as Geek).kind].hp;
        view.lastHp = (entity as Geek | GameState["zombies"][number]).hp;
        view.healthUntilTick = -1;
      }
      views.set(entity.id, view);
      return view;
    };
    const updateHealth = (view: EntityView, hp: number): void => {
      if (!view.health || !view.healthBack || !view.maxHp) return;
      if (view.lastHp !== undefined && hp < view.lastHp) view.healthUntilTick = state.tick + 60;
      view.lastHp = hp;
      const ratio = Math.max(0, Math.min(1, hp / view.maxHp));
      view.health.scaling.x = ratio;
      view.health.position.x = -0.31 * (1 - ratio);
      const recentlyDamaged = state.tick <= (view.healthUntilTick ?? -1);
      view.health.setEnabled(recentlyDamaged);
      view.healthBack.setEnabled(recentlyDamaged);
    };
    state.geeks.forEach((entity) => {
      const view = ensure(entity, "geek");
      view.mesh.position.set(entity.col - 4, 0.38, entity.row - 2);
      updateHealth(view, entity.hp);
    });
    state.zombies.forEach((entity) => {
      const view = ensure(entity, "zombie");
      view.mesh.position.set(entity.x / 1000 - 4, 0.43, entity.row - 2);
      updateHealth(view, entity.hp);
    });
    state.projectiles.forEach((entity) =>
      ensure(entity, "projectile").mesh.position.set(entity.x / 1000 - 4, 0.48, entity.row - 2),
    );
    for (const [id, view] of views)
      if (!live.has(id)) {
        view.mesh.dispose();
        views.delete(id);
      }
  };
  const setInteraction = (
    state: GameState,
    selected: GeekKind | null,
    hover: { row: number; col: number } | null,
    hoveredEntityId: number | null,
    movingId: number | null,
  ): void => {
    const cellEntityId = hover
      ? state.geeks.find((geek) => geek.row === hover.row && geek.col === hover.col)?.id
      : undefined;
    for (const [id, view] of views) {
      view.mesh.scaling.setAll(id === movingId ? 1.28 : 1);
      if (view.health && view.healthBack) {
        const showHealth =
          state.tick <= (view.healthUntilTick ?? -1) ||
          id === movingId ||
          id === hoveredEntityId ||
          id === cellEntityId;
        view.health.setEnabled(showHealth);
        view.healthBack.setEnabled(showHealth);
      }
    }
    if (!hover || (selected === null && movingId === null)) {
      preview.setEnabled(false);
      return;
    }
    const occupied = state.geeks.some(
      (geek) => geek.id !== movingId && geek.row === hover.row && geek.col === hover.col,
    );
    const moving = movingId === null ? undefined : state.geeks.find((geek) => geek.id === movingId);
    const previewKind = moving?.kind ?? selected;
    if (!previewKind) {
      preview.setEnabled(false);
      return;
    }
    previewMaterial.diffuseColor = occupied ? Color3.FromHexString("#ff5d6c") : geekMaterials[previewKind].diffuseColor;
    preview.position.set(hover.col - 4, 0.39, hover.row - 2);
    preview.setEnabled(true);
  };
  return {
    engine,
    scene,
    tiles,
    reconcile,
    setInteraction,
    setNetworkEffect: (mode) => {
      networkDanger = mode === "breach" ? 1 : 0;
      const enabled = mode !== "off";
      if (enabled === networkEffectEnabled) return;
      networkEffectEnabled = enabled;
      if (enabled) camera.attachPostProcess(networkEffect);
      else camera.detachPostProcess(networkEffect);
    },
    render: () => scene.render(),
    dispose: () => {
      portraitLayout.removeEventListener("change", updateBoardOrientation);
      for (const view of views.values()) view.mesh.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
