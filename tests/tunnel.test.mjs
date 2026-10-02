import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tunnelArguments, quoteCommandPart } from '../scripts/tunnel-config.mjs';
import { execFileSync } from 'node:child_process';

test('tunnel command quotes paths safely and keeps keys out of arguments',()=>{
  const path="/tmp/a folder/it's $HOME `false` $(false)/node";
  const quoted=quoteCommandPart(path);
  assert.equal(execFileSync('/bin/sh',['-c',`printf '%s' ${quoted}`],{encoding:'utf8'}),path);
  const args=tunnelArguments({tunnelId:'tunnel_test',mode:'mock'},path);
  assert.ok(args.includes('env:CONTROL_PLANE_API_KEY'));
  assert.ok(args.includes('127.0.0.1:8087'));
  assert.ok(args[args.indexOf('--mcp.command')+1].includes("'--mock'"));
  assert.ok(!args.join(' ').includes('sk-'));
  const apple=tunnelArguments({tunnelId:'tunnel_test',mode:'apple'},path);
  assert.ok(apple[apple.indexOf('--mcp.command')+1].includes("'--apple' '--config'"));
  assert.throws(()=>quoteCommandPart('bad\npath'));
});
