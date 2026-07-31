import type { ServerEnv } from '@lingolive/config';
import type { Logger } from '@lingolive/logging';
import { MockTranscriptionProvider, MockTranslationProvider } from './mock-provider.js';
import { OpenAiTranscriptionProvider, OpenAiTranslationProvider } from './openai-provider.js';
import type { AiProviders, CostRates } from './types.js';
import { DEFAULT_COST_RATES, MOCK_COST_RATES } from './types.js';

export * from './types.js';
export { MockTranscriptionProvider, MockTranslationProvider } from './mock-provider.js';
export { OpenAiTranscriptionProvider, OpenAiTranslationProvider } from './openai-provider.js';

export function createAiProviders(env: ServerEnv, logger: Logger): AiProviders {
  if (env.AI_PROVIDER === 'openai') {
    return {
      transcription: new OpenAiTranscriptionProvider(env, logger),
      translation: new OpenAiTranslationProvider(env, logger),
      providerName: 'openai',
    };
  }
  return {
    transcription: new MockTranscriptionProvider(),
    translation: new MockTranslationProvider(),
    providerName: 'mock',
  };
}

export function costRatesFor(env: ServerEnv): CostRates {
  return env.AI_PROVIDER === 'mock' ? MOCK_COST_RATES : DEFAULT_COST_RATES;
}
