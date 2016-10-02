/**
 * To run this test file there must be a firebase database, a credentials.json
 * file and the environment variables FIREBASE_DATABASE_URL and FIREBASE_UID
 * set, where FIREBASE_UID can be anything and your rules must allow it write
 * access to metrics-in-test and metrics-out-test root nodes.
 */
import tape = require('tape-async');
import {Test} from "tape-async";
import firebase = require('firebase');
import {startMetrics, pushMetric} from "../src";

const HOUR = 3600000;
const DAY = 86400000;
const TODAY = ((Date.now() / DAY) >> 0) * DAY;

const resolutions = [
  {
    name: '1sec',
    t: 1000, // 1 minute
    keep: 86400000 // 1 day
  },
  {
    name: '1hour',
    t: HOUR,
    keep: DAY * 30
  },
  {
    name: '1day',
    t: DAY,
    keep: DAY * 365
  }
];

function sleep(time:number) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(time), time);
  })
}

async function waitRefZero(ref:firebase.database.Reference, sleepTime:number = 100) {
  let count = 1;

  while (count > 0) {
    count = await ref.once('value')
      .then(s => s.numChildren());

    await sleep(sleepTime);
  }
}

async function tearDown(app) {
  const inRef = app.database().ref().child('metrics-in-test');
  const outRef = app.database().ref().child('metrics-out-test');

  await inRef.remove();
  await outRef.remove();
}

let fbcount = 0;

async function setup() {
  const name = `fb-${fbcount++}`;

  const app = firebase.initializeApp({
    databaseURL: process.env["FIREBASE_DATABASE_URL"],
    serviceAccount: './credentials.json',
    databaseAuthVariableOverride: {
      uid: process.env['FIREBASE_UID']
    }
  }, name);

  await tearDown(app);

  const inRef = app.database().ref().child('metrics-in-test');
  const outRef = app.database().ref().child('metrics-out-test');

  return {app, name, inRef, outRef}
}

function test(name, fn) {
  const fnWithTeardown = async function(t:Test) {
    let app;

    try {
      const context = await setup();
      app = context.app;
      await fn(t, context);
    }
    finally {
      if (app) {
        await tearDown(app);
        await app.delete();
      }
    }
  };

  return tape(name, fnWithTeardown);
}

function objToArray(obj) {
  const ary:any[] = [];
  const keys = Object.keys(obj);
  keys.forEach(key => {
    const n = Number(key);
    ary[n] = obj[key];
  });
  return ary;
}

test('countTest', async function(t:Test, {inRef, outRef}) {
  const stop = startMetrics(inRef,  outRef, resolutions);

  try {
    await pushMetric(inRef, 'tag1');
    await pushMetric(inRef, 'tag1');
    await pushMetric(inRef, 'tag2');
    await sleep(1000);
    await pushMetric(inRef, 'tag2');
    await waitRefZero(inRef);

    const outData = await outRef.once('value')
      .then(s => s.val());

    const outRes = outData.resolutions as any;

    t.ok(outRes, 'has resolutions data');
    t.ok(outRes['1day'], 'has 1 day resolution');
    t.ok(outRes['1hour'], 'has 1 hour resolution');
    t.ok(outRes['1sec'], 'has 1 sec resolution');

    const sec = outRes['1sec'];
    t.equal(sec.buckets, 86400, 'has 1 bucket per second');
    t.equal(sec.keep, 86400000, 'keeps for a day');
    t.equal(sec.days[TODAY], TODAY + 86400000, 'expiry for today is correct');

    const tag1 = outData['tag:tag1'];
    const tag2 = outData['tag:tag2'];

    t.deepEqual(Object.keys(tag1), [String(TODAY)], 'tag has today only');
    t.deepEqual(Object.keys(tag1[TODAY]), ['1day', '1hour', '1sec'], 'tag1 has all resolutions');
    t.deepEqual(Object.keys(tag2[TODAY]), ['1day', '1hour', '1sec'], 'tag2 has all resolutions');

    t.equal(tag1[TODAY]['1day'][0], 2, 'tag1 count of 2 in 1day');
    t.equal(tag2[TODAY]['1day'][0], 2, 'tag2 count of 2 in 1day');

    const tag1hours = objToArray(tag1[TODAY]['1hour']);
    const tag2hours = objToArray(tag2[TODAY]['1hour']);
    t.equal(tag1hours.reduce((acc, n) => acc + n, 0), 2, 'tag1 count of 2 in 1hour');
    t.equal(tag2hours.reduce((acc, n) => acc + n, 0), 2, 'tag2 count of 2 in 1hour');

    const tag1secs = objToArray(tag1[TODAY]['1sec']);
    const tag2secs = objToArray(tag2[TODAY]['1sec']);
    t.equal(tag1secs.reduce((acc, n) => acc + n, 0), 2, 'tag1 count of 2 in 1sec');
    t.equal(tag2secs.reduce((acc, n) => acc + n, 0), 2, 'tag2 count of 2 in 1sec');
    t.equal(tag2secs.filter(v => v > 0).length, 2, 'tag2 1sec should have 2 filled in buckets');
  }
  finally {
    stop();
  }
});
