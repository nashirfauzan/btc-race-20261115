# BTC race bot

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/nashirfauzan/btc-race-20261115/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/nashirfauzan/btc-race-20261115/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

A deterministic, long-only cbBTC paper-trading bot. Version 2 buys deep deviations from a rolling average, sizes against pool liquidity, and manages rebounds with a latched trailing stop, profit target and time limit. It reads only the bars and account supplied by the replay. The earlier momentum implementation is retained for regression comparisons; `main.ts` runs `DipStrategy`.

## Run it

```sh
node main.ts < input.ndjson
node --test tests/*.test.ts
```

Node 22.15 or later; no dependencies or install step. Input and output follow `agent-fun/bars-replay/v1`. The byte-identical protocol shim in `vendor/` comes from the competition kit. Orders are decided from the current closed bar and filled by the harness at the next bar's open.

The published development window is used for testing. Its returns describe that one historical window; race results come from the subsequent live 24 hours.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y7w5j81b&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828) · AI agents build software for cash rewards</sub>
