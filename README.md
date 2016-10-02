# Firebase Metrics

https://github.com/jemmyw/firebase-metrics

[![CircleCI](https://circleci.com/gh/jemmyw/firebase-metrics.svg?style=svg)](https://circleci.com/gh/jemmyw/firebase-metrics)

Sometimes you just want to get some metrics data before you're big enough to have a proper place for storing them. This library helps if your datastore is Firebase.

It also works nicely with frontend graphing libraries due to Firebase realtime nature.

## Install

```
npm install firebase
npm install firebase-metrics
```

## Collecting metrics

*Note that in these examples I've not verified the dates in the data below so it probably does not add up*

First you need to decide some metric retention. For example, you want the data at 1 minute resolution for 7 days, then 1 hour resolution for 1 month, then daily resolution for 1 year:

```js
const HOUR = 3600000;
const DAY = 86400000;

const resolutions = [
  {
    name: '1min',
    t: 60 * 1000, // 1 minute
    keep: 86400000 * 7 // 1 week
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
]
```

OK, so now we pass this into the background process:

```js
const {startMetrics} = require('firebase-metrics');
const inRef = firebase.database().ref().child('metrics-in');
const outRef = firebase.database().ref().child('metrics');

startMetrics(inRef, outRef, resolutions);
```

This process will now wait for data to appear in `metrics-in` and then record that as counts in metrics.

We can use the `pushCount` helper to push a metric in:

```js
const {pushCount} = require('firebase-metrics');

pushCount(inRef, 'my-tag', 2);
```

Now very soon you'll see the following structure in metrics:

```json
"metrics": {
  "tag:my-tag": {
    "1474243200000": {
      "1min": {
        599: 2
      },
      "1hour": {
        8: 2
      },
      "1day": {
        0: 2
      }
    }
  },
  "resolutions": {
    "1min": {
      "buckets": 1440,
      "days": {
        1474243200000: 1474588800000
      },
      "keep": 604800000 
    }
  }
}
```

OK, not that interesting, run it again and:


```json
"metrics": {
  "tag:my-tag": {
    "1474243200000": {
      "1min": {
        599: 2,
        600: 2
      },
      "1hour": {
        8: 4
      },
      "1day": {
        0: 4
      }
    }
  }
}
```

So we can see what is happening. It puts the data into buckets in each resolution. It tracks the days that each resolution has data for, and the expiry for the day. When the day ticks over the server component will remove the expired buckets.

## Value metrics

You can also pass in values that will be averaged in each time bucket using the helper `pushMetric`. For example:

```js
const {pushMetric} = require('firebase-metrics');

pushMetric(inRef, 'tag1', 23.33);
pushMetric(inRef, 'tag1', 10.78);
```

This produces the following:

```json
"metrics": {
  "tag:tag1": {
    "1474243200000": {
      "1min": {
        599: {count:1, value: 23.33},
        600: {count:1, value: 10.78}
      },
      "1hour": {
        8: {count: 2, value: 17.055}
      },
      "1day": {
        0: {count: 2, value: 17.055}
      }
    }
  }
}
```

*Note that you must be careful not to mix calls to `pushCount` and `pushMetric` as the data formats don't mix.*

## Graphing the data

There is a non-working but viable example in the `examples` directory. I pulled it straight out of a working dashboard, so it just requires some build (typescript and webpack).

## Troubleshooting

Obviously both the `startMetrics` and `pushCount` processes require read/write access to the inRef and outRef (pushCount doesn't need any access to outRef).

If you see data building up in the inRef then the `startMetrics` program isn't running.

## Testing

The tests rely on a real Firebase database, which can be provisioned for free at firebase.google.com.

Read the instructions in src/test.ts, and then run the resulting file in dist/test/test.js.