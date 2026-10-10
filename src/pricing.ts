import type { TokenUsage } from "./transcripts.ts";

type Rates = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
};

const rates = (input: number, output: number, cacheRead: number): Rates => ({
  input,
  output,
  cacheRead,
  cacheWrite5m: input * 1.25,
  cacheWrite1h: input * 2,
});

const PER_MILLION_TOKENS = new Map<string, Rates>([
  ["claude-fable-5-1", rates(10, 50, 0.25)],
  ["claude-fable-5", rates(10, 50, 1)],
  ["claude-opus-5-5", rates(4, 20, 0.2)],
  ["claude-opus-5", rates(5, 25, 0.5)],
  ["claude-opus-4-8", rates(5, 25, 0.5)],
  ["claude-opus-4-7", rates(5, 25, 0.5)],
  ["claude-opus-4-6", rates(5, 25, 0.5)],
  ["claude-sonnet-5-5", rates(2, 10, 0.2)],
  ["claude-sonnet-5", rates(2, 10, 0.2)],
  ["claude-sonnet-4-6", rates(3, 15, 0.3)],
  ["claude-haiku-5-5", rates(0.1, 0.5, 0.01)],
  ["claude-haiku-4-5", rates(1, 5, 0.1)],
]);

const DATE_SUFFIX = /-\d{8}$/;

export const usedTokens = (usage: TokenUsage): boolean => usage.output_tokens > 0;

export const costUsd = (model: string, usage: TokenUsage): number | undefined => {
  const price = PER_MILLION_TOKENS.get(model.replace(DATE_SUFFIX, ""));
  if (!price) return undefined;
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      usage.cache_read_input_tokens * price.cacheRead +
      usage.cache_creation.ephemeral_5m_input_tokens * price.cacheWrite5m +
      usage.cache_creation.ephemeral_1h_input_tokens * price.cacheWrite1h) /
    1_000_000
  );
};
