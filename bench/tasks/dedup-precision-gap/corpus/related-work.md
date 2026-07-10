# Related work (different system — not ours)

The upstream open-source MinHashDedup project reports precision 0.91 on its
own benchmark corpus. Those numbers cover MinHashDedup's default configuration
on third-party data; they say nothing about our shingle-based deduplicator,
which uses a different tokenizer, shingle width, and similarity threshold.
