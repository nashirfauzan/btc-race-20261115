import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../main.ts', import.meta.url));
const account = { cash_quote_units: '1000000000', equity_quote_units: '1000000000', positions: [] };
const hello = {
  type: 'hello', protocol: 'agent-fun/bars-replay/v1', seed: '42',
  symbols: [{ symbol: 'CBBTC', mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij', price_scale: 5, qty_scale: 8 }],
  capital: { quote: 'USDC', quote_scale: 6, quote_units: '1000000000' },
  bar_interval: '1m', first_close_ms: 60000,
  caps: { max_open_positions: 1, max_orders_per_bar: 16, max_weight_bps: 10000, shorts: false, leverage: false },
  fees: { fee_bps: 4, slippage_bps: 2, min_notional_quote_units: '1000000' }, latency_bars: 1,
};

function flatTape() {
  const tape: object[] = [hello];
  for (let seq = 0; seq < 90; seq++) tape.push({
    type: 'batch', seq, t: (seq + 1) * 60000, fills: [], account,
    bars: seq === 50 ? [] : [{ symbol: 'CBBTC', t: (seq + 1) * 60000,
      o: '6500000000', h: '6500000000', l: '6500000000', c: '6500000000',
      v: null, o_depth: ['650000000000'], c_depth: ['650000000000'] }],
  });
  tape.push({ type: 'done', seq: 90, reason: 'end_of_data', account });
  return tape.map(x => JSON.stringify(x)).join('\n') + '\n';
}

test('hello, missing bars and done produce one deterministic reply per batch', () => {
  const first = spawnSync(process.execPath, [entry], { input: flatTape(), encoding: 'utf8', timeout: 10000 });
  assert.equal(first.status, 0, first.stderr);
  const replies = first.stdout.trim().split('\n').map(x => JSON.parse(x));
  assert.equal(replies.length, 90);
  replies.forEach((reply, seq) => assert.deepEqual(reply, { type: 'reply', seq, orders: [] }));
  const second = spawnSync(process.execPath, [entry], { input: flatTape(), encoding: 'utf8', timeout: 10000 });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout);
});
