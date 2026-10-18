import { osaDistance } from '../../src/core/answer/osa';
import { goldenSuite } from './harness';

goldenSuite<{ a: string; b: string }, number>('answers/osa.json', (input) => osaDistance(input.a, input.b));
