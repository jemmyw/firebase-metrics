import * as firebase from 'firebase';
import {memoize, assoc, dissoc, keys} from 'ramda'

type DataSnapshot = firebase.database.DataSnapshot;
type Reference = firebase.database.Reference;

export interface MetricData {
  timestamp: number
  tag: string
  count?: number
  value?: number
}

export interface Resolution {
  name: string
  t: number
  keep?: number
}

interface StoredResolution {
  buckets: number
  days: {[day: string]: number}
  keep?: number
}

interface MetricContext {
  inRef: Reference;
  outRef: Reference;
  resolutions: Resolution[];
}

interface PushContext {
  ref: Reference;
  outRef: Reference;
  resolutions: Resolution[];
  dataSnapshot: DataSnapshot;
}

const DAY = 86400000;
const HOUR = 3600000;

function sanitizeTag(tag: string): string {
  return 'tag:' + tag.trim().replace(/[^A-Za-z-_0-9]/, '-');
}

function getVal(s: DataSnapshot) {
  return s.val()
}

function _numBuckets(resolution: number) {
  if (resolution > DAY) {
    return 1
  }
  return Math.ceil(DAY / resolution)
}
const numBuckets = memoize(_numBuckets);

const defaultResolutions: Resolution[] = [
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

function getDay(timestamp: number): number {
  return ((timestamp / DAY) >> 0) * DAY;
}

function resolutionRef(outRef: Reference, resolution: Resolution): Reference {
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
    return Date.now()
  } else {
    return
  }
}

/**
 * Return an incrementer than increments by count
 * @param count
 * @returns {(value:number)=>number}
 */
function transactIncrement(count:number = 1) {
  return function(value: number): number {
    return (value || 0) + count;
  }
}

function storeCountMetric(resolutions, dayRef, ms, metric) {
  const count = metric.count || 1;
  const incrementer = transactIncrement(count);

  for (let resolution of resolutions) {
    const resRef = dayRef.child(resolution.name);
    const buckets = numBuckets(resolution.t);
    const bucket = (ms / DAY * buckets) >> 0;

    resRef.child(String(bucket)).transaction(incrementer);
  }
}

function storeMeanMetric(resolutions, dayRef, ms, metric) {
  const value = metric.value;

  for (let resolution of resolutions) {
    const resRef = dayRef.child(resolution.name);
    const buckets = numBuckets(resolution.t);
    const bucket = (ms / DAY * buckets) >> 0;

    resRef.child(String(bucket)).transaction(data => {
      if (data) {
        const nc = data.count + 1;
        return {
          count: nc,
          value: data.value + (value - data.value) / nc
        }
      } else {
        return {count:1, value};
      }
    });
  }
}

/**
 * @note Must be bound to an object with the keys {ref, dataSnapshot,
  * outRef, resolutions}
 *
 * @param error
 * @param committed
 */
function storeMetric(this: PushContext, error, committed) {
  if (error) {
    return
  }
  if (!committed) {
    return
  } // Aborted

  const metric = this.dataSnapshot.val() as MetricData;
  const tag = sanitizeTag(metric.tag);
  const timestamp = metric.timestamp;
  const day = getDay(timestamp);
  const ms = timestamp % DAY;
  const tagRef = this.outRef.child(tag);
  const dayRef = tagRef.child(String(day));

  if (metric.value) {
    storeMeanMetric(this.resolutions, dayRef, ms, metric);
  } else {
    storeCountMetric(this.resolutions, dayRef, ms, metric);
  }

  this.outRef.child('tags').child(tag).set(day);
  this.ref.remove()
}

function processMetric(this: MetricContext, dataSnapshot: DataSnapshot) {
  const ref = dataSnapshot.ref;
  const context: PushContext = {
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
      ref.child('days').transaction(data =>
        assoc(String(day), day + resolution.keep, data || {})
      );
    }
  }
}

/**
 * Clean up stale aggregations. Once we've moved beyond the resolution keep
 * time we can safely delete the resolution tree under each tag.
 */
async function removeAggregations(this: MetricContext) {
  const now = Date.now();
  const today = getDay(now);
  const resolutions: StoredResolution[] = await this.outRef.child('resolutions')
    .once('value')
    .then(getVal) as StoredResolution[];

  const tags: string[] = await this.outRef.child('tags')
    .once('value')
    .then(getVal)
    .then(keys) as string[];

  const names: string[] = keys(resolutions);

  for (let name of names) {
    const resolution = resolutions[name];

    if (!resolution.days) {
      continue;
    }

    const days = keys(resolution.days).map(Number)
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
        .transaction(data => dissoc(String(day), data));
    }
  }
}

/**
 * Push a count metric to an inbox location
 *
 * @param inRef a location in firebase
 * @param tag a tag for the data
 * @param count a count, defaults to 1
 * @returns {Promise}
 */
function pushCount(inRef: firebase.database.Reference, tag: string, count:number = 1) {
  const timestamp = Date.now();
  const values = {timestamp, tag, count};
  return inRef.push(values);
}

function pushMetric(inRef: firebase.database.Reference, tag: string, value?: number) {
  if (!value) { return pushCount(inRef, tag, 1); }

  const timestamp = Date.now();
  const values = {timestamp, tag, value};
  return inRef.push(values);
}


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
function startMetrics(inRef: firebase.database.Reference, outRef: firebase.database.Reference, resolutions: Resolution[] = defaultResolutions) {
  const context: MetricContext = {inRef, outRef, resolutions};
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

  return function() {
    inRef.off('child_added', boundProcessMetric);
    clearInterval(updateTimer);
    clearInterval(removeTimer);
  }
}

export {startMetrics, pushMetric, pushCount}
