import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

export interface DipParameters {
  lookback: number;
  dipBps: number;
  takeBps: number;
  stopBps: number;
  trailBps: number;
  armBps: number;
  cooldown: number;
  maxHold: number;
  stakeBps: number;
}

export const DIP_DEFAULTS: DipParameters = {
  lookback: 120, dipBps: 215, takeBps: 450, stopBps: 200,
  trailBps: 100, armBps: 150, cooldown: 30, maxHold: 120, stakeBps: 9900,
};

export class DipStrategy {
  readonly p: DipParameters;
  private closes: number[] = [];
  private sum = 0;
  private peak = 0;
  private entrySeq = -1;
  private wasHeld = false;
  private cooldownUntil = -1;
  private peakEquity = 0n;
  private halted = false;
  private trailArmed = false;
  private madeTrade = false;
  private probing = false;

  constructor(parameters: Partial<DipParameters> = {}) {
    this.p = { ...DIP_DEFAULTS, ...parameters };
  }

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const symbol = state.hello.symbols[0]?.symbol;
    const bar = batch.bars.find(b => b.symbol === symbol);
    if (!symbol || !bar) return [];
    const close = Number(bar.c);
    this.closes.push(close);
    this.sum += close;
    if (this.closes.length > this.p.lookback) this.sum -= this.closes.shift()!;
    const held = state.positions.get(symbol);
    if (state.equity > this.peakEquity) this.peakEquity = state.equity;
    if (state.equity * 100n <= this.peakEquity * 88n) this.halted = true;
    const sell = (): OrderInput[] => held
      ? [{ side: 'sell', symbol, qty: held.qty, max_slippage_bps: this.halted ? 1000 : 200 }]
      : [];
    if (this.halted) return sell();
    if (held) {
      if (!this.wasHeld) { this.entrySeq = batch.seq; this.peak = close; this.trailArmed = false; }
      this.wasHeld = true;
      this.madeTrade = true;
      if (this.probing) return sell();
      this.peak = Math.max(this.peak, close);
      const marked = state.value(symbol, held.qty);
      const gainBps = Number(marked * 10000n / held.cost) - 10000;
      const take = gainBps >= this.p.takeBps;
      const stopped = gainBps <= -this.p.stopBps;
      if (gainBps >= this.p.armBps) this.trailArmed = true;
      const trailing = this.trailArmed && close <= this.peak * (1 - this.p.trailBps / 10000);
      if (take || stopped || trailing || batch.seq - this.entrySeq >= this.p.maxHold) return sell();
      return [];
    }
    if (this.wasHeld) { this.cooldownUntil = batch.seq + this.p.cooldown; this.probing = false; }
    this.wasHeld = false;
    if (state.warmingUp || this.closes.length < this.p.lookback || batch.seq < this.cooldownUntil) return [];
    const average = this.sum / this.closes.length;
    const deviation = (1 - close / average) * 10000;
    if (deviation < this.p.dipBps) {
      const minimum = BigInt(state.hello.fees.min_notional_quote_units);
      if (!this.madeTrade && batch.seq >= state.warmupBars + 900
          && state.cash >= minimum && state.weightRoom(symbol) >= minimum) {
        this.probing = true;
        return [{ side: 'buy', symbol, notional_quote_units: minimum, max_slippage_bps: 100 }];
      }
      return [];
    }
    this.probing = false;
    let spend = state.equity * BigInt(this.p.stakeBps) / 10000n;
    if (spend > state.cash) spend = state.cash;
    const room = state.weightRoom(symbol);
    if (spend > room) spend = room;
    const depth = state.depthAt(symbol);
    if (!depth || depth.some(d => d <= 0n)) return [];
    const product = depth.reduce((a, d) => a * d, 1n);
    const complements = depth.reduce((a, _, i) => a + depth.reduce((v, d, j) => i === j ? v : v * d, 1n), 0n);
    const liquidityRoom = 29n * 10n ** BigInt(state.hello.capital.quote_scale) * product
      / (10000n * 1000000n * complements);
    if (spend > liquidityRoom) spend = liquidityRoom;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    const impact = state.impactBps(symbol, spend);
    if (impact === null || impact > 30n) return [];
    return [{ side: 'buy', symbol, notional_quote_units: spend, max_slippage_bps: 100 }];
  }
}
