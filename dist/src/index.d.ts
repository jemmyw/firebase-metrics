import * as firebase from 'firebase';
export interface MetricData {
    timestamp: number;
    tag: string;
    count?: number;
    value?: number;
}
export interface Resolution {
    name: string;
    t: number;
    keep?: number;
}
/**
 * Push a count metric to an inbox location
 *
 * @param inRef a location in firebase
 * @param tag a tag for the data
 * @param count a count, defaults to 1
 * @returns {Promise}
 */
declare function pushCount(inRef: firebase.database.Reference, tag: string, count?: number): firebase.database.ThenableReference;
/**
 * Push a value metric an an inbox location
 *
 * @example
 *
 *   pushMetric(inRef, 'processing-time', 23.44)
 *
 * @param inRef a location in firebase
 * @param {string} tag a tag for the data
 * @param {number} value the data value
 * @returns {Promise}
 */
declare function pushMetric(inRef: firebase.database.Reference, tag: string, value?: number): firebase.database.ThenableReference;
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
declare function startMetrics(inRef: firebase.database.Reference, outRef: firebase.database.Reference, resolutions?: Resolution[]): () => void;
export { startMetrics, pushMetric, pushCount };
