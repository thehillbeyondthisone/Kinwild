import * as THREE from 'three';
import { shellPars, shellCompute } from './chunks';

export interface ShellUniforms {
  uPrimPosK: THREE.IUniform<Float32Array>;
  uPrimQuat: THREE.IUniform<Float32Array>;
  uPrimScale: THREE.IUniform<Float32Array>;
  uPrimParams: THREE.IUniform<Float32Array>;
  uPrimColor: THREE.IUniform<Float32Array>;
  uPrimInfl: THREE.IUniform<Int32Array>;
  uTuck: THREE.IUniform<THREE.Vector3>;
  uGradEps: THREE.IUniform<number>;
  [key: string]: THREE.IUniform;
}

/**
 * Injects the blend-shell vertex pipeline into any built-in material.
 * Materials with a normal pipeline (toon) get the SDF gradient as their
 * object normal; normal-less passes (depth/distance/outline) just get the
 * projected position. `colored` multiplies the chained SDF albedo into
 * diffuse.
 */
function injectShell(
  material: THREE.Material,
  uniforms: Record<string, THREE.IUniform>,
  opts: { colored?: boolean; cacheKey: string },
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    // The shell runs once at the top of main() into globals; the stock
    // chunks (which may sit inside #ifdef blocks per material) become
    // trivial assignments from those globals.
    shader.vertexShader = (shellPars + '\n' + shader.vertexShader)
      .replace('void main() {', 'void main() {\n' + shellCompute)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = sNrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = sPos;');
    if (opts.colored) {
      shader.fragmentShader =
        'varying vec3 vShellColor;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb *= vShellColor;',
        );
    }
  };
  material.customProgramCacheKey = () => opts.cacheKey;
}

let toonGradient: THREE.DataTexture | null = null;
/** 3-step gradient map shared by every toon material. */
export function getToonGradient(): THREE.DataTexture {
  if (!toonGradient) {
    const steps = new Uint8Array([110, 170, 255]);
    toonGradient = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
    toonGradient.minFilter = THREE.NearestFilter;
    toonGradient.magFilter = THREE.NearestFilter;
    toonGradient.needsUpdate = true;
  }
  return toonGradient;
}

export interface ShellMaterialSet {
  main: THREE.MeshToonMaterial;
  outline: THREE.MeshBasicMaterial;
  depth: THREE.MeshDepthMaterial;
  distance: THREE.MeshDistanceMaterial;
  /** Per-set uniform driving the outline hull offset (world units). */
  outlineWidth: THREE.IUniform<number>;
}

export function makeShellMaterials(
  uniforms: ShellUniforms,
  opts: { outlineColor?: THREE.ColorRepresentation; outlineWidth?: number } = {},
): ShellMaterialSet {
  const surfZero = { value: 0 };
  const outlineWidth = { value: opts.outlineWidth ?? 0.02 };

  const main = new THREE.MeshToonMaterial({ gradientMap: getToonGradient() });
  injectShell(main, { ...uniforms, uSurfOffset: surfZero }, { colored: true, cacheKey: 'shell-toon' });

  const outline = new THREE.MeshBasicMaterial({
    color: opts.outlineColor ?? 0x1a1c2c,
    side: THREE.BackSide,
  });
  injectShell(outline, { ...uniforms, uSurfOffset: outlineWidth }, { cacheKey: 'shell-outline' });

  // Shadow passes must see the same deformed silhouette as the beauty pass.
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  injectShell(depth, { ...uniforms, uSurfOffset: surfZero }, { cacheKey: 'shell-depth' });

  const distance = new THREE.MeshDistanceMaterial();
  injectShell(distance, { ...uniforms, uSurfOffset: surfZero }, { cacheKey: 'shell-distance' });

  return { main, outline, depth, distance, outlineWidth };
}
