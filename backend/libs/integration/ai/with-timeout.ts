import { ModelError, type GenerateRequest, type GenerateResult, type MultimodalModel } from './multimodal-model.js';

/**
 * Decorator: enforces `request.timeoutMs` regardless of adapter behaviour and normalises any
 * non-ModelError into `ModelError('unavailable')` (FR-028, NFR-002).
 */
export class TimeoutMultimodalModel implements MultimodalModel {
  constructor(private readonly inner: MultimodalModel) {}

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ModelError('timeout')), Math.max(0, request.timeoutMs));
    });
    try {
      return await Promise.race([this.inner.generate(request), timeout]);
    } catch (err) {
      if (err instanceof ModelError) throw err;
      throw new ModelError('unavailable');
    } finally {
      clearTimeout(timer);
    }
  }
}
