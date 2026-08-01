import {NAMESPACE} from './constants';
import {Eventize, eventize, getEventizeProtocol} from './index';

const markAsForeign = <T extends object>(obj: T, payload: unknown): T => {
  Object.defineProperty(obj, NAMESPACE, {value: payload, configurable: true});
  return obj;
};

describe('getEventizeProtocol()', () => {
  it('answers with the protocol of an object this copy eventized', () => {
    expect(getEventizeProtocol(eventize())).toBe(6);
  });

  it('answers for a class Eventize instance too', () => {
    class Foo extends Eventize {}
    expect(getEventizeProtocol(new Foo())).toBe(6);
  });

  it('answers undefined for a plain object', () => {
    expect(getEventizeProtocol({})).toBeUndefined();
  });

  it('answers undefined for null, undefined and primitives without throwing', () => {
    expect(getEventizeProtocol(null)).toBeUndefined();
    expect(getEventizeProtocol(undefined)).toBeUndefined();
    expect(getEventizeProtocol(0)).toBeUndefined();
    expect(getEventizeProtocol('foo')).toBeUndefined();
    expect(getEventizeProtocol(Symbol('foo'))).toBeUndefined();
  });

  it('reports the protocol of a foreign marker instead of throwing', () => {
    const obj = markAsForeign({}, {protocol: 7, store: {}, keeper: {}});
    expect(getEventizeProtocol(obj)).toBe(7);
  });

  it('answers undefined for a marker from a copy that predates the protocol field', () => {
    // A pre-v6 marker carries the slot but no protocol. `undefined` here plus
    // `isEventized() === true` is what tells "not eventized" apart from
    // "eventized by an older copy".
    const obj = markAsForeign({}, {store: {}, keeper: {}});
    expect(getEventizeProtocol(obj)).toBeUndefined();
  });

  it('answers undefined for a marker whose protocol is not a number', () => {
    const obj = markAsForeign({}, {protocol: '6'});
    expect(getEventizeProtocol(obj)).toBeUndefined();
  });

  it('answers undefined for a marker that is not an object at all', () => {
    const obj = markAsForeign({}, true);
    expect(getEventizeProtocol(obj)).toBeUndefined();
  });

  it('never throws — it is the tool for diagnosing before the bang', () => {
    const obj = markAsForeign({}, {protocol: 7, store: {}, keeper: {}});
    expect(() => getEventizeProtocol(obj)).not.toThrow();
  });
});
