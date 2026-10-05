import test, { after, before } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-rules', firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, 'users/alice/contacts/9230011'), { name: 'Ayesha', unread: 3, phone: '9230011' });
    await setDoc(doc(d, 'users/alice/messages/m1'), { text: 'hi' });
    await setDoc(doc(d, 'users/alice/campaigns/c1'), { total: 1 });
    await setDoc(doc(d, 'users/alice/private/secrets'), { whatsappToken: 'secret' });
    await setDoc(doc(d, 'users/alice/settings/server'), { whatsapp: { connected: true } });
    await setDoc(doc(d, 'phoneNumbers/123'), { uid: 'alice' });
  });
});
after(() => env.cleanup());

const alice = () => env.authenticatedContext('alice').firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

test('you can read only your own data', async () => {
  await assertSucceeds(getDoc(doc(alice(), 'users/alice/contacts/9230011')));
  await assertSucceeds(getDoc(doc(alice(), 'users/alice/messages/m1')));
  await assertSucceeds(getDoc(doc(alice(), 'users/alice/campaigns/c1')));
  await assertSucceeds(getDoc(doc(alice(), 'users/alice/settings/server')));
  await assertFails(getDoc(doc(bob(), 'users/alice/contacts/9230011')));
  await assertFails(getDoc(doc(bob(), 'users/alice/messages/m1')));
  await assertFails(getDoc(doc(anon(), 'users/alice/contacts/9230011')));
});

test('secrets and the phone-number index are server-only', async () => {
  await assertFails(getDoc(doc(alice(), 'users/alice/private/secrets')));
  await assertFails(setDoc(doc(alice(), 'users/alice/private/secrets'), { whatsappToken: 'mine' }));
  await assertFails(getDoc(doc(alice(), 'phoneNumbers/123')));
  await assertFails(setDoc(doc(alice(), 'phoneNumbers/456'), { uid: 'alice' }));
});

test('the app cannot create or change messages, campaigns, sheets or server settings', async () => {
  await assertFails(setDoc(doc(alice(), 'users/alice/messages/m2'), { text: 'fake' }));
  await assertFails(updateDoc(doc(alice(), 'users/alice/messages/m1'), { status: 'delivered' }));
  await assertFails(deleteDoc(doc(alice(), 'users/alice/messages/m1')));
  await assertFails(updateDoc(doc(alice(), 'users/alice/campaigns/c1'), { total: 99 }));
  await assertFails(setDoc(doc(alice(), 'users/alice/sheets/s1'), { rows: 1 }));
  await assertFails(setDoc(doc(alice(), 'users/alice/settings/server'), { whatsapp: { connected: true } }));
  await assertFails(setDoc(doc(alice(), 'users/alice/contacts/new'), { name: 'x' }));
});

test('the app may only mark a chat as read', async () => {
  await assertSucceeds(updateDoc(doc(alice(), 'users/alice/contacts/9230011'), { unread: 0 }));
  await assertFails(updateDoc(doc(alice(), 'users/alice/contacts/9230011'), { unread: 5 }));
  await assertFails(updateDoc(doc(alice(), 'users/alice/contacts/9230011'), { unread: 0, name: 'Hacked' }));
  await assertFails(updateDoc(doc(bob(), 'users/alice/contacts/9230011'), { unread: 0 }));
  await assertFails(deleteDoc(doc(alice(), 'users/alice/contacts/9230011')));
});

test('settings are validated', async () => {
  const ref = () => doc(alice(), 'users/alice/settings/main');
  const ok = { mapping: { phoneCol: 'phone', patientCol: 'name', doctorCol: 'doctor' }, template: null, varCols: ['name'], autoSend: true, speed: 20, agentEnabled: false };
  await assertSucceeds(setDoc(ref(), ok));
  await assertFails(setDoc(ref(), { ...ok, speed: 500 }));
  await assertFails(setDoc(ref(), { ...ok, speed: 'fast' }));
  await assertFails(setDoc(ref(), { ...ok, autoSend: 'yes' }));
  await assertFails(setDoc(ref(), { ...ok, extra: 1 }));
  await assertFails(setDoc(doc(bob(), 'users/alice/settings/main'), ok));
});

test('profile accepts only expected fields', async () => {
  await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { name: 'Alice', email: 'a@b.c' }));
  await assertFails(setDoc(doc(alice(), 'users/alice'), { name: 'Alice', isAdmin: true }));
  await assertFails(setDoc(doc(bob(), 'users/alice'), { name: 'Bob' }));
});
