import * as THREE from 'three';
import { shellPars, shellCompute, outlineFragPars, outlineFragCut } from './chunks';

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
/** Sun direction (world, normalized) shared by every toon material — drives
 * the warm-light/cool-shadow tint. Updated once per frame by the demo. */
export const sunDirUniform: THREE.IUniform<THREE.Vector3> = {
  value: new THREE.Vector3(0.5, 0.8, 0.4),
};

function injectShell(
  material: THREE.Material,
  uniforms: Record<string, THREE.IUniform>,
  opts: { colored?: boolean; discardBuried?: boolean; defines?: string[]; cacheKey: string },
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const defs = (opts.defines ?? []).map((d) => `#define ${d}`).join('\n');
    // The shell runs once at the top of main() into globals; the stock
    // chunks (which may sit inside #ifdef blocks per material) become
    // trivial assignments from those globals.
    shader.vertexShader = (defs + '\n' + shellPars + '\n' + shader.vertexShader)
      .replace('void main() {', 'void main() {\n' + shellCompute)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = sNrm;')
      .replace('#include <begin_vertex>', 'vec3 transformed = sPos;');
    if (opts.colored) {
      shader.fragmentShader =
        'varying vec3 vShellColor;\n' +
        shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            '#include <color_fragment>\n  diffuseColor.rgb *= vShellColor;',
          )
          // Cool rim on the silhouette — cheap depth cue that sells the toon look.
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
  {
    float rim = pow(1.0 - clamp(dot(normalize(vViewPosition), normalize(vNormal)), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += vShellColor * rim * 0.22 + vec3(0.04, 0.05, 0.08) * rim;
  }`,
          )
          // Warm-light / cool-shadow: pull the shade side toward violet
          // instead of gray. Applied to outgoing light just before output.
          .replace(
            '#include <opaque_fragment>',
            `{
    float sNdl = dot(normalize(vNormal), normalize(uSunDir));
    outgoingLight *= mix(vec3(0.76, 0.75, 0.96), vec3(1.0), smoothstep(0.02, 0.38, sNdl));
  }
  #include <opaque_fragment>`,
          );
      shader.fragmentShader = 'uniform vec3 uSunDir;\n' + shader.fragmentShader;
      shader.uniforms.uSunDir = sunDirUniform;
    }
    if (opts.discardBuried) {
      shader.fragmentShader =
        outlineFragPars +
        shader.fragmentShader.replace('void main() {', 'void main() {\n' + outlineFragCut);
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
  injectShell(
    outline,
    { ...uniforms, uSurfOffset: outlineWidth, uBurialCut: { value: 0.01 } },
    { discardBuried: true, defines: ['SHELL_NO_NORMAL', 'SHELL_NO_COLOR'], cacheKey: 'shell-outline' },
  );

  // Shadow passes must see the same deformed silhouette as the beauty pass —
  // but they run the cheap variant (1 Newton step, no normal/color chains).
  const fastDefs = ['SHELL_FAST', 'SHELL_NO_NORMAL', 'SHELL_NO_COLOR'];
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  injectShell(depth, { ...uniforms, uSurfOffset: surfZero }, { defines: fastDefs, cacheKey: 'shell-depth' });

  const distance = new THREE.MeshDistanceMaterial();
  injectShell(distance, { ...uniforms, uSurfOffset: surfZero }, { defines: fastDefs, cacheKey: 'shell-distance' });

  return { main, outline, depth, distance, outlineWidth };
}
