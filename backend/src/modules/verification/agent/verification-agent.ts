import type { ImagePreparer } from '../../../../libs/integration/ai/image-prep.js';
import {
  ModelError,
  type AgentStep,
  type MultimodalModel,
  type RequestTag,
} from '../../../../libs/integration/ai/multimodal-model.js';
import { AGGREGATION_VERSION, aggregate, followupTrigger } from './aggregate.js';
import { recordCall, requestCall, startBudget, type BudgetConfig, type BudgetState, type CallKind } from './budget.js';
import {
  parseClaim,
  parseEvidence,
  parseFollowup,
  SCHEMA_VERSION,
  type ClaimFindings,
  type EvidenceFindings,
  type FollowupFindings,
  type ParseResult,
} from './findings.js';
import {
  buildClaimPrompt,
  buildEvidencePrompt,
  buildFollowupPrompt,
  buildRepairParts,
  PROMPT_VERSION,
  type AgentInput,
  type StepPrompt,
} from './prompts/index.js';

export interface AgentConfig extends BudgetConfig {
  followupBelow: number;
  imageMaxPx: number;
  /** Hard cap on images per model call, regardless of the type's maxPhotos (AI_MAX_IMAGES). */
  maxImages: number;
  maxOutputTokens: number;
}

export type AgentFailureCode =
  'ai.unavailable' | 'ai.timeout' | 'ai.refused' | 'ai.invalidOutput' | 'ai.budgetExhausted' | 'ai.imagePrep';

/**
 * A technical failure (FR-028): never a decision. `retryable` tells the job policy whether another attempt
 * can help. The message carries a code only, never content.
 */
export class AgentTechnicalError extends Error {
  constructor(
    readonly code: AgentFailureCode,
    readonly retryable: boolean,
    readonly step?: AgentStep,
  ) {
    super(code);
    this.name = 'AgentTechnicalError';
  }
}

export interface AgentStepRecord {
  step: AgentStep;
  modelVersion: string;
  repaired: boolean;
}

export interface AgentAssessment {
  /** 0..1 from pure aggregate(); the model never supplies it (FR-025/026). */
  score: number;
  flags: string[];
  reasonCodes: string[];
  providerId: string;
  /** One entry per executed step (FR-054). */
  steps: AgentStepRecord[];
  modelVersions: string[];
  promptVersion: string;
  schemaVersion: string;
  aggregationVersion: string;
  callCount: number;
  findings: { evidence: EvidenceFindings; claim: ClaimFindings; followup?: FollowupFindings };
}

/**
 * Runs the lightweight verification agent (ADR-0012): evidence -> claim -> optional follow-up -> pure aggregate.
 * Uses only the MultimodalModel port. Invalid output gets exactly one repair call, then a technical failure.
 */
export class VerificationAgent {
  constructor(
    private readonly model: MultimodalModel,
    private readonly imagePreparer: ImagePreparer,
    private readonly config: AgentConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async assess(rawInput: AgentInput): Promise<AgentAssessment> {
    const input = await this.prepareImages(rawInput);
    const run: RunState = {
      budget: startBudget(this.now()),
      steps: [],
      providerId: '',
    };
    const criteriaIds = input.type.criteria.map((c) => c.id);

    const evidence = await this.runStep(run, 'evidence', 'required', buildEvidencePrompt(input), (json) =>
      parseEvidence(json, input.photos.length, criteriaIds),
    );
    const claim = await this.runStep(run, 'claim', 'required', buildClaimPrompt(input), parseClaim);

    let followup: FollowupFindings | undefined;
    const decision = followupTrigger(evidence, claim, this.config.followupBelow);
    if (decision.trigger) {
      // Optional step: skipped (not failed) when the budget cannot afford it; aggregate() then keeps the
      // low-confidence cap, so an unresolved doubt can never become an accept.
      followup = await this.runStep(
        run,
        'followup',
        'optional',
        buildFollowupPrompt(input, decision.issues),
        (json) => parseFollowup(json, decision.issues),
        true,
      );
    }

    const result = aggregate({
      evidence,
      claim,
      followup,
      criteriaCount: input.type.criteria.length,
      followupBelow: this.config.followupBelow,
    });
    return {
      score: result.score,
      flags: result.flags,
      reasonCodes: result.reasonCodes,
      providerId: run.providerId,
      steps: run.steps,
      modelVersions: [...new Set(run.steps.map((s) => s.modelVersion))],
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      aggregationVersion: AGGREGATION_VERSION,
      callCount: run.budget.callsUsed,
      findings: { evidence, claim, ...(followup ? { followup } : {}) },
    };
  }

  private async prepareImages(input: AgentInput): Promise<AgentInput> {
    try {
      const photos = input.photos.slice(0, this.config.maxImages);
      const prepared = await this.imagePreparer.prepare(photos, this.config.imageMaxPx);
      return { ...input, photos: photos.map((p, i) => ({ ...p, ...prepared[i]! })) };
    } catch {
      throw new AgentTechnicalError('ai.imagePrep', false);
    }
  }

  private async runStep<T>(
    run: RunState,
    step: AgentStep,
    kind: CallKind,
    prompt: StepPrompt,
    parse: (json: unknown) => ParseResult<T>,
    skippable = false,
  ): Promise<T> {
    let errors: string[] = [];
    for (const repair of [false, true]) {
      const decision = requestCall(this.config, run.budget, this.now(), repair ? 'optional' : kind);
      if (!decision.allowed) {
        if (skippable && !repair) return undefined as T;
        throw new AgentTechnicalError('ai.budgetExhausted', true, step);
      }
      run.budget = recordCall(run.budget);
      const tag: RequestTag = repair ? `${step}.repair` : step;
      let json: unknown;
      try {
        const reply = await this.model.generate({
          requestTag: tag,
          system: prompt.system,
          parts: repair ? buildRepairParts(prompt, errors) : prompt.parts,
          responseSchema: prompt.responseSchema,
          maxTokens: this.config.maxOutputTokens,
          timeoutMs: decision.timeoutMs,
        });
        run.providerId = reply.providerId;
        json = reply.json;
        const parsed = parse(json);
        if (parsed.ok) {
          run.steps.push({ step, modelVersion: reply.modelVersion, repaired: repair });
          return parsed.value;
        }
        errors = parsed.errors;
      } catch (err) {
        if (err instanceof ModelError && err.kind === 'invalid_output') {
          errors = ['$:unparsable'];
        } else {
          throw toTechnical(err, step);
        }
      }
    }
    throw new AgentTechnicalError('ai.invalidOutput', false, step);
  }
}

interface RunState {
  budget: BudgetState;
  steps: AgentStepRecord[];
  providerId: string;
}

function toTechnical(err: unknown, step: AgentStep): AgentTechnicalError {
  if (err instanceof ModelError) {
    if (err.kind === 'timeout') return new AgentTechnicalError('ai.timeout', true, step);
    if (err.kind === 'refused') return new AgentTechnicalError('ai.refused', false, step);
    return new AgentTechnicalError('ai.unavailable', true, step);
  }
  return new AgentTechnicalError('ai.unavailable', true, step);
}
