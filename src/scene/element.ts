import { createScene } from "./controller";
import type { SceneController } from "./types";

/** Custom-element adapter around the framework-independent scene controller. */
export class OrbitScene extends HTMLElement {
  controller?: SceneController;
  connectedCallback() {
    this.controller ??= createScene(this);
  }
  disconnectedCallback() {
    this.controller?.destroy();
    this.controller = undefined;
  }
}
if (!customElements.get("orbit-scene"))
  customElements.define("orbit-scene", OrbitScene);
