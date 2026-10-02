import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createBridge, formatResult } from '../src/server.js';
import { createMockBackend, type Backend } from '../src/backend.js';
import { mockConfig, configSchema, parseOptions, loadConfig } from '../src/config.js';
import { dateToISO } from '../calendar/src/eventkit.js';
import { localBoundary } from '../messages/src/database.js';

async function memory(backend: Backend = createMockBackend(), config = mockConfig, mode: 'mock' | 'apple' = 'mock') {
  const server = createBridge(config, mode, backend);
  const client = new Client({ name: 'test', version: '1' });
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { client, close: async () => { await client.close(); await server.close(); } };
}
function data(result: unknown) {
  const content = (result as { content: { text: string }[] }).content;
  return JSON.parse(content[0].text);
}
async function denied(client: Client, name: string, args: Record<string, unknown>) {
  try { const result = await client.callTool({ name, arguments: args }); assert.equal(result.isError, true, `${name} must fail`); }
  catch (err) { assert.match(String(err), /Unknown|disabled|not found|Invalid arguments/); }
}

test('mock protocol supports all reads and clearly marks fake data', async t => {
  const { client, close } = await memory(); t.after(close);
  const list = await client.listTools();
  assert.equal(list.tools.length, 12);
  assert.ok(list.tools.every(x => x.annotations?.readOnlyHint && !x.annotations?.destructiveHint));
  assert.equal(data(await client.callTool({ name: 'bridge_status' })).data.readOnly, true);
  assert.equal(data(await client.callTool({ name: 'bridge_echo', arguments: { text: 'remote dot test' } })).data.text, 'remote dot test');
  const cases: [string, Record<string, unknown>][] = [
    ['notes_list', {account:'Demo Notes Account',folder:'Demo Notes'}],
    ['notes_search', {account:'Demo Notes Account',folder:'Demo Notes',query:'Synthetic'}],
    ['notes_get', {account:'Demo Notes Account',folder:'Demo Notes',note_id:'demo-note'}],
    ['mail_list', {account:'Demo Mail Account',mailbox:'Demo Inbox'}],
    ['mail_search', {account:'Demo Mail Account',mailbox:'Demo Inbox',query:'Demo'}],
    ['mail_get', {account:'Demo Mail Account',mailbox:'Demo Inbox',message_id:1}],
    ['calendar_list', {calendar:'Demo Calendar',from_date:'2026-10-02',to_date:'2026-10-03'}],
    ['messages_read', {chat_id:'demo-chat',from_date:'2026-10-02',to_date:'2026-10-03'}],
    ['messages_search', {chat_id:'demo-chat',query:'Synthetic'}],
  ];
  for (const [name,args] of cases) {
    const r = await client.callTool({ name, arguments: args });
    assert.ok(!r.isError, name); assert.equal(data(r).synthetic, true, name);
    assert.ok(data(r).data, name);
  }
});

test('scope, date, limit, and ID checks happen before any backend read', async t => {
  let calls = 0;
  const {client,close} = await memory({read:async () => {calls++; return [];}},mockConfig,'apple'); t.after(close);
  const cases: [string,Record<string,unknown>][] = [
    ['notes_get',{account:'other',folder:'Demo Notes',note_id:'demo-note'}],
    ['notes_list',{account:'Demo Notes Account',folder:'other'}],
    ['mail_get',{account:'other',mailbox:'Demo Inbox',message_id:1}],
    ['mail_list',{account:'Demo Mail Account',mailbox:'other'}],
    ['calendar_list',{calendar:'other',from_date:'2026-10-02',to_date:'2026-10-03'}],
    ['messages_read',{chat_id:'other',from_date:'2026-10-02',to_date:'2026-10-03'}],
    ['messages_read',{chat_id:'demo-chat',from_date:'2026-10-02',to_date:'2026-12-03'}],
    ['calendar_list',{calendar:'Demo Calendar',from_date:'2026-10-03',to_date:'2026-10-02'}],
    ['calendar_list',{calendar:'Demo Calendar',from_date:'2026-02-30',to_date:'2026-03-03'}],
    ['mail_get',{account:'Demo Mail Account',mailbox:'Demo Inbox',message_id:1.5}],
    ['notes_list',{account:'Demo Notes Account',folder:'Demo Notes',limit:26}],
    ['messages_search',{chat_id:'demo-chat',query:'test',limit:-1}],
    ['notes_list',{account:'Demo Notes Account',folder:'Demo Notes',script:'arbitrary'}],
  ];
  for (const [name,args] of cases) await denied(client,name,args);
  assert.equal(calls,0);
});

test('disabled services and all write names fail even when called directly', async t => {
  let calls=0;
  const config=configSchema.parse({version:1,notes:mockConfig.notes});
  const {client,close}=await memory({read:async()=>{calls++; return [];}},config,'apple'); t.after(close);
  assert.deepEqual((await client.listTools()).tools.map(x=>x.name),['bridge_status','bridge_scopes','notes_list','notes_search','notes_get']);
  for(const name of ['mail_get','messages_read','calendar_list','bridge_echo','send_email','send_message','create_note','update_note','delete_note','delete_folder','create_folder','move_note','append_to_note','create_event','update_event','delete_event','delete_message','move_message','mark_read','flag_message','shell','run_script']) await denied(client,name,{});
  assert.equal(calls,0);
});

