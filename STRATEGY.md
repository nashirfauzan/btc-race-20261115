# Strategy v2: deep-dip rebound

The bot reads only `hello`, each closed `batch` and the current account. It ignores seed and absolute date, and reads no wall clock, network or external file. `main.ts` runs `DipStrategy`; `strategy.ts` retains the earlier momentum bot for regression comparisons.

After 120 observed closes, it buys when the current close is at least 215 basis points below their rolling mean. The intended stake is 99% of equity, bounded by cash, the harness weight limit and the amount whose estimated impact at the last close is at most 29 basis points. A thin pool reduces position size.

A position exits on a marked gain of 450 basis points over cost, a loss of 200 basis points, 120 elapsed batches after the fill, or a 100 basis point retracement from its highest observed close after first reaching a 150 basis point gain. The trailing stop stays armed until the position closes. A completed exit starts a 30-bar cooldown. The account's 12% drawdown halt liquidates and prevents further entries.

If no position has filled by batch 900 after warmup, the bot buys the minimum notional once and sells on the next observed bar. This limits exposure on a quiet market and meets the trade floor subject to successful fills. Gaps and slippage rejection still apply.

## Public inspiration and testing

The public dev leaderboard's leading titles described crash-rebound and capitulation buying. One title mentioned a deviation from a 120-minute average and a trailing exit. Those public descriptions informed the strategy family. Their source, transcripts and action logs were withheld; none was accessed or copied. This code was authored independently in the submitted build session.

Parameters were compared on the public dev tape, chronological half-windows and start offsets, with scaled prices and depths, nearby parameters, and deterministic price perturbations. These are sensitivity checks of one historical day, not independent out-of-sample evidence. Synthetic falling, rising, choppy and crash scenarios also check behavior; they do not establish future profitability. A crash without recovery can lose money, while a quiet uptrend produces only the small fallback round trip. The unseen race alone decides ranking.

Prices use deterministic IEEE 754 arithmetic; money and sizing caps use BigInt through the unmodified SDK. No fixed BTC price, dev timestamp or recorded sequence of trades appears in the entry. The official grader executes the bot twice and reproduces its action log before submission.
