// Explicit sandbox. This module never imports Firebase or writes to the live project.
export const isDemo = true;
const key = 'fuji:demo-v1';
const members = [{ id: 'may', name: 'เมย์' }, { id: 'bank', name: 'แบงค์' }, { id: 'ploy', name: 'พลอย' }, { id: 'ton', name: 'ต้น' }];
const day = '2027-02-12';
const seed = { settings: { title: 'Japan, together.', exchangeRate: 0.24, members, scheduleVersion: 0, revision: 1 }, plans: [
  { id: 'p1', title: 'กาแฟเช้า • ริมทะเลสาบ', location: 'Lake Kawaguchi', day, order: 0, startMs: Date.parse(day + 'T09:00:00+09:00'), durationMin: 60, travelMin: 30, lat: 35.517, lng: 138.751, notes: 'เริ่มวันช้า ๆ พร้อมวิวภูเขาไฟฟูจิ', imageUrl: '', revision: 1 },
  { id: 'p2', title: 'เก็บภาพฟูจิที่เจดีย์แดง', location: 'Chureito Pagoda', day, order: 1, startMs: Date.parse(day + 'T10:30:00+09:00'), durationMin: 90, travelMin: 30, lat: 35.501, lng: 138.801, notes: 'เตรียมรองเท้าเดินสบาย และเสื้อกันหนาว', imageUrl: '', revision: 1 },
  { id: 'p3', title: 'มื้อกลางวัน • โฮโตะร้อน ๆ', location: 'Kawaguchiko', day, order: 2, startMs: Date.parse(day + 'T12:30:00+09:00'), durationMin: 60, travelMin: 0, lat: 35.498, lng: 138.768, notes: 'อาหารท้องถิ่นของยามานาชิ', imageUrl: '', revision: 1 }
].map(p => ({ ...p, endMs: p.startMs + p.durationMin * 60000 })), costs: [
  { id: 'c1', title: 'รถไฟไปคาวากุจิโกะ', planId: null, category: 'transport', currency: 'JPY', baseMinor: 16000, feePercent: 0, feeMinor: 0, totalMinor: 16000, exchangeRate: 0.24, payerId: 'bank', paymentMethod: 'cash', cardName: '', shares: { may: 4000, bank: 4000, ploy: 4000, ton: 4000 }, fixedShares: {}, receiptUrl: '', receiptPath: '', revision: 1 },
  { id: 'c2', title: 'ที่พักคืนแรก', planId: null, category: 'stay', currency: 'JPY', baseMinor: 32000, feePercent: 2.5, feeMinor: 800, totalMinor: 32800, exchangeRate: 0.24, payerId: 'may', paymentMethod: 'card', cardName: 'Travel card', shares: { may: 8200, bank: 8200, ploy: 8200, ton: 8200 }, fixedShares: {}, receiptUrl: '', receiptPath: '', revision: 1 }
] };
let state;
try { state = JSON.parse(localStorage.getItem(key)) || structuredClone(seed); } catch { state = structuredClone(seed); }
let listener, authCallback;
const publish = () => { localStorage.setItem(key, JSON.stringify(state)); listener?.settings(structuredClone(state.settings)); listener?.plans(structuredClone(state.plans), { fromCache: false }); listener?.costs(structuredClone(state.costs), { fromCache: false }); };
window.addEventListener('storage', e => { if (e.key === key && e.newValue) { state = JSON.parse(e.newValue); publish(); } });
export function watchAuth(callback) { authCallback = callback; queueMicrotask(() => callback({ uid: 'demo', email: 'demo@example.com' })); return () => { authCallback = null; }; }
export async function login() { authCallback?.({ uid: 'demo', email: 'demo@example.com' }); }
export async function logout() { authCallback?.(null); }
export async function roleFor() { return 'admin'; }
export async function secondary(password) { if (password !== 'demo1234') throw Error('รหัสผ่านทดลองคือ demo1234'); }
export function subscribe(callbacks) { listener = callbacks; queueMicrotask(publish); return [() => { listener = null; }]; }
export const newId = () => crypto.randomUUID();
export async function saveSchedule(rows, removedIds, version) {
  if (state.settings.scheduleVersion !== version) throw Error('ตารางเวลาเปลี่ยนแล้ว ลองใหม่');
  state.plans = rows.map(p => ({ ...p, revision: (p.revision || 0) + 1 })); state.settings.scheduleVersion++; publish();
}
export async function saveCost(row) {
  const old = state.costs.find(c => c.id === row.id);
  if ((old?.revision || 0) !== (row.revision || 0)) throw Error('รายการเปลี่ยนแล้ว');
  state.costs = [...state.costs.filter(c => c.id !== row.id), { ...row, revision: (row.revision || 0) + 1 }]; publish();
}
export async function removeCost(row) { state.costs = state.costs.filter(c => c.id !== row.id); publish(); }
export async function saveSettings(patch, revision) { if (state.settings.revision !== revision) throw Error('ตั้งค่าเปลี่ยนแล้ว'); Object.assign(state.settings, patch, { revision: revision + 1 }); publish(); }
export async function uploadImage() { throw Error('อัปโหลดรูปได้เมื่อเชื่อมต่อ Firebase จริง'); }
export async function discardUpload() {}
