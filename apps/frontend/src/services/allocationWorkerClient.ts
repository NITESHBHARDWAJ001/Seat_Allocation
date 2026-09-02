import type { GenerateAllocationParams } from '../vendor/allocation-engine/index.js';
import type { AllocationResult } from '../vendor/core/index.js';
import type { WorkerRequest, WorkerResponse } from '../workers/allocation.worker.js';

/**
 * Runs the allocation engine inside a Web Worker so generating ~1,000-student
 * seatings never blocks the UI thread (spec §66).
 */
export function runAllocationInWorker(params: GenerateAllocationParams): Promise<AllocationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/allocation.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'result') {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.message));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      reject(new Error(err.message || 'Allocation worker failed unexpectedly.'));
      worker.terminate();
    };

    const request: WorkerRequest = { type: 'generate', params };
    worker.postMessage(request);
  });
}
