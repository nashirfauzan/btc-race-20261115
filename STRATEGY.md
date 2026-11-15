# Strategy

The bot uses only the closed bars already delivered in `batch`. It ignores seed and absolute date, and never reads a wall clock, the network, or outside files.

It warms up on 144 observed closes, then buys when 60-bar momentum exceeds 100 basis points and the 36-bar EMA exceeds the 144-bar EMA by more than one third of that threshold. Entry size is 90% of equity, bounded by cash, the harness weight cap and a maximum estimated impact of 25 basis points at the last close's depth.

A position exits when the fast EMA falls below the slow EMA with 8 basis points of hysteresis, price falls 90 basis points from its high while held, or its marked value is 150 basis points below cost. A completed exit starts a 24-bar cooldown. A 12% decline from the account's observed equity peak halts further entries and repeatedly asks to liquidate any remaining position.

If no position has filled by batch 720 after warmup, the bot opens one minimum-notional position and closes it on the next observed bar. This satisfies the race's trade floor on a market with no qualifying trend, while limiting capital exposed by that fallback. It remains subject to fees, slippage, price gaps and order rejection.

Prices and indicators use deterministic IEEE 754 arithmetic. Money, quantity, weight limits and wire amounts use integers through the kit's unmodified SDK. No future price, absolute target price, dev timestamp or recorded sequence of trades is embedded in the entry.

The thresholds were compared on the public dev tape and its two chronological halves. That tape is a single historical day; the unseen race may produce different outcomes. The kit's own grader, including fees, slippage and depth impact, is the acceptance check.
