import * as Phaser from 'phaser';
import { isCrtEnabled, onCrtEnabledChanged } from './soundSettings';

const FILTER_NAME = 'FilterCrtChromatic';

const fragmentShader = `
#pragma phaserTemplate(shaderName)

precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uChannelOffset;

varying vec2 outTexCoord;

void main ()
{
    vec2 redCoord = clamp(outTexCoord + uChannelOffset, 0.0, 1.0);
    vec2 greenCoord = clamp(outTexCoord - uChannelOffset, 0.0, 1.0);
    vec4 center = texture2D(uMainSampler, outTexCoord);
    float red = texture2D(uMainSampler, redCoord).r;
    float green = texture2D(uMainSampler, greenCoord).g;
    gl_FragColor = vec4(red, green, center.b, center.a);
}
`;

class CrtChromaticController extends Phaser.Filters.Controller {
  public offset = 0.5;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, FILTER_NAME);
  }
}

class CrtChromaticFilter extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(FILTER_NAME, manager, undefined, fragmentShader);
  }

  override setupUniforms(controller: CrtChromaticController, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    this.programManager.setUniform('uChannelOffset', [
      controller.offset / drawingContext.width,
      0,
    ]);
  }
}

export function applyCrtFilter(scene: Phaser.Scene): void {
  if (!(scene.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  if (!scene.renderer.renderNodes.hasNode(FILTER_NAME)) {
    scene.renderer.renderNodes.addNodeConstructor(FILTER_NAME, CrtChromaticFilter);
  }
  const camera = scene.cameras.main;
  let controller: CrtChromaticController | null = null;
  const updateFilter = (enabled: boolean): void => {
    if (enabled && !controller) {
      controller = new CrtChromaticController(camera);
      camera.filters.external.add(controller);
    } else if (!enabled && controller) {
      camera.filters.external.remove(controller, true);
      controller = null;
    }
  };
  updateFilter(isCrtEnabled());
  const stopListening = onCrtEnabledChanged(updateFilter);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, stopListening);
  scene.events.once(Phaser.Scenes.Events.DESTROY, stopListening);
}
