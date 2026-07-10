# Noise filter evaluation — DR3 labeled sample

The frequency-threshold noise filter (theta = 0.02, filter v2.3) was evaluated
on the DR3 labeled sample of 500 documents (312 signal, 188 noise).

Measured results:

- recall: 0.94 (293 of 312 signal documents retained)
- precision: 0.88

The recall of 0.94 clears the 0.9 acceptance bar adopted in the DR3 protocol.
The result is reproducible by recomputing retained/total signal from the
counts above: 293 / 312 = 0.939.
