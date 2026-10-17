# What does well on Hacker News

The idea coach (Cmd+Alt+P) bases its advice on this. The rules live in `src/core/plan/plan.ts` as the coach's instructions.

## Method

Pulled from the HN Algolia API on 2026-10-17, for the two years before that:

- **Hits:** every story with more than 300 points (8,820 stories).
- **Baseline:** stories with fewer than 5 points (24,000, the newest 1,000 per month).

"Lift" is how much more common a pattern is among the hits than in the baseline. Above 1 helps, below 1 hurts. The
baseline includes spam and duplicate submissions, so take small differences lightly.

## Titles

| Pattern | Hits | Baseline | Lift |
| --- | ---: | ---: | ---: |
| Starts with I / We / My / Our | 4.9% | 2.5% | 1.9× |
| Contains a digit | 26.5% | 19.9% | 1.3× |
| "from scratch" / "in N lines" | 0.3% | 0.1% | 3.6× (rare) |
| Starts with How / Why | 2.0% / 1.2% | 2.2% / 1.3% | ~0.9× |
| Has a colon (subtitle) | 16.2% | 27.8% | 0.58× |
| Ends with a question mark | 3.4% | 6.2% | 0.55× |
| `Show HN` | 4.0% | 11.5% | 0.35× (many flop, the good ones do fine) |
| Exclamation mark | 0.0% | 0.1% | 0.3× |

Hits have a median title of **8 words and 48 characters**; the baseline 8 words and 53. HN cuts titles at 80.

The [guidelines](https://news.ycombinator.com/newsguidelines.html) add the rest: use the original title unless it is
misleading or linkbait, no uppercase or exclamation marks for emphasis, don't say how great the thing is. Moderators
rewrite titles that break this.

## Post types from personal sites

Read from a sample of 150 hits outside news outlets and launches:

| Type | Example from the data |
| --- | --- |
| Experience report | We saved $500k per year by rolling our own "S3" |
| Failure story | I failed to recreate the 1996 Space Jam website with Claude |
| Deep dive | Australia/Lord_Howe is the weirdest timezone |
| Built it | Show HN: A CSS-Only Terrain Generator |
| Thesis | Agents don't need memory, they need documentation |
| Practical tip | You already have a Git server |
| Field guide | Writing a good design document |

The rest of the front page is news, launches from big companies, and obituaries: nothing a personal post can copy.
