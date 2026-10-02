import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readChatMessages, localBoundary } from '../messages/src/database.js';

const appleDate=(day:string)=>(BigInt(localBoundary(day).getTime())-978307200000n)*1000000n;
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chat (ROWID INTEGER PRIMARY KEY,chat_identifier TEXT);
    CREATE TABLE handle (ROWID INTEGER PRIMARY KEY,id TEXT);
    CREATE TABLE message (ROWID INTEGER PRIMARY KEY,text TEXT,attributedBody BLOB,is_from_me INTEGER,date INTEGER,service TEXT,handle_id INTEGER);
    CREATE TABLE chat_message_join (chat_id INTEGER,message_id INTEGER);
    INSERT INTO chat VALUES (1,'allowed'),(2,'other');`);
  const insert=db.prepare('INSERT INTO message VALUES (?, ?, NULL, 0, ?, ?, NULL)');
  const join=db.prepare('INSERT INTO chat_message_join VALUES (?, ?)');
  const start=appleDate('2026-10-02'),end=appleDate('2026-10-03');
  for(const [id,date,chat] of [[1,start-1n,1],[2,start,1],[3,end-1n,1],[4,end,1],[5,start,2]] as const){
    insert.run(id,`synthetic ${id}`,date,'iMessage'); join.run(chat,id);
  }
  return db;
}
test('Messages reads honor the selected chat and exact exclusive date boundary',()=>{
  const rows=readChatMessages(fixture(),'allowed',25,'2026-10-02','2026-10-03');
  assert.deepEqual(rows.map(x=>x.rowid),[3,2]);
});
test('Messages reads return only the requested count',()=>{
  const rows=readChatMessages(fixture(),'allowed',1,'2026-10-02','2026-10-03');
  assert.deepEqual(rows.map(x=>x.rowid),[3]);
});
