import { describe, expect, it } from 'vitest';
import { conjugatedVerb } from './inflection';

// The する-verb NAI stem is し, not しな, so the negative forms don't come out with a doubled な
// (運転しなない).
describe('する verbs: negative (NAI) forms', () => {
  const suru = (verb: string, form: string) => conjugatedVerb(verb, 'SURU', form);

  it('has a single な in every NAI form', () => {
    expect(suru('運転する', 'negative')).toBe('運転しない');
    expect(suru('運転する', 'negative て-form')).toBe('運転しなくて');
    expect(suru('運転する', 'past negative')).toBe('運転しなかった');
    expect(suru('運転する', '"don\'t do please"')).toBe('運転しないでください');
    expect(suru('運転する', '"without"')).toBe('運転しないで');
    expect(suru('運転する', 'must (informal)')).toBe('運転しなきゃ');
    expect(suru('運転する', 'must (formal)')).toBe('運転しなくてはいけない');
  });

  it('covers bare する and nouns listed without する', () => {
    expect(suru('する', 'negative')).toBe('しない');
    expect(suru('サービス', 'past negative')).toBe('サービスしなかった');
  });

  it('leaves the other する forms and godan/ichidan negatives as they were', () => {
    expect(suru('運転する', 'polite non past')).toBe('運転します');
    expect(suru('運転する', 'imperative')).toBe('運転しろ');
    expect(suru('運転する', 'past')).toBe('運転した');
    expect(suru('運転する', 'continuing')).toBe('運転している');
    expect(suru('運転する', 'nominalization')).toBe('運転すること');
    expect(conjugatedVerb('飲む', 'GODAN', 'negative')).toBe('飲まない');
    expect(conjugatedVerb('食べる', 'ICHIDAN', 'past negative')).toBe('食べなかった');
    expect(conjugatedVerb('出来る', 'ICHIDAN', 'negative')).toBe('出来ない');
  });
});
