import test from 'node:test';
import assert from 'node:assert/strict';
import { BarsState, type Bar, type Hello, type Batch } from '../vendor/makefun-bars.ts';

const hello: Hello = {
  type: 'hello', protocol: 'agent-fun/bars-replay/v1', seed: '42',
  symbols: [{ symbol: 'CBBTC', mint: 'test', price_scale: 5, qty_scale: 8 }],
  capital: { quote: 'USDC', quote_scale: 6, quote_units: '1000000000' },
  bar_interval: '1m', first_close_ms: 60000,
  caps: { max_open_positions: 1, max_orders_per_bar: 16, max_weight_bps: 10000, shorts: false, leverage: false },
  fees: { fee_bps: 4, slippage_bps: 2, min_notional_quote_units: '1000000' }, latency_bars: 1,
};

test('confirmed upward trend opens an affordable position after warmup', async () => {
  const { Strategy } = await import('../strategy.ts');
  const bot = new Strategy();
  const state = new BarsState(hello);
  const buys: { seq: number; amount: bigint }[] = [];
  for (let seq = 0; seq < 240; seq++) {
    const c = String(Math.round(6500000000 * (1 + seq * 0.0003)));
    const bar: Bar = { symbol: 'CBBTC', t: (seq + 1) * 60000, o: c, h: c, l: c, c,
      v: null, o_depth: ['650000000000'], c_depth: ['650000000000'] };
    const batch: Batch = { type: 'batch', seq, t: bar.t, bars: [bar], fills: [], account: state.account };
    state.applyBatch(batch);
    const orders = state.toOrders(bot.onBatch(state, batch));
    for (const order of orders) if (order.side === 'buy') {
      const amount = BigInt(order.notional_quote_units);
      buys.push({ seq, amount });
      assert.ok(amount >= 1000000n && amount <= state.cash);
      const qty = (amount * 10000000n) / BigInt(c);
      state.account = { cash_quote_units: String(state.cash - amount),
        equity_quote_units: '1000000000', positions: [{ symbol: 'CBBTC', qty: String(qty), cost_quote_units: String(amount) }] };
    }
  }
  assert.ok(buys.length >= 1, 'a sustained trend must generate a real buy');
  assert.ok(buys[0].seq >= 30, 'wait for indicator history');
  assert.ok(buys.length <= 3, 'avoid accumulating repeated orders into the same position');
});

test('a falling tape still makes a minimum-sized qualification trade and immediately closes it', async () => {
  const { Strategy } = await import('../strategy.ts');
  const bot = new Strategy();
  const state = new BarsState(hello);
  const all: { seq: number; side: string; amount: string }[] = [];
  for (let seq = 0; seq < 800; seq++) {
    const c = String(Math.round(6500000000 * (1 - seq * 0.0001)));
    const bar: Bar = { symbol: 'CBBTC', t: (seq + 1) * 60000, o: c, h: c, l: c, c,
      v: null, o_depth: ['650000000000'], c_depth: ['650000000000'] };
    const batch: Batch = { type: 'batch', seq, t: bar.t, bars: [bar], fills: [], account: state.account };
    state.applyBatch(batch);
    const orders = state.toOrders(bot.onBatch(state, batch));
    for (const order of orders) {
      if (order.side === 'buy') {
        const amount = BigInt(order.notional_quote_units);
        all.push({ seq, side: 'buy', amount: String(amount) });
        const qty = amount * 10000000n / BigInt(c);
        state.account = { cash_quote_units: String(state.cash - amount), equity_quote_units: '1000000000',
          positions: [{ symbol: 'CBBTC', qty: String(qty), cost_quote_units: String(amount) }] };
      } else {
        all.push({ seq, side: 'sell', amount: order.qty });
        state.account = { cash_quote_units: '999998000', equity_quote_units: '999998000', positions: [] };
      }
    }
  }
  assert.equal(all.length, 2, 'one small round trip, no trend-sized buys');
  assert.deepEqual(all.map(x => x.side), ['buy', 'sell']);
  assert.equal(all[0].amount, '1000000');
  assert.ok(all[0].seq >= 720);
  assert.equal(all[1].seq, all[0].seq + 1);
});

test('an equity loss of 12 percent liquidates and blocks later re-entry', async () => {
  const { Strategy } = await import('../strategy.ts');
  const bot = new Strategy();
  const state = new BarsState(hello);
  let liquidated = false;
  for (let seq = 0; seq < 900; seq++) {
    const c = String(Math.round(6500000000 * (1 + seq * 0.0003)));
    const bar: Bar = { symbol: 'CBBTC', t: (seq + 1) * 60000, o: c, h: c, l: c, c,
      v: null, o_depth: ['650000000000'], c_depth: ['650000000000'] };
    const batch: Batch = { type: 'batch', seq, t: bar.t, bars: [bar], fills: [], account: seq < 200 ? state.account : {
      cash_quote_units: liquidated ? '870000000' : '0', equity_quote_units: '870000000',
      positions: liquidated ? [] : [{ symbol: 'CBBTC', qty: '1538461', cost_quote_units: '1000000000' }],
    } };
    state.applyBatch(batch);
    const orders = state.toOrders(bot.onBatch(state, batch));
    if (seq === 200) {
      assert.equal(orders.length, 1, 'risk limit must send a liquidation');
      assert.equal(orders[0].side, 'sell');
      liquidated = true;
    } else if (seq > 200) assert.deepEqual(orders, [], 'halt persists through later strong trends');
  }
});
