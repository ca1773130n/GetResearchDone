# Write-through cache — replay workload measurements

Replaying the production trace (2.1M reads) against the write-through cache
gave the following read-latency distribution:

- latency_p50_ms: 38
- latency_p95_ms: 187
- latency_p99_ms: 341

The p95 read latency of 187 ms exceeds the 120 ms SLO. Root cause: bulk-write
invalidation storms evict hot keys, and the backing-store refill round-trip
dominates the tail.
