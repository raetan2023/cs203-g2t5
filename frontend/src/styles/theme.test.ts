import { describe, expect, it } from 'vitest';
import tokensCss from './tokens.css?inline';
import { colors, cssVar } from './theme';

function declaredTokens() {
  return new Map([...tokensCss.matchAll(/(--bb-[a-z0-9-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}

describe('theme.ts mirrors tokens.css', () => {
  it('has a matching token with the same value for every colour', () => {
    const tokens = declaredTokens();
    for (const [key, value] of Object.entries(colors)) {
      expect(tokens.get(cssVar(key as keyof typeof colors)), key).toBe(value);
    }
  });
});
