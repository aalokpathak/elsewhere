import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Post-processing: the scene is rendered into a multisampled HDR target, bright
 * areas bloom (sun, lamps, tail lights, fluorescent tubes), and a final pass
 * tone-maps, grades and dithers the image.
 *
 * The dither/grain is tiny (about one 8-bit step) but it removes the banding
 * that smooth sky and fog gradients otherwise show.
 */
const FinalShader = {
  name: 'ElsewhereFinal',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGrain: { value: 0.012 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.03 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uSaturation;
    uniform float uContrast;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv);
      #include <tonemapping_fragment>
      vec3 c = gl_FragColor.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.18) * uContrast + 0.18;
      gl_FragColor.rgb = max(c, 0.0);
      #include <colorspace_fragment>
      float n = hash(gl_FragCoord.xy + fract(uTime) * 61.7) + hash(gl_FragCoord.yx * 1.31 + fract(uTime * 1.7) * 37.3) - 1.0;
      gl_FragColor.rgb += n * uGrain;
      gl_FragColor.a = 1.0;
    }
  `,
};

export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly final: ShaderPass;
  private readonly target: THREE.WebGLRenderTarget;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    samples: number,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
    });
    this.composer = new EffectComposer(renderer, this.target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.65, 1.0);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** `glow` 0..1: how strongly lights should bloom (higher at night / indoors). */
  setLook(glow: number, time: number): void {
    this.bloom.strength = 0.16 + glow * 0.34;
    this.bloom.radius = 0.55 + glow * 0.2;
    this.bloom.threshold = 1.02 - glow * 0.22;
    this.final.uniforms.uTime.value = time;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
    this.final.dispose();
    this.target.dispose();
  }
}
