# Median latency looks healthy (do not stop here)

The MEDIAN (p50) read latency under the same replay is 38 ms — comfortably
inside any reasonable budget. The launch memo quoted only median figures,
which is why the cache was widely assumed to meet the SLO.

The SLO's decision metric is the 95th percentile, not the median.
