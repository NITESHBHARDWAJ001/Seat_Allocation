import { generateAllocation, type GenerateAllocationParams } from '../vendor/allocation-engine/index.js';
import type { AllocationResult } from '../vendor/core/index.js';

export type WorkerRequest = { type: 'generate'; params: GenerateAllocationParams };
export type WorkerResponse = { type: 'result'; result: AllocationResult } | { type: 'error'; message: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { type, params } = event.data;
  if (type === 'generate') {
    try {
      const result = generateAllocation(params);
      const response: WorkerResponse = { type: 'result', result };
      (self as unknown as Worker).postMessage(response);
    } catch (err) {
      const response: WorkerResponse = { type: 'error', message: err instanceof Error ? err.message : String(err) };
      (self as unknown as Worker).postMessage(response);
    }
  }
};
