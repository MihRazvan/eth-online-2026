import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

test('retained upstream binary, protobufs and license match recorded SHA256 pins',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../upstream/SOURCE.json',import.meta.url),'utf8'));
 for(const [path,source] of Object.entries(manifest.files)){
  const bytes=readFileSync(new URL(`../upstream/${path}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,path);
 }
});
