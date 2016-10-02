"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const ramda_1 = require('ramda');
const DAY = 86400000;
const HOUR = 3600000;
function sanitizeTag(tag) {
    return 'tag:' + tag.trim().replace(/[^A-Za-z-_0-9]/, '-');
}
function getVal(s) {
    return s.val();
}
function _numBuckets(resolution) {
    if (resolution > DAY) {
        return 1;
    }
    return Math.ceil(DAY / resolution);
}
const numBuckets = ramda_1.memoize(_numBuckets);
const defaultResolutions = [
    {
        name: '1min',
        t: 60 * 1000,
        keep: DAY,
    },
    {
        name: '10min',
        t: 60 * 1000 * 10,
        keep: 7 * DAY,
    },
    {
        name: '1hour',
        t: 60 * 1000 * 60,
        keep: 30 * DAY,
    },
    {
        name: '1day',
        t: DAY,
    },
];
function getDay(timestamp) {
    return ((timestamp / DAY) >> 0) * DAY;
}
function resolutionRef(outRef, resolution) {
    return outRef.child('resolutions').child(resolution.name);
}
/**
 * Lock the metric record. To do this we transaction the aggregate field.
 * If we can write a date to the field then we've succeeded, otherwise we
 * return which aborts the transaction
 *
 * @param currentData
 * @returns {number | void}
 */
function transactAggregate(currentData) {
    if (currentData === null) {
        return Date.now();
    }
    else {
        return;
    }
}
/**
 * Increment the value by 1
 * @param {number} value
 * @returns {number}
 */
function transactIncrement(value) {
    return (value || 0) + 1;
}
/**
 * @note Must be bound to an object with the keys {ref, dataSnapshot,
  * outRef, resolutions}
 *
 * @param error
 * @param committed
 */
function storeMetric(error, committed) {
    if (error) {
        return;
    }
    if (!committed) {
        return;
    } // Aborted
    const metric = this.dataSnapshot.val();
    const tag = sanitizeTag(metric.tag);
    const timestamp = metric.timestamp;
    const day = getDay(timestamp);
    const ms = timestamp % DAY;
    const tagRef = this.outRef.child(tag);
    const dayRef = tagRef.child(String(day));
    for (let resolution of this.resolutions) {
        const resRef = dayRef.child(resolution.name);
        const buckets = numBuckets(resolution.t);
        const bucket = (ms / DAY * buckets) >> 0;
        resRef.child(String(bucket)).transaction(transactIncrement);
    }
    this.outRef.child('tags').child(tag).set(day);
    this.ref.remove();
}
function processMetric(dataSnapshot) {
    const ref = dataSnapshot.ref;
    const context = {
        ref,
        outRef: this.outRef,
        resolutions: this.resolutions,
        dataSnapshot
    };
    const boundStoreMetric = storeMetric.bind(context);
    ref.child('aggregate').transaction(transactAggregate, boundStoreMetric, false);
}
function updateResolutionDays() {
    const day = getDay(Date.now());
    for (let resolution of this.resolutions) {
        const ref = resolutionRef(this.outRef, resolution);
        const buckets = numBuckets(resolution.t);
        ref.child('buckets').set(buckets);
        if (resolution.keep) {
            ref.child('keep').set(resolution.keep);
            ref.child('days').transaction(data => ramda_1.assoc(String(day), day + resolution.keep, data || {}));
        }
    }
}
/**
 * Clean up stale aggregations. Once we've moved beyond the resolution keep
 * time we can safely delete the resolution tree under each tag.
 */
function removeAggregations() {
    return __awaiter(this, void 0, void 0, function* () {
        const now = Date.now();
        const today = getDay(now);
        const resolutions = yield this.outRef.child('resolutions')
            .once('value')
            .then(getVal);
        const tags = yield this.outRef.child('tags')
            .once('value')
            .then(getVal)
            .then(ramda_1.keys);
        const names = ramda_1.keys(resolutions);
        for (let name of names) {
            const resolution = resolutions[name];
            if (!resolution.days) {
                continue;
            }
            const days = ramda_1.keys(resolution.days).map(Number)
                .filter(day => day < today);
            for (let day of days) {
                const dayK = resolution.days[day];
                if (dayK > now) {
                    continue;
                }
                for (let tag of tags) {
                    this.outRef.child(tag).child(String(day)).child(name).remove();
                }
                this.outRef.child('resolutions').child(name).child('days')
                    .transaction(data => ramda_1.dissoc(String(day), data));
            }
        }
    });
}
/**
 * Push a metric to an inbox location
 *
 * @param inRef A location in firebase
 * @param tag A tag for the data
 * @returns {Promise}
 */
function pushMetric(inRef, tag) {
    const timestamp = Date.now();
    const values = { timestamp, tag };
    return inRef.push(values);
}
exports.pushMetric = pushMetric;
/**
 * Start a process that looks at a metric inbox location in firebase and
 * aggregates the values there into the out location according to the given
 * resolutions
 *
 * @param inRef The place in firebase where you've pushed metric data (using pushMetric)
 * @param outRef The place in firebase to store the metric data
 * @param resolutions Array of resolutions to store
 * @return function that when called stops the metric collection process
 */
function startMetrics(inRef, outRef, resolutions = defaultResolutions) {
    const context = { inRef, outRef, resolutions };
    const boundProcessMetric = processMetric.bind(context);
    const boundUpdateResolutionDays = updateResolutionDays.bind(context);
    const boundRemoveAggregations = removeAggregations.bind(context);
    const updateTimer = setInterval(boundUpdateResolutionDays, HOUR);
    boundUpdateResolutionDays();
    const removeTimer = setInterval(boundRemoveAggregations, 12 * HOUR);
    boundRemoveAggregations();
    inRef.on('child_added', boundProcessMetric, error => {
        console.error('Metrics error', error);
        clearInterval(updateTimer);
        clearInterval(removeTimer);
    });
    return function () {
        inRef.off('child_added', boundProcessMetric);
        clearInterval(updateTimer);
        clearInterval(removeTimer);
    };
}
exports.startMetrics = startMetrics;
//# sourceMappingURL=index.js.map