import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path=new URL('../web-run/assets/sky-sentinel.glb',import.meta.url);
function glbJson(buffer){
  assert.equal(buffer.toString('ascii',0,4),'glTF');
  assert.equal(buffer.readUInt32LE(4),2);
  const length=buffer.readUInt32LE(12),type=buffer.toString('ascii',16,20);
  assert.equal(type,'JSON');
  return JSON.parse(buffer.toString('utf8',20,20+length).trim());
}

test('Blender-generated Sky Sentinel is a hierarchical giant-enemy asset',()=>{
  const bytes=fs.readFileSync(path);assert.ok(bytes.byteLength>300_000);
  const json=glbJson(bytes);const names=new Set((json.nodes??[]).map(node=>node.name));
  for(const name of ['SkySentinel','Head','LeftArm','RightArm','LeftLeg','RightLeg','BackThrusters','WeakPointCore','ReactorCore'])assert.ok(names.has(name),name);
  const root=(json.nodes??[]).find(node=>node.name==='SkySentinel');
  assert.equal(root?.extras?.enemyClass,'aerial_titan');
  assert.equal(root?.extras?.weakPointNode,'ReactorCore');
  assert.equal(root?.extras?.nominalHeightMeters,69);
  assert.equal(root?.extras?.nominalWidthMeters,60);
  assert.equal(root?.extras?.modelScale,3);
  assert.deepEqual(root?.scale,[3,3,3]);
});
