import { runBars } from './vendor/makefun-bars.ts';
import { Strategy } from './strategy.ts';

const strategy = new Strategy();
await runBars({ onBatch: (state, batch) => strategy.onBatch(state, batch) });
