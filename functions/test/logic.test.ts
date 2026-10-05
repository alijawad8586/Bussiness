import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.js';
import { classifyWaError } from '../src/waErrors.js';
import { detectIntent, cleanReply } from '../src/agentSafety.js';
import { verifySignature } from '../src/webhook.js';
import { assertSafeBaseUrl } from '../src/aiClient.js';
import { cleanParam } from '../src/whatsapp.js';
import crypto from 'node:crypto';

test('phone numbers are normalised to WhatsApp format', () => {
  const ok = (raw: unknown) => { const r = normalizePhone(raw); assert.ok(r.ok, String(raw)); return (r as any).digits; };
  assert.equal(ok('0300-1234567'), '923001234567');
  assert.equal(ok('+92 321 7788990'), '923217788990');
  assert.equal(ok('923334561230'), '923334561230');
  assert.equal(ok('300 1234567'), '923001234567');
  assert.equal(ok('0092 300 1234567'), '923001234567');
  assert.equal(ok(923001234567), '923001234567');
  assert.equal(ok('9.23001234567E11'), '923001234567');
  assert.equal(normalizePhone('').ok, false);
  assert.equal(normalizePhone('abc').ok, false);
  assert.equal(normalizePhone('12345').ok, false);
  assert.equal(normalizePhone('1'.repeat(20)).ok, false);
});

test('WhatsApp errors are classified', () => {
  const k = (code: number, httpStatus = 400) => classifyWaError({ code, message: 'm', httpStatus }).kind;
  assert.equal(k(190, 401), 'auth');
  assert.equal(k(131026), 'not_on_whatsapp');
  assert.equal(k(132001), 'template');
  assert.equal(k(131047), 'window');
  assert.equal(k(130429), 'transient');
  assert.equal(k(0, 0), 'transient');
  assert.equal(k(999, 503), 'transient');
  assert.equal(k(131030), 'permanent');
  assert.equal(k(999, 400), 'permanent');
});

test('agent safety intents', () => {
  assert.equal(detectIntent('STOP'), 'stop');
  assert.equal(detectIntent(' stop. '), 'stop');
  assert.equal(detectIntent('start'), 'start');
  assert.equal(detectIntent('I have chest pain'), 'emergency');
  assert.equal(detectIntent('When is my appointment?'), null);
  assert.equal(detectIntent('please do not stop calling'), null);
  assert.ok(cleanReply('x'.repeat(2000)).length <= 900);
});

test('webhook signature check', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifySignature(body, sig, 'secret'), true);
  assert.equal(verifySignature(body, sig.replace(/.$/, '0'), 'secret'), false);
  assert.equal(verifySignature(body, undefined, 'secret'), false);
  assert.equal(verifySignature(body, undefined, ''), true); // no secret configured
});

test('custom AI addresses cannot point inside the network', () => {
  assert.throws(() => assertSafeBaseUrl('http://example.com/v1'));
  assert.throws(() => assertSafeBaseUrl('https://localhost/v1'));
  assert.throws(() => assertSafeBaseUrl('https://169.254.169.254/'));
  assert.throws(() => assertSafeBaseUrl('https://10.0.0.5/v1'));
  assert.equal(assertSafeBaseUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1');
});

test('template values are cleaned for WhatsApp', () => {
  assert.equal(cleanParam('a\nb\t  c'), 'a b c');
  assert.equal(cleanParam('   '), '-');
});
