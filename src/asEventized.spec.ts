import {eventize, Eventize} from './index';
import {asEventized} from './asEventized';
import {isEventized} from './isEventized';

describe('asEventized() on a non-extensible object', () => {
  it('reports the cause when the object is frozen', () => {
    const obj = Object.freeze({});
    expect(() => asEventized(obj)).toThrow(
      /eventize\(\) cannot attach to a non-extensible object/,
    );
  });

  it('reports the cause when the object only had extensions prevented', () => {
    const obj = Object.preventExtensions({});
    expect(() => asEventized(obj)).toThrow(
      /eventize\(\) cannot attach to a non-extensible object/,
    );
  });

  it('reports the cause when the object is sealed', () => {
    const obj = Object.seal({});
    expect(() => asEventized(obj)).toThrow(
      /eventize\(\) cannot attach to a non-extensible object/,
    );
  });

  it('names the workaround: eventize before freezing, or eventize a wrapper', () => {
    const obj = Object.freeze({});
    expect(() => asEventized(obj)).toThrow(
      /eventize before freezing, or eventize a wrapper/,
    );
  });

  it('throws the same error class the native defineProperty failure would have — TypeError', () => {
    const obj = Object.freeze({});
    expect(() => asEventized(obj)).toThrow(TypeError);
  });

  it('surfaces through the eventize() standalone surface', () => {
    const obj = Object.freeze({});
    expect(() => eventize(obj)).toThrow(
      /eventize\(\) cannot attach to a non-extensible object/,
    );
  });

  it('surfaces through the eventize.inject() surface', () => {
    const obj = Object.freeze({});
    expect(() => eventize.inject(obj)).toThrow(
      /eventize\(\) cannot attach to a non-extensible object/,
    );
  });

  it('does not affect class Eventize: the instance is eventized before user code can freeze it', () => {
    // `class Eventize` always eventizes a freshly allocated, extensible
    // instance in its own constructor — there is no way for caller code to
    // freeze `this` before that call runs, so this surface never reaches the
    // new branch. Freezing afterwards is fine, because the marker already
    // exists.
    class Foo extends Eventize {}
    const foo = new Foo();
    expect(() => Object.freeze(foo)).not.toThrow();
    expect(isEventized(foo)).toBe(true);
  });

  it('is a no-op on an already-eventized object that got frozen afterwards', () => {
    // asEventized() must check isEventized() before it ever looks at
    // extensibility, or a legitimately eventized-then-frozen object would
    // start throwing on a second, harmless call.
    const obj = eventize();
    Object.freeze(obj);
    expect(() => asEventized(obj)).not.toThrow();
    expect(asEventized(obj)).toBe(obj);
  });
});
