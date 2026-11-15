import { runBars } from './vendor/makefun-bars.ts';
import { DipStrategy } from './dip-strategy.ts';

const strategy = new DipStrategy();
await runBars({ onBatch: (state, batch) => strategy.onBatch(state, batch) });