test('backend errors do not leak private text and result sizes stay bounded', async t=>{
  const secret='PRIVATE_APP_CONTENT';
  const {client,close}=await memory({read:async()=>{throw new Error(secret);}},mockConfig,'apple'); t.after(close);
  const r=await client.callTool({name:'notes_get',arguments:{account:'Demo Notes Account',folder:'Demo Notes',note_id:'x'}});
  assert.equal(r.isError,true); assert.ok(!JSON.stringify(r).includes(secret));
  const large=formatResult({body:'🐻"\\'.repeat(10000)},'apple',1024);
  assert.ok(Buffer.byteLength(large.content[0].text)<=1024);
  assert.equal(data(large).truncated,true); assert.ok(!data(large).excerpt.includes('\uFFFD'));
});

test('result counts are capped even if the backend ignores the limit',async t=>{
  const {client,close}=await memory({read:async()=>Array.from({length:100},(_,id)=>({id}))}); t.after(close);
  assert.equal(data(await client.callTool({name:'notes_list',arguments:{account:'Demo Notes Account',folder:'Demo Notes',limit:2}})).data.length,2);
});

test('Apple access needs explicit mode and a real local scope file',()=>{
  assert.deepEqual(parseOptions([]),{mode:'mock',configPath:undefined});
  for(const args of [['--apple'],['--config','x'],['--apple','--mock'],['--shell'],['--apple','--config','x','--config','y']]) assert.throws(()=>parseOptions(args));
  const dir=mkdtempSync(join(tmpdir(),'apple-config-test-'));
  try {
    const path=join(dir,'config.json');
    writeFileSync(path,JSON.stringify({version:1})); assert.throws(()=>loadConfig(path));
    writeFileSync(path,JSON.stringify({version:1,calendars:['YOUR CALENDAR']})); assert.throws(()=>loadConfig(path));
    writeFileSync(path,JSON.stringify({version:1,calendars:['Chosen calendar']})); assert.deepEqual(loadConfig(path).calendars,['Chosen calendar']);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('local date boundaries keep the chosen day and use an exclusive end',()=>{
  assert.equal(dateToISO('2026-10-02'),'2026-10-02T00:00:00');
  assert.equal(dateToISO('2026-10-02T14:30:00Z'),'2026-10-02T14:30:00Z');
  assert.throws(()=>dateToISO('2026-02-30'));
  const d=localBoundary('2026-10-02'); assert.equal(d.getHours(),0); assert.equal(d.getDate(),2);
});

test('built CLI starts in mock mode over real stdio',async t=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('build/src/index.js')],stderr:'pipe'});
  const client=new Client({name:'stdio-test',version:'1'}); t.after(()=>client.close());
  await client.connect(transport);
  assert.equal(data(await client.callTool({name:'bridge_status'})).synthetic,true);
});

const writes: Record<string,Record<string,Record<string,unknown>>>= {
  notes:{create_folder:{name:'TEST'},create_note:{title:'TEST',body:'TEST',folder:'TEST'},update_note:{title:'TEST',body:'TEST'},delete_note:{title:'TEST',confirm:true},delete_folder:{name:'TEST',confirm:true},move_note:{title:'TEST',from_folder:'TEST',to_folder:'TEST'},append_to_note:{title:'TEST',content:'TEST'}},
  mail:{send_email:{to:'nobody@example.invalid',subject:'TEST',body:'TEST'},move_message:{message_id:1,from_mailbox:'TEST',from_account:'TEST',to_mailbox:'TEST'},mark_read:{message_id:1,mailbox:'TEST',account:'TEST',read:true},delete_message:{message_id:1,mailbox:'TEST',account:'TEST'},flag_message:{message_id:1,mailbox:'TEST',account:'TEST',flagged:true}},
  messages:{send_message:{to:'nobody@example.invalid',text:'TEST'}},
  calendar:{create_event:{summary:'TEST',calendar:'TEST',start_date:'2026-10-02',end_date:'2026-10-03'},update_event:{summary:'TEST',calendar:'TEST',new_summary:'TEST'},delete_event:{summary:'TEST',calendar:'TEST',confirm:true}},
};
for(const [app,tools] of Object.entries(writes)) test(`${app} --read-only rejects every write via stdio without running AppleScript`,async t=>{
  const dir=mkdtempSync(join(tmpdir(),'no-apple-access-'));
  // Even a regression cannot reach Apple apps during this test.
  writeFileSync(join(dir,'osascript'),'#!/bin/sh\necho UNEXPECTED_APP_ACCESS >&2\nexit 90\n',{mode:0o700});
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve(`build/${app}/src/index.js`),'--read-only'],env:{PATH:dir},stderr:'pipe'});
  let stderr=''; transport.stderr?.on('data',chunk=>{stderr+=chunk.toString();});
  const client=new Client({name:'write-denial-test',version:'1'}); t.after(()=>client.close());
  await client.connect(transport);
  const list=await client.listTools(); assert.ok(list.tools.length>0);
  for(const [name,args] of Object.entries(tools)) {assert.ok(!list.tools.some(x=>x.name===name)); await denied(client,name,args);}
  assert.ok(!stderr.includes('UNEXPECTED_APP_ACCESS'));
});
