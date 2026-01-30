/**
 * Test de validation TypeScript - VNFileLoader
 * Charge les 19 fichiers VND via le parser TypeScript et vérifie
 * que le résultat correspond exactement au parser JS validé.
 *
 * Usage: ts-node scripts/test-vnd-loader.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Import direct des sources (pas du dist)
import { VNFileLoader } from '../src/engine/VNFileLoader';
import { VNDFile, VNCommandTypeNames } from '../src/types/vn.types';

const VND_DIR = path.join(__dirname, '..', 'VNP-VND');
const EXPORTS_DIR = path.join(__dirname, '..', 'exports');

const loader = new VNFileLoader();

// =============================================================================
// VALIDATION
// =============================================================================

function validateFile(filePath: string): { ok: boolean; fileName: string; result: VNDFile; details: string } {
  const fileName = path.basename(filePath);
  const buf = fs.readFileSync(filePath);
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

  const result = loader.parseVND(arrayBuffer, fileName);

  const allScenesOk = result.scenes.length === result.header.sceneCount;
  const noErrors = result.errors.length === 0;
  const noRemaining = result.bytesRemaining === 0;
  const ok = allScenesOk && noErrors && noRemaining;

  const totalCommands = result.scenes.reduce((sum, s) => sum + s.commands.length, 0);
  const totalStrings = result.scenes.reduce((sum, s) =>
    sum + s.commands.reduce((cs, c) => cs + c.strings.length, 0), 0);
  const totalPolygons = result.scenes.reduce((sum, s) =>
    sum + s.commands.reduce((cs, c) => cs + (c.paramPairs.length > 0 ? 1 : 0), 0), 0);
  const hotspotsWithTimer = result.scenes.filter(s => s.hotspot !== null).length;

  const details = `${result.header.sceneCount} scenes, ${totalCommands} cmds, ${totalStrings} strings, ${totalPolygons} polygons, ${hotspotsWithTimer} hotspots, ${result.bytesRemaining} bytes remaining`;

  return { ok, fileName, result, details };
}

function compareWithJsonExport(result: VNDFile): string[] {
  const jsonPath = path.join(EXPORTS_DIR, result.fileName.replace('.vnd', '.json'));
  if (!fs.existsSync(jsonPath)) return [`JSON export not found: ${jsonPath}`];

  const expected = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const diffs: string[] = [];

  // Comparer header
  if (result.header.sceneCount !== expected.header.sceneCount) {
    diffs.push(`sceneCount: got ${result.header.sceneCount}, expected ${expected.header.sceneCount}`);
  }
  if (result.header.projectName !== expected.header.projectName) {
    diffs.push(`projectName: got "${result.header.projectName}", expected "${expected.header.projectName}"`);
  }

  // Comparer nombre de scènes parsées
  if (result.scenes.length !== expected.scenesParsed) {
    diffs.push(`scenesParsed: got ${result.scenes.length}, expected ${expected.scenesParsed}`);
  }

  // Comparer bytes remaining
  if (result.bytesRemaining !== expected.bytesRemaining) {
    diffs.push(`bytesRemaining: got ${result.bytesRemaining}, expected ${expected.bytesRemaining}`);
  }

  // Comparer chaque scène : nom, nombre de commandes
  for (let i = 0; i < Math.min(result.scenes.length, expected.scenes.length); i++) {
    const ts = result.scenes[i];
    const js = expected.scenes[i];

    // Le JS exporte les noms vides comme "(empty)", le TS comme ""
    const jsName = js.name === '(empty)' ? '' : js.name;
    if (ts.name !== jsName) {
      diffs.push(`scene[${i}].name: got "${ts.name}", expected "${jsName}"`);
    }
    if (ts.commands.length !== js.commands.length) {
      diffs.push(`scene[${i}].commands: got ${ts.commands.length}, expected ${js.commands.length}`);
    }

    // Comparer types de commandes
    for (let j = 0; j < Math.min(ts.commands.length, js.commands.length); j++) {
      if (ts.commands[j].commandType !== js.commands[j].commandType) {
        diffs.push(`scene[${i}].cmd[${j}].type: got ${ts.commands[j].commandType}, expected ${js.commands[j].commandType}`);
      }
      if (ts.commands[j].strings.length !== js.commands[j].strings.length) {
        diffs.push(`scene[${i}].cmd[${j}].strings: got ${ts.commands[j].strings.length}, expected ${js.commands[j].strings.length}`);
      }
    }
  }

  return diffs;
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('=== VNFileLoader TypeScript Validation ===\n');

  if (!fs.existsSync(VND_DIR)) {
    console.error(`VND directory not found: ${VND_DIR}`);
    process.exit(1);
  }

  const vndFiles = fs.readdirSync(VND_DIR)
    .filter(f => f.endsWith('.vnd'))
    .sort()
    .map(f => path.join(VND_DIR, f));

  console.log(`Found ${vndFiles.length} VND files\n`);

  let totalOk = 0;
  let totalFail = 0;
  let totalDiffs = 0;

  const results: { fileName: string; ok: boolean; details: string; diffs: string[] }[] = [];

  for (const filePath of vndFiles) {
    const { ok, fileName, result, details } = validateFile(filePath);
    const diffs = compareWithJsonExport(result);

    if (ok) totalOk++;
    else totalFail++;
    totalDiffs += diffs.length;

    const status = ok && diffs.length === 0 ? 'OK' : ok ? 'DIFF' : 'FAIL';
    console.log(`[${status}] ${fileName}: ${details}`);

    if (diffs.length > 0) {
      diffs.slice(0, 5).forEach(d => console.log(`  DIFF: ${d}`));
      if (diffs.length > 5) console.log(`  ... and ${diffs.length - 5} more diffs`);
    }

    if (!ok) {
      result.errors.forEach(e => console.log(`  ERROR: ${e}`));
    }

    results.push({ fileName, ok, details, diffs });
  }

  // Résumé
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PARSE:   ${totalOk} OK, ${totalFail} FAIL out of ${vndFiles.length} files`);
  console.log(`COMPARE: ${totalDiffs} diffs with JSON exports`);
  console.log(`${'='.repeat(60)}`);

  // Statistiques globales
  const allResults = results.filter(r => r.ok);
  if (allResults.length > 0) {
    console.log(`\nAll ${totalOk} files parsed with 0 bytes remaining.`);
  }

  // Afficher un échantillon de start.vnd pour vérification visuelle
  const startResult = results.find(r => r.fileName === 'start.vnd');
  if (startResult && startResult.ok) {
    const startFile = vndFiles.find(f => f.endsWith('start.vnd'))!;
    const buf = fs.readFileSync(startFile);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const start = loader.parseVND(ab, 'start.vnd');

    console.log('\n--- Echantillon: start.vnd ---');
    console.log(`Project: ${start.header.projectName} (${start.header.editor})`);
    console.log(`Display: ${start.header.width}x${start.header.height}x${start.header.depth}`);
    console.log(`Variables: ${start.variables.length}`);
    console.log(`Scenes: ${start.scenes.length}`);
    start.scenes.forEach((s, i) => {
      const cmdNames = s.commands.map(c =>
        VNCommandTypeNames[c.commandType] || `CMD_${c.commandType}`
      );
      const hotInfo = s.hotspot
        ? ` [hotspot timer=${s.hotspot.timerValue}, ${s.hotspot.objects.length} objs]`
        : '';
      console.log(`  ${i}: "${s.name}" resource="${s.fields.resource}" cmds=[${cmdNames.join(', ')}]${hotInfo}`);
    });
  }

  process.exit(totalFail > 0 || totalDiffs > 0 ? 1 : 0);
}

main();
