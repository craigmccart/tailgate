import Phaser from 'phaser';
import { LIGHTING } from '../config/lighting';
import type { LightSource } from './LightModel';

/** Light2D lights are white; the colour of the scene comes from the surfaces. */
const SURFACE_LIGHT_COLOUR = 0xffffff;

/** Anything that can take part in Light2D has these two methods. */
type Lightable = Phaser.GameObjects.GameObject & {
  setPipeline: (name: string) => unknown;
  resetPipeline: () => unknown;
};

function isLightable(object: Phaser.GameObjects.GameObject): object is Lightable {
  const candidate = object as Partial<Lightable>;
  return (
    typeof candidate.setPipeline === 'function' && typeof candidate.resetPipeline === 'function'
  );
}

/**
 * Developer-only Phaser Light2D "surface" lighting, used to measure its frame
 * cost before Phase 24's normal maps arrive. Never built in shipped builds and
 * it changes nothing for detection. Light2D lights are not blocked by walls, so
 * this is a measurement switch, not a finished look.
 */
export class SurfaceLight {
  private readonly added: Phaser.GameObjects.Light[] = [];
  private on = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sources: readonly LightSource[],
    private readonly objects: readonly Phaser.GameObjects.GameObject[]
  ) {
    // The scene's lights plugin outlives a detain restart and stays switched
    // on unless told otherwise, so switch it off when the scene shuts down.
    // Only that: the objects are already destroyed by then, so their
    // pipelines must not be touched.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.lights.disable());
  }

  setEnabled(on: boolean): void {
    if (on === this.on) {
      return;
    }
    this.on = on;
    const { lights } = this.scene;
    if (on) {
      lights.enable();
      lights.setAmbientColor(LIGHTING.surfaceLight.ambient);
      for (const source of this.sources) {
        this.added.push(
          lights.addLight(
            source.x,
            source.y,
            source.radiusPx,
            SURFACE_LIGHT_COLOUR,
            source.intensity * LIGHTING.surfaceLight.intensityScale
          )
        );
      }
      for (const object of this.objects) {
        if (isLightable(object)) {
          object.setPipeline('Light2D');
        }
      }
      return;
    }
    for (const light of this.added) {
      lights.removeLight(light);
    }
    this.added.length = 0;
    for (const object of this.objects) {
      if (isLightable(object)) {
        object.resetPipeline();
      }
    }
    lights.disable();
  }
}
