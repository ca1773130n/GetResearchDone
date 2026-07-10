# Shingle-based deduplicator — design notes

The deduplicator hashes 4-token shingles and flags a pair as duplicate above
0.7 Jaccard similarity. Throughput on the ingest box is 1,900 documents per
second with the default two workers.

A labeled pair set for quality evaluation was commissioned in cycle 12, but
the labeling pass has not been scheduled. No precision or recall measurement
of this deduplicator exists yet.
