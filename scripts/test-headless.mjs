/**
 * Headless smoke test for godot_operations.gd (same argv layout as MCP executeOperation).
 * Uses minimal fixture project — avoid pointing at a full game or Autoloads may hang.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const operationsGd = join(root, 'build', 'scripts', 'godot_operations.gd');
const testProject = join(root, 'test', 'fixtures', 'minimal_godot_project');

function godotExe() {
  const p = process.env.GODOT_PATH;
  if (p && existsSync(p)) return p;
  const win = 'D:\\Godot_v4.6.1-stable_win64.exe\\Godot_v4.6.1-stable_win64.exe';
  if (existsSync(win)) return win;
  throw new Error('Set GODOT_PATH to your Godot executable, or install Godot at the default path.');
}

async function runOp(operation, paramsObj) {
  const exe = godotExe();
  const paramsJson = JSON.stringify(paramsObj);
  const args = [
    '--headless',
    '--path',
    testProject,
    '--script',
    operationsGd,
    operation,
    paramsJson,
  ];
  const { stdout, stderr } = await execFileAsync(exe, args, {
    timeout: 25000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout, stderr };
}

async function main() {
  if (!existsSync(operationsGd)) {
    console.error('Missing', operationsGd, '— run: npm run build');
    process.exit(1);
  }
  if (!existsSync(join(testProject, 'project.godot'))) {
    console.error('Missing fixture project at', testProject);
    process.exit(1);
  }

  console.log('1) list_scene_nodes …');
  let out = await runOp('list_scene_nodes', { scene_path: 'res://scenes/main.tscn' });
  if (out.stderr) process.stderr.write(out.stderr);
  if (!out.stdout.includes('GODOT_MCP_JSON_RESULT:')) {
    console.error(out.stdout);
    throw new Error('list_scene_nodes: no JSON result line');
  }
  const line = out.stdout.split('\n').find((l) => l.includes('GODOT_MCP_JSON_RESULT:'));
  const json = JSON.parse(line.split('GODOT_MCP_JSON_RESULT:')[1].trim());
  if (!json.ok || !Array.isArray(json.nodes)) throw new Error('list_scene_nodes: bad payload');
  const paths = json.nodes.map((n) => n.path).sort().join(',');
  if (!paths.includes('MainRoot') || !paths.includes('MainRoot/SubNode')) {
    throw new Error('list_scene_nodes: unexpected tree: ' + paths);
  }
  console.log('   OK — nodes:', paths);

  console.log('2) get_node_properties (MainRoot) …');
  out = await runOp('get_node_properties', {
    scene_path: 'res://scenes/main.tscn',
    node_path: 'MainRoot',
    property_names: ['position', 'rotation'],
  });
  if (out.stderr) process.stderr.write(out.stderr);
  if (!out.stdout.includes('GODOT_MCP_JSON_RESULT:')) throw new Error('get_node_properties: no JSON');
  const line2 = out.stdout.split('\n').find((l) => l.includes('GODOT_MCP_JSON_RESULT:'));
  const j2 = JSON.parse(line2.split('GODOT_MCP_JSON_RESULT:')[1].trim());
  if (!j2.ok || !j2.properties) throw new Error('get_node_properties: bad payload');
  console.log('   OK — keys:', Object.keys(j2.properties).join(', '));

  console.log('All headless tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
