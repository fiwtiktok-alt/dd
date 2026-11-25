import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ThreeModelId } from '../types/studio';

export interface ThreeRenderState {
  rotX: number;
  rotY: number;
  rotZ: number;
  posY: number;
  posZ: number;
  scale3d: number;
  camZ: number;
  camY: number;
  color: string;
  metalness: number;
  roughness: number;
  blueLight: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class ThreeStudioEngine {
  public available = false;
  public canvas: HTMLCanvasElement;
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private rimLight?: THREE.DirectionalLight;
  private envTexture?: THREE.Texture;
  private activeObject?: THREE.Group;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 720;
    this.canvas.height = 720;

    try {
      const isSoftwareGl = detectSoftwareWebGL();
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: !isSoftwareGl,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(720, 720, false);

      this.scene = new THREE.Scene();
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTexture;
      pmremGenerator.dispose();

      this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
      this.camera.position.set(0, 0.35, 6.2);

      const hemiLight = new THREE.HemisphereLight(0xd8f3ff, 0x0b1622, 0.75);
      const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
      keyLight.position.set(4, 6, 5);
      this.rimLight = new THREE.DirectionalLight(0x2d7ff9, 2.1);
      this.rimLight.position.set(-5, 2, -3);
      const fillLight = new THREE.PointLight(0x7cb3ff, 1.4, 20);
      fillLight.position.set(0, -2.5, 4);

      this.scene.add(hemiLight, keyLight, this.rimLight, fillLight);
      this.available = true;
    } catch {
      this.available = false;
    }
  }

  private disposeGroup(group: THREE.Group) {
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  }

  private buildModel(type: ThreeModelId, state: ThreeRenderState): THREE.Group {
    const group = new THREE.Group();
    const primaryMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(state.color || '#d9a441'),
      metalness: state.metalness ?? 0.85,
      roughness: state.roughness ?? 0.22,
      clearcoat: 0.4,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x161922,
      metalness: 0.65,
      roughness: 0.48,
    });
    const blueGlass = new THREE.MeshPhysicalMaterial({
      color: 0x2d7ff9,
      metalness: 0.15,
      roughness: 0.12,
      transparent: true,
      opacity: 0.72,
    });
    const emeraldMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.4,
      roughness: 0.25,
    });

    if (type === 'bitcoin') {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.2, 48), primaryMat);
      coin.rotation.x = Math.PI / 2;
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.22, 48), darkMat);
      inner.rotation.x = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.065, 16, 48), primaryMat);
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.88, 0.26), primaryMat);
      bar1.position.x = -0.18;
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.06, 0.26), primaryMat);
      bar2.position.x = 0.06;
      const loopTop = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 12, 24, Math.PI), primaryMat);
      loopTop.rotation.z = -Math.PI / 2;
      loopTop.position.set(0.1, 0.2, 0.1);
      const loopBot = loopTop.clone();
      loopBot.position.set(0.14, -0.2, 0.1);
      group.add(coin, inner, rim, bar1, bar2, loopTop, loopBot);
    } else if (type === 'chart') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 0.9), darkMat);
      base.position.y = -0.85;
      group.add(base);
      [-0.75, -0.25, 0.25, 0.75].forEach((x, idx) => {
        const h = 0.65 + idx * 0.42;
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, h, 0.36),
          idx === 3 ? emeraldMat : idx === 1 ? primaryMat : blueGlass
        );
        bar.position.set(x, -0.78 + h / 2, 0);
        group.add(bar);
      });
    } else if (type === 'pillars') {
      [-0.85, 0, 0.85].forEach((x, idx) => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.3, 1.6 + idx * 0.2, 24),
          idx === 1 ? emeraldMat : primaryMat
        );
        pillar.position.set(x, -0.1, 0);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.68), darkMat);
        cap.position.set(x, 0.75 + idx * 0.1, 0);
        group.add(pillar, cap);
      });
    } else if (type === 'scale') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.0, 20), darkMat);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.12), primaryMat);
      beam.position.y = 0.85;
      beam.rotation.z = 0.12;
      const panL = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.26, 0.14, 24), blueGlass);
      panL.position.set(-0.95, 0.25, 0);
      const panR = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.26, 0.14, 24), emeraldMat);
      panR.position.set(0.95, 0.48, 0);
      group.add(mast, beam, panL, panR);
    } else {
      const core = new THREE.Mesh(new THREE.SphereGeometry(1.02, 32, 32), darkMat);
      const wireMat = new THREE.MeshBasicMaterial({
        color: 0x2d7ff9,
        wireframe: true,
        transparent: true,
        opacity: 0.45,
      });
      const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.08, 2), wireMat);
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.024, 12, 64), primaryMat);
      ring1.rotation.x = 1.1;
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.018, 10, 48), blueGlass);
      ring2.rotation.y = 0.85;
      group.add(core, wire, ring1, ring2);
    }
    return group;
  }

  public renderObject(
    modelType: ThreeModelId,
    state: ThreeRenderState,
    w: number,
    h: number
  ): HTMLCanvasElement | null {
    if (!this.available || !this.renderer || !this.scene || !this.camera) return null;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    if (this.activeObject) {
      this.scene.remove(this.activeObject);
      this.disposeGroup(this.activeObject);
      this.activeObject = undefined;
    }

    const mesh = this.buildModel(modelType, state);
    mesh.rotation.set(state.rotX, state.rotY, state.rotZ);
    mesh.position.set(0, state.posY || 0, state.posZ || 0);
    const s = state.scale3d || 1;
    mesh.scale.set(s, s, s);
    this.scene.add(mesh);
    this.activeObject = mesh;

    if (this.rimLight) {
      this.rimLight.intensity = state.blueLight ?? 2.1;
    }
    this.camera.position.set(0, state.camY || 0.35, state.camZ || 6.2);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  public dispose() {
    if (this.activeObject && this.scene) {
      this.scene.remove(this.activeObject);
      this.disposeGroup(this.activeObject);
    }
    this.envTexture?.dispose();
    this.renderer?.dispose();
  }
}

export const threeEngine = new ThreeStudioEngine();
