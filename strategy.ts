import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

export interface Parameters {
  fast: number;
  slow: number;
  momentum: number;
  entryBps: number;
  exitBps: number;
  trailBps: number;
  stopBps: number;
  cooldown: number;
  stakeBps: number;
}

export const DEFAULTS: Parameters = {
  fast: 36, slow: 144, momentum: 60, entryBps: 100, exitBps: 8,
  trailBps: 90, stopBps: 150, cooldown: 24, stakeBps: 9000,
};

export class Strategy {
  readonly p: Parameters;
  private closes: number[] = [];
  private fast = 0;
  private slow = 0;
  private peak = 0;
  private hadPosition = false;
  private cooldownUntil = -1;
  private madeTrade = false;
  private probing = false;
  private peakEquity = 0n;
  private halted = false;

  constructor(parameters: Partial<Parameters> = {}) {
    this.p = { ...DEFAULTS, ...parameters };
  }

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const symbol = state.hello.symbols[0]?.symbol;
    const bar = batch.bars.find(b => b.symbol === symbol);
    if (!bar || !symbol) return [];
    const price = Number(bar.c);
    this.fast = this.fast === 0 ? price : this.fast + 2 / (this.p.fast + 1) * (price - this.fast);
    this.slow = this.slow === 0 ? price : this.slow + 2 / (this.p.slow + 1) * (price - this.slow);
    this.closes.push(price);
    const held = state.positions.get(symbol);
    if (state.equity > this.peakEquity) this.peakEquity = state.equity;
    if (state.equity * 100n <= this.peakEquity * 88n) this.halted = true;
    if (this.halted) return held
      ? [{ side: 'sell', symbol, qty: held.qty, max_slippage_bps: 1000 }]
      : [];
    if (held) this.madeTrade = true;
    if (!held && this.hadPosition) {
      this.cooldownUntil = batch.seq + this.p.cooldown;
      this.probing = false;
    }
    this.hadPosition = held !== undefined;
    if (held) {
      if (this.probing) return [{ side: 'sell', symbol, qty: held.qty, max_slippage_bps: 300 }];
      this.peak = Math.max(this.peak, price);
      const marked = state.value(symbol, held.qty);
      const trendLost = this.fast < this.slow * (1 - this.p.exitBps / 10000);
      const trailing = price < this.peak * (1 - this.p.trailBps / 10000);
      const stop = marked * 10000n < held.cost * BigInt(10000 - this.p.stopBps);
      if (trendLost || trailing || stop) return [{ side: 'sell', symbol, qty: held.qty, max_slippage_bps: 150 }];
      return [];
    }
    this.peak = price;
    if (state.warmingUp || this.closes.length <= this.p.slow || batch.seq < this.cooldownUntil) return [];
    const before = this.closes[this.closes.length - 1 - this.p.momentum];
    if (before === undefined) return [];
    const moveBps = (price / before - 1) * 10000;
    const trendBps = (this.fast / this.slow - 1) * 10000;
    if (moveBps <= this.p.entryBps || trendBps <= this.p.entryBps / 3) {
      const minimum = BigInt(state.hello.fees.min_notional_quote_units);
      if (!this.madeTrade && batch.seq >= state.warmupBars + 720 && state.cash >= minimum
          && state.weightRoom(symbol) >= minimum) {
        this.probing = true;
        return [{ side: 'buy', symbol, notional_quote_units: minimum, max_slippage_bps: 100 }];
      }
      return [];
    }
    let spend = state.equity * BigInt(this.p.stakeBps) / 10000n;
    const room = state.weightRoom(symbol);
    if (spend > room) spend = room;
    if (spend > state.cash) spend = state.cash;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    const impact = state.impactBps(symbol, spend);
    if (impact === null || impact > 25n) return [];
    return [{ side: 'buy', symbol, notional_quote_units: spend, max_slippage_bps: 100 }];
  }
}
