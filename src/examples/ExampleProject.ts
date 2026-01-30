/**
 * Exemple d'utilisation de VN-Studio
 *
 * Montre comment charger un fichier VND et interagir avec le moteur.
 */

import { createVNEngine } from '../engine';

/**
 * Exemple: charger un fichier VND et afficher les scènes
 */
export async function exampleLoadVND(vndBuffer: ArrayBuffer): Promise<void> {
  const engine = createVNEngine({
    debug: true,
    autoStart: true,
  }, {
    onStateChange: (state) => {
      console.log(`Engine state: ${state}`);
    },
    onSceneChange: (scene, index) => {
      console.log(`Scene ${index}: "${scene.name}" resource="${scene.fields.resource}"`);
      console.log(`  Commands: ${scene.commands.length}`);
      console.log(`  Hotspot: ${scene.hotspot ? `timer=${scene.hotspot.timerValue}` : 'none'}`);
    },
    onError: (error) => {
      console.error('Engine error:', error);
    },
  });

  // Charger le VND
  const project = await engine.loadVND(vndBuffer, 'example.vnd');

  console.log(`Loaded: ${project.header.projectName}`);
  console.log(`  ${project.scenes.length} scenes, ${project.variables.length} variables`);
  console.log(`  Display: ${project.header.width}x${project.header.height}x${project.header.depth}`);

  // Naviguer
  engine.goToScene(0);

  // Accéder aux variables
  const store = engine.getVariableStore();
  console.log(`Variable "SCORE": ${store.get('SCORE')}`);
  store.set('SCORE', 42);
}
