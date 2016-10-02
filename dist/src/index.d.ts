import * as firebase from 'firebase';
export interface MetricData {
    timestamp: number;
    tag: string;
}
export interface Resolution {
    name: string;
    t: number;
    keep?: number;
}
/**
 * Push a metric to an inbox location
 *
 * @param inRef A location in firebase
 * @param tag A tag for the data
 * @returns {Promise}
 */
declare function pushMetric(inRef: firebase.database.Reference, tag: string): firebase.database.ThenableReference;
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
export { startMetrics, pushMetric };
