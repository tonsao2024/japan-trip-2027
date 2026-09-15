import { db, auth, storage } from './firebase-config.js';
import { collection, doc, onSnapshot, runTransaction, serverTimestamp, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, reauthenticateWithCredential, EmailAuthProvider } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const settingsRef = doc(db, 'settings', 'trip');
export const isDemo = false;
export const watchAuth = callback => onAuthStateChanged(auth, callback);
export const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export async function roleFor(user) { return (await getDoc(doc(db, 'members', user.uid))).data()?.role || 'none'; }
export async function secondary(password) {
  if (!auth.currentUser?.email) throw Error('กรุณาเข้าสู่ระบบใหม่');
  await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password));
  await auth.currentUser.getIdToken(true);
}
export function subscribe({ plans, costs, settings, error }) {
  return [
    onSnapshot(collection(db, 'plans'), { includeMetadataChanges: true }, s => plans(s.docs.map(d => ({ ...d.data(), id: d.id })), s.metadata), error),
    onSnapshot(collection(db, 'costs'), { includeMetadataChanges: true }, s => costs(s.docs.map(d => ({ ...d.data(), id: d.id })), s.metadata), error),
    onSnapshot(settingsRef, s => settings(s.exists() ? s.data() : null), error)
  ];
}
export function newId(kind) { return doc(collection(db, kind)).id; }
function assertRevision(snapshot, expected) {
  if ((snapshot.exists() ? snapshot.data().revision : 0) !== expected) throw Error('มีเพื่อนแก้ไขรายการนี้แล้ว กรุณาปิดและเปิดรายการใหม่');
}
// Global version serializes plan additions, edits, moves and deletions across clients.
// Reading every supplied document also verifies that the UI snapshot is still current.
export async function saveSchedule(rows, removedIds, expectedVersion) {
  if (rows.length + removedIds.length > 450) throw Error('แผนมีจำนวนมากเกินขีดจำกัด 450 รายการ');
  await runTransaction(db, async tx => {
    const config = await tx.get(settingsRef);
    if (!config.exists() || config.data().scheduleVersion !== expectedVersion) throw Error('ตารางเวลาเปลี่ยนแล้ว รอซิงก์และลองใหม่');
    const refs = rows.map(p => doc(db, 'plans', p.id));
    const snapshots = await Promise.all(refs.map(r => tx.get(r)));
    snapshots.forEach((s, i) => assertRevision(s, rows[i].revision || 0));
    rows.forEach((row, i) => {
      const { id, ...data } = row;
      tx.set(refs[i], { ...data, revision: (row.revision || 0) + 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    });
    removedIds.forEach(id => tx.delete(doc(db, 'plans', id)));
    tx.update(settingsRef, { scheduleVersion: expectedVersion + 1 });
  });
}
export async function saveCost(row) {
  const reference = doc(db, 'costs', row.id);
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(reference); assertRevision(snapshot, row.revision || 0);
    const { id, ...data } = row;
    tx.set(reference, { ...data, revision: (row.revision || 0) + 1, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
  });
}
export async function removeCost(row) {
  await runTransaction(db, async tx => {
    const reference = doc(db, 'costs', row.id), snapshot = await tx.get(reference);
    assertRevision(snapshot, row.revision); tx.delete(reference);
  });
}
export async function saveSettings(patch, expectedRevision) {
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(settingsRef);
    assertRevision(snapshot, expectedRevision);
    tx.update(settingsRef, { ...patch, revision: expectedRevision + 1, updatedAt: serverTimestamp() });
  });
}
export async function uploadImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('ใช้ JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB');
  const path = `images/${auth.currentUser.uid}/${crypto.randomUUID()}`;
  const reference = ref(storage, path);
  await uploadBytes(reference, file, { contentType: file.type });
  try { return { path, url: await getDownloadURL(reference) }; }
  catch (error) { await deleteObject(reference).catch(() => {}); throw error; }
}
export const discardUpload = path => deleteObject(ref(storage, path));
