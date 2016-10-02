"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
/**
 * To run this test file there must be a firebase database, a credentials.json
 * file and the environment variables FIREBASE_DATABASE_URL and FIREBASE_UID
 * set, where FIREBASE_UID can be anything and your rules must allow it write
 * access to metrics-in-test and metrics-out-test root nodes.
 */
const tape = require('tape-async');
const firebase = require('firebase');
const src_1 = require("../src");
const HOUR = 3600000;
const DAY = 86400000;
const TODAY = ((Date.now() / DAY) >> 0) * DAY;
const resolutions = [
    {
        name: '1sec',
        t: 1000,
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
function sleep(time) {
    return new Promise((resolve) => {
        setTimeout(() => resolve(time), time);
    });
}
function waitRefZero(ref, sleepTime = 100) {
    return __awaiter(this, void 0, void 0, function* () {
        let count = 1;
        while (count > 0) {
            count = yield ref.once('value')
                .then(s => s.numChildren());
            yield sleep(sleepTime);
        }
    });
}
function tearDown(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const inRef = app.database().ref().child('metrics-in-test');
        const outRef = app.database().ref().child('metrics-out-test');
        yield inRef.remove();
        yield outRef.remove();
    });
}
let fbcount = 0;
function setup() {
    return __awaiter(this, void 0, void 0, function* () {
        const name = `fb-${fbcount++}`;
        const app = firebase.initializeApp({
            databaseURL: process.env["FIREBASE_DATABASE_URL"],
            serviceAccount: './credentials.json',
            databaseAuthVariableOverride: {
                uid: process.env['FIREBASE_UID']
            }
        }, name);
        yield tearDown(app);
        const inRef = app.database().ref().child('metrics-in-test');
        const outRef = app.database().ref().child('metrics-out-test');
        return { app, name, inRef, outRef };
    });
}
function test(name, fn) {
    const fnWithTeardown = function (t) {
        return __awaiter(this, void 0, void 0, function* () {
            let app;
            try {
                const context = yield setup();
                app = context.app;
                yield fn(t, context);
            }
            finally {
                if (app) {
                    yield tearDown(app);
                    yield app.delete();
                }
            }
        });
    };
    return tape(name, fnWithTeardown);
}
function objToArray(obj) {
    const ary = [];
    const keys = Object.keys(obj);
    keys.forEach(key => {
        const n = Number(key);
        ary[n] = obj[key];
    });
    return ary;
}
test('countTest', function (t, { inRef, outRef }) {
    return __awaiter(this, void 0, void 0, function* () {
        const stop = src_1.startMetrics(inRef, outRef, resolutions);
        try {
            yield src_1.pushMetric(inRef, 'tag1');
            yield src_1.pushMetric(inRef, 'tag1');
            yield src_1.pushMetric(inRef, 'tag2');
            yield sleep(1000);
            yield src_1.pushMetric(inRef, 'tag2');
            yield waitRefZero(inRef);
            const outData = yield outRef.once('value')
                .then(s => s.val());
            const outRes = outData.resolutions;
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
});
//# sourceMappingURL=test.js.map