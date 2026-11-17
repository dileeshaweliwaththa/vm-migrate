import { describe, expect, it } from 'vitest';
import { isUuid } from '@/lib/ids';

describe('isUuid', () => {
  it('accepts a uuid in either case', () => {
    expect(isUuid('5a55d835-27a5-461a-89e4-5929732e72ad')).toBe(true);
    expect(isUuid('5A55D835-27A5-461A-89E4-5929732E72AD')).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['a slug', 'my-project'],
    ['truncated', '5a55d835-27a5-461a-89e4-5929732e72a'],
    ['too long', '5a55d835-27a5-461a-89e4-5929732e72ad0'],
    ['no dashes', '5a55d83527a5461a89e45929732e72ad'],
    ['not hex', '5a55d835-27a5-461a-89e4-5929732e72zz'],
    ['padded', ' 5a55d835-27a5-461a-89e4-5929732e72ad'],
  ])('rejects %s', (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });
});
