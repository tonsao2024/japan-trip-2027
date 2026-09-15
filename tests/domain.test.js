import test from 'node:test';
import assert from 'node:assert/strict';
import { minor, feeTotal, splitBill, schedule, tokyoMillis, summary, safeURL } from '../domain.js';
test('unequal split allocates remaining yen exactly and treats explicit zero as fixed', () => {
  assert.deepEqual(splitBill(1001, ['a','b','c'], { a: 400 }), { a:400,b:301,c:300 });
  assert.deepEqual(splitBill(11, ['a','b','c'], { a:0 }), { a:0,b:6,c:5 });
});
test('oversplit, all fixed mismatch and no participants are rejected', () => {
  assert.throws(() => splitBill(100, ['a','b'], { a:101 }));
  assert.throws(() => splitBill(100, ['a','b'], { a:30,b:30 }));
  assert.throws(() => splitBill(100, []));
});
test('currency precision and fee calculation', () => {
  assert.equal(minor('10.25','THB'),1025); assert.equal(minor('100','JPY'),100);
  assert.throws(() => minor('10.25','JPY')); assert.throws(() => minor('NaN','THB'));
  assert.throws(() => minor('-1','JPY')); assert.deepEqual(feeTotal(1001,2.5),{fee:25,total:1026});
});
test('schedule preserves travel time and can cross midnight in Tokyo', () => {
  const rows = [{id:'a',durationMin:60,travelMin:20},{id:'b',durationMin:30,travelMin:0}];
  const start = tokyoMillis('2027-02-12','23:30'); const result = schedule(rows,start);
  assert.equal(result[1].startMs,start+80*60000);
  assert.equal(new Date(result[1].startMs).toISOString(),'2027-02-12T15:50:00.000Z');
  assert.throws(() => tokyoMillis('2027-02-30','09:00'));
});
test('editing middle schedule leaves prior rows intact', () => {
  const original = schedule([{id:'a',durationMin:60,travelMin:15},{id:'b',durationMin:20,travelMin:10},{id:'c',durationMin:30,travelMin:0}],100000);
  const changed = schedule(original,20000000,1); assert.deepEqual(changed[0], original[0]); assert.equal(changed[2].startMs,20000000+30*60000);
});
test('settlement and converted personal totals conserve satang', () => {
  const result = summary([{totalMinor:101,currency:'JPY',exchangeRate:0.2377,payerId:'a',shares:{a:34,b:34,c:33},category:'food',paymentMethod:'card',cardName:'Travel'}],[{id:'a'},{id:'b'},{id:'c'}]);
  assert.equal(Object.values(result.people).reduce((n,p)=>n+p.owed,0),result.total);
  assert.equal(Object.values(result.people).reduce((n,p)=>n+p.balance,0),0);
  assert.equal(result.transfers.reduce((n,t)=>n+t.amount,0),result.people.a.balance);
  assert.equal(result.cards[0].JPY,101);
});
test('settlement conserves randomized bills, fees, currencies and uneven splits', () => {
  const members = ['a','b','c','d'].map(id=>({id})); const bills = [];
  for(let i=1;i<200;i++){ const totalMinor=i*113; bills.push({totalMinor,currency:i%2?'JPY':'THB',exchangeRate:0.234567,payerId:members[i%4].id,shares:splitBill(totalMinor,members.map(m=>m.id),{a:i}),category:'food',paymentMethod:'cash'}); }
  const s=summary(bills,members), balances=Object.fromEntries(Object.entries(s.people).map(([id,p])=>[id,p.balance]));
  for(const t of s.transfers){balances[t.from]+=t.amount;balances[t.to]-=t.amount;}
  assert.ok(Object.values(balances).every(v=>v===0));
});
test('image URLs reject active and local schemes',()=>{assert.equal(safeURL('javascript:alert(1)'), ''); assert.equal(safeURL('http://example.com/a'), ''); assert.equal(safeURL('https://example.com/a'), 'https://example.com/a');});
