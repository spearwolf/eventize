import * as path from 'node:path';
import * as ts from 'typescript';

// What a consumer reads when a typed emit call is wrong. `@ts-expect-error`
// asserts that an error exists, never which one, so the specs elsewhere stay
// green whether the message names the mistake or sends the reader after a
// `never` on the first argument. This file compiles a snippet of mistakes with
// the repo's own tsconfig and reads the diagnostic text itself.
//
// The text depends on how many overloads fail on the arguments. Up to three,
// TypeScript elaborates each one — and the first, the typed one, names the
// actual mistake. From four on it elaborates only the last, which on every
// emit function is the overload closed to typed emitters: "not assignable to
// parameter of type 'never'", for every typo in every typed call. That is the
// ceiling the overload sets in `src/emit-api.ts` and `src/types.ts` are built
// under, and what this spec holds them to.

const ROOT = path.resolve(__dirname, '..');
const SNIPPET = path.join(ROOT, 'src', '__typed-emit-diagnostics__.ts');

const SURFACES = [
  'emit(ε, ',
  'emitAsync(ε, ',
  'emitSafe(ε, ',
  'emitSafeAsync(ε, ',
  'emitStrict(ε, ',
  'emitStrictAsync(ε, ',
  'race.emit(',
  'race.emitAsync(',
  'race.emitSafe(',
  'race.emitSafeAsync(',
  'race.emitStrict(',
  'race.emitStrictAsync(',
];

const snippet = (calls: string[]) => `
import {emit, emitAsync, emitSafe, emitSafeAsync, emitStrict, emitStrictAsync, eventize, Eventize} from './index';
interface RaceEvents {
  land: [impactSpeed: number];
  lap: [lap: number, lapTime: number, isBest: boolean];
}
const ε = eventize<RaceEvents>();
const race = new (class extends Eventize<RaceEvents> {})();
${calls.join('\n')}
`;

const diagnosticsOf = (source: string): string[] => {
  const configPath = path.join(ROOT, 'tsconfig.json');
  const {config} = ts.readConfigFile(configPath, ts.sys.readFile);
  const {options} = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);

  const host = ts.createCompilerHost({...options, noEmit: true});
  const {getSourceFile, fileExists, readFile} = host;
  host.fileExists = (file) => file === SNIPPET || fileExists(file);
  host.readFile = (file) => (file === SNIPPET ? source : readFile(file));
  host.getSourceFile = (file, languageVersion, ...rest) =>
    file === SNIPPET
      ? ts.createSourceFile(file, source, languageVersion, true)
      : getSourceFile(file, languageVersion, ...rest);

  const program = ts.createProgram([SNIPPET], options, host);
  return program
    .getSemanticDiagnostics(program.getSourceFile(SNIPPET))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
};

describe('the diagnostic a typed emit call reports', () => {
  // One program for both cases: building it type-checks the whole of `src/`
  // reachable from the index, which is the expensive part.
  let payloadErrors: string[];
  let nameErrors: string[];

  beforeAll(() => {
    const payloadCalls = SURFACES.map((call) => `${call}'land', 'fast');`);
    const nameCalls = SURFACES.map((call) => `${call}'nope', 1);`);
    const all = diagnosticsOf(snippet([...payloadCalls, ...nameCalls]));
    payloadErrors = all.slice(0, SURFACES.length);
    nameErrors = all.slice(SURFACES.length);
    expect(all).toHaveLength(2 * SURFACES.length);
  }, 60_000);

  it('names the mistaken payload, on all twelve surfaces', () => {
    for (const message of payloadErrors) {
      expect(message).toContain(
        "Argument of type 'string' is not assignable to parameter of type 'number'",
      );
    }
  });

  it('names the undeclared event, on all twelve surfaces', () => {
    for (const message of nameErrors) {
      expect(message).toContain(`Argument of type '"nope"' is not assignable`);
    }
  });

  it('never collapses to the last overload alone', () => {
    for (const message of [...payloadErrors, ...nameErrors]) {
      expect(message).not.toContain(
        'The last overload gave the following error',
      );
    }
  });
});
