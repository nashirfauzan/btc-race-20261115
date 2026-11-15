import test from 'node:test';
import assert from 'node:assert/strict';
import { BarsState, type Hello, type Bar, type Batch } from '../vendor/makefun-bars.ts';

const hello: Hello = {
  type: 'hello', protocol: 'agent-fun/bars-replay/v1', seed: '7',
  symbols: [{ symbol: 'CBBTC', mint: 'test', price_scale: 5, qty_scale: 8 }],
  capital: { quote: 'USDC', quote_scale: 6, quote_units: '1000000000' },
  bar_interval: '1m', first_close_ms: 60000,
  caps: { max_open_positions: 1, max_orders_per_bar: 16, max_weight_bps: 10000, shorts: false, leverage: false },
  fees: { fee_bps: 4, slippage_bps: 2, min_notional_quote_units: '1000000' }, latency_bars: 1,
};

function feed(bot: any, state: BarsState, seq: number, price: number) {
  const c = String(Math.round(price * 1e5));
  const bar: Bar = { symbol: 'CBBTC', t: (seq + 1) * 60000, o: c, h: c, l: c, c,
    v: null, o_depth: ['650000000000'], c_depth: ['650000000000'] };
  const batch: Batch = { type: 'batch', seq, t: bar.t, bars: [bar], fills: [], account: state.account };
  state.applyBatch(batch);
  return state.toOrders(bot.onBatch(state, batch));
}

test('a sufficiently deep deviation buys while a shallow dip preserves cash', async () => {
  const { DipStrategy } = await import('../dip-strategy.ts');
  const bot = new DipStrategy();
  const state = new BarsState(hello);
  for (let seq = 0; seq < 150; seq++) assert.deepEqual(feed(bot, state, seq, 65000), []);
  assert.deepEqual(feed(bot, state, 150, 64500), [], 'ordinary noise must not spend capital');
  const orders = feed(bot, state, 151, 63000);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].side, 'buy');
  if (orders[0].side === 'buy') {
    assert.ok(BigInt(orders[0].notional_quote_units) <= state.cash);
    assert.ok(BigInt(orders[0].notional_quote_units) >= 800000000n);
  }
});

test('a trailing stop remains armed after an earned profit retraces below its arming threshold', async () => {
  const { DipStrategy } = await import('../dip-strategy.ts');
  const bot = new DipStrategy({ lookback: 30, armBps: 100, trailBps: 80, takeBps: 500 });
  const state = new BarsState(hello);
  for (let seq = 0; seq < 30; seq++) feed(bot, state, seq, 65000);
  state.account = { cash_quote_units: '30000000', equity_quote_units: '1000000000',
    positions: [{ symbol: 'CBBTC', qty: '1538461', cost_quote_units: '1000000000' }] };
  assert.deepEqual(feed(bot, state, 30, 65000), []);
  assert.deepEqual(feed(bot, state, 31, 66000), []);
  const orders = feed(bot, state, 32, 65200);
  assert.equal(orders.length, 1, 'profit protection stays armed after the trigger was crossed');
  assert.equal(orders[0].side, 'sell');
});

test('a thin pool reduces order size instead of ignoring a valid dip', async () => {
  const { DipStrategy } = await import('../dip-strategy.ts');
  const bot = new DipStrategy();
  const thin = new BarsState(hello);
  for (let seq = 0; seq < 150; seq++) feed(bot, thin, seq, 65000);
  const c = '6300000000';
  const batch: Batch = { type: 'batch', seq: 150, t: 9060000, fills: [], account: thin.account,
    bars: [{ symbol: 'CBBTC', t: 9060000, o: c, h: c, l: c, c, v: null,
      o_depth: ['100000000000'], c_depth: ['100000000000'] }] };
  thin.applyBatch(batch);
  const orders = thin.toOrders(bot.onBatch(thin, batch));
  assert.equal(orders.length, 1, 'liquidity-aware sizing should preserve an affordable entry');
  assert.equal(orders[0].side, 'buy');
  if (orders[0].side === 'buy') {
    const amount = BigInt(orders[0].notional_quote_units);
    assert.ok(amount < 500000000n);
    assert.ok(thin.impactBps('CBBTC', amount)! <= 30n);
  }
});

test('quiet markets make one minimum-sized fallback trade while a drawdown halt prevents re-entry', async () => {
  const { DipStrategy } = await import('../dip-strategy.ts');
  const quiet = new DipStrategy();
  const state = new BarsState(hello);
  let buys = 0, sells = 0;
  for (let seq = 0; seq < 1000; seq++) {
    const orders = feed(quiet, state, seq, 65000);
    for (const o of orders) {
      if (o.side === 'buy') {
        buys++;
        assert.equal(o.notional_quote_units, '1000000');
        state.account = { cash_quote_units: '999000000', equity_quote_units: '1000000000',
          positions: [{symbol:'CBBTC',qty:'1538',cost_quote_units:'1000000'}] };
      } else {
        sells++;
        state.account = { cash_quote_units:'999998000',equity_quote_units:'999998000',positions:[] };
      }
    }
  }
  assert.equal(buys, 1);
  assert.equal(sells, 1);
  const halted = new DipStrategy();
  const risk = new BarsState(hello);
  for(let seq=0;seq<150;seq++) feed(halted,risk,seq,65000);
  risk.account = {cash_quote_units:'0',equity_quote_units:'870000000',
    positions:[{symbol:'CBBTC',qty:'1538461',cost_quote_units:'1000000000'}]};
  assert.equal(feed(halted,risk,150,63000)[0].side,'sell');
  risk.account = {cash_quote_units:'870000000',equity_quote_units:'870000000',positions:[]};
  assert.deepEqual(feed(halted,risk,151,62000),[]);
});
