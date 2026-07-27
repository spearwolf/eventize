import {fake} from 'sinon';

// Listener objects that record how they were called. Declaring the slots the
// methods write to is what the bare `@ts-expect-error` above each assignment
// used to stand in for — the suppression hid a missing type, not a real
// conflict.
type RecordingListener = {
  args?: Array<any>;
  context?: unknown;
  [method: string]: unknown;
};

import {EVENT_CATCH_EM_ALL} from './constants';
import {latestListener, latestListenerPair} from './__test-utils__/listeners';

import {
  eventize,
  Priority,
  getSubscriptionCount,
  on,
  once,
  emit,
} from './index';

describe('on()', () => {
  // ---------------------------------------------------------------------------------------------
  describe('eventName is a string', () => {
    describe('on( eventName, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = fake();
      const obj = eventize();
      let context: object;
      on(
        obj,
        'foo',
        7,
        function (this: object) {
          context = this;
        },
        listenerObject,
      );
      const listener = latestListener(obj);
      on(obj, 'foo', 0, listenerFunc, listenerObject);
      emit(obj, 'foo', 'bar', 666);

      it('subscription count', () => {
        expect(getSubscriptionCount(obj)).toBe(2);
      });
      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(7);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFuncName, listenerObject )', () => {
      const listenerObject: RecordingListener = {
        foo(...args: Array<any>) {
          this.args = args;
        },
      };
      const obj = eventize.inject();
      obj.on('foo', 9, 'foo', listenerObject);
      const listener = latestListener(obj);
      obj.emit('foo', 'bar', 666);

      it('subscription count', () => {
        expect(getSubscriptionCount(obj)).toBe(1);
      });
      it('emit() calls the listener', () => {
        expect(listenerObject.args).toEqual(['bar', 666]);
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(9);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFunc )', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on('foo', 11, listenerFunc);
      const listener = latestListener(obj);
      obj.emit('foo', 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(11);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, object )', () => {
      const listenerFunc = fake();
      let listenerContext: object;
      const listener = {
        foo(...args: Array<any>) {
          listenerContext = this;
          listenerFunc(...args);
        },
      };
      const obj = eventize.inject();
      obj.on('foo', 13, listener);
      const registered = latestListener(obj);

      it('priority is correct', () => {
        expect(registered.priority).toBe(13);
      });
      it('eventName is correct', () => {
        expect(registered.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(registered.isCatchEmAll).toBe(false);
      });

      obj.emit('foo', 'plah', 667);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 667)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(listener).toBe(listenerContext);
      });
    });
    describe('on( eventName, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = fake();
      const obj = eventize.inject();
      let context: object;
      obj.on(
        'foo',
        function (this: object) {
          context = this;
        },
        listenerObject,
      );
      const listener = latestListener(obj);
      obj.on('foo', listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      it('subscription count', () => {
        expect(getSubscriptionCount(obj)).toBe(2);
      });
      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(Priority.Normal);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, listenerFunc )', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on('foo', listenerFunc);
      const listener = latestListener(obj);
      obj.emit('foo', 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(Priority.Normal);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
  }); // eventName is a string
  // ---------------------------------------------------------------------------------------------
  describe('eventName is a symbol', () => {
    const Foo = Symbol('Foo');
    describe('on( eventName, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = fake();
      const obj = eventize.inject();
      let context: object;
      obj.on(
        Foo,
        7,
        function (this: object) {
          context = this;
        },
        listenerObject,
      );
      const listener = latestListener(obj);
      obj.on(Foo, 0, listenerFunc, listenerObject);
      obj.emit(Foo, 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(7);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe(Foo);
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFuncName, listenerObject )', () => {
      const listenerObject: RecordingListener = {
        foo(...args: Array<any>) {
          this.args = args;
        },
      };
      const obj = eventize.inject();
      obj.on(Foo, 9, 'foo', listenerObject);
      const listener = latestListener(obj);
      obj.emit(Foo, 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerObject.args).toEqual(['bar', 666]);
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(9);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe(Foo);
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFunc )', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on(Foo, 11, listenerFunc);
      const listener = latestListener(obj);
      obj.emit(Foo, 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(11);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe(Foo);
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, object )', () => {
      const listenerFunc = fake();
      let listenerContext: object;
      const listener = {
        [Foo](...args: Array<any>) {
          listenerContext = this;
          listenerFunc(...args);
        },
      };
      const obj = eventize.inject();
      obj.on(Foo, 13, listener);
      const registered = latestListener(obj);

      it('priority is correct', () => {
        expect(registered.priority).toBe(13);
      });
      it('eventName is correct', () => {
        expect(registered.eventName).toBe(Foo);
      });
      it('isCatchEmAll is correct', () => {
        expect(registered.isCatchEmAll).toBe(false);
      });

      obj.emit(Foo, 'plah', 667);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 667)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(listener).toBe(listenerContext);
      });
    });
    describe('on( eventName, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = fake();
      const obj = eventize.inject();
      let context: object;
      obj.on(
        Foo,
        function (this: object) {
          context = this;
        },
        listenerObject,
      );
      const listener = latestListener(obj);
      obj.on(Foo, listenerFunc, listenerObject);
      obj.emit(Foo, 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(Priority.Normal);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe(Foo);
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, listenerFunc )', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on(Foo, listenerFunc);
      const listener = latestListener(obj);
      obj.emit(Foo, 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priority is correct', () => {
        expect(listener.priority).toBe(Priority.Normal);
      });
      it('eventName is correct', () => {
        expect(listener.eventName).toBe(Foo);
      });
      it('isCatchEmAll is correct', () => {
        expect(listener.isCatchEmAll).toBe(false);
      });
    });
  }); // eventName is a symbol
  // ---------------------------------------------------------------------------------------------
  describe('eventName is an array', () => {
    describe('on( eventNameArray, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = fake();
      const obj = eventize.inject();
      const context: Array<object> = [];
      obj.on(
        ['foo', 'fu'],
        7,
        function (this: object) {
          context.push(this);
        },
        listenerObject,
      );
      const listeners = latestListenerPair(obj);
      obj.on(['foo', 'fu'], 0, listenerFunc, listenerObject);
      obj.emit(['foo', 'fu'], 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toEqual([listenerObject, listenerObject]);
      });
      it('priorites are correct', () => {
        expect(listeners[0].priority).toBe(7);
        expect(listeners[1].priority).toBe(7);
      });
      it('eventNames are correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('fu');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName*, priority, listenerFuncName, listenerObject )', () => {
      const mockFunc = fake();
      const listenerObject: RecordingListener = {
        foo(...args: Array<any>) {
          this.context = this;
          this.args = args;
          mockFunc(...args);
        },
      };
      const obj = eventize.inject();
      obj.on(['foo', 'fu'], 9, 'foo', listenerObject);
      const listeners = latestListenerPair(obj);
      obj.emit(['foo', 'fu'], 'bar', 666);

      it('emit() calls the listener', () => {
        expect(mockFunc.callCount).toBe(2);
        expect(listenerObject.args).toEqual(['bar', 666]);
        expect(listenerObject.context).toBe(listenerObject);
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(9);
        expect(listeners[1].priority).toBe(9);
      });
      it('eventNames is correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('fu');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName*, priority, listenerFunc )', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on(['foo', 'bar'], 11, listenerFunc);
      const listeners = latestListenerPair(obj);
      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(11);
        expect(listeners[1].priority).toBe(11);
      });
      it('eventNames are correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('bar');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName*, priority, object )', () => {
      const listenerFuncFoo = fake();
      const listenerFuncBar = fake();
      const obj = eventize.inject();

      obj.on(['foo', 'bar'], 13, {
        foo: listenerFuncFoo,
        bar: listenerFuncBar,
      });
      const listeners = latestListenerPair(obj);

      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(13);
        expect(listeners[1].priority).toBe(13);
      });
      it('eventNames are correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('bar');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });

      obj.emit(['foo', 'bar'], 'plah', 667);

      it('emit() calls the :foo listener', () => {
        expect(listenerFuncFoo.calledWith('plah', 667)).toBeTruthy();
      });
      it('emit() calls the :bar listener', () => {
        expect(listenerFuncBar.calledWith('plah', 667)).toBeTruthy();
      });
    });
    describe('on( eventName*, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = fake();
      const obj = eventize.inject();
      const contexts: unknown[] = [];
      obj.on(
        ['foo', 'bar'],
        function fooBar(this: unknown, ...args: any[]) {
          contexts.push(this);
          listenerFunc(...args);
        },
        listenerObject,
      );
      const listeners = latestListenerPair(obj);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(Priority.Normal);
        expect(listeners[1].priority).toBe(Priority.Normal);
      });
      it('eventNames are correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('bar');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });
      it('emit() calls the listener with correct context', () => {
        expect(contexts[0]).toBe(listenerObject);
        expect(contexts[1]).toBe(listenerObject);
      });
    });
    describe('on( eventName*, listenerFunc )', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on(['foo', 'bar'], listenerFunc);
      const listeners = latestListenerPair(obj);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(Priority.Normal);
        expect(listeners[1].priority).toBe(Priority.Normal);
      });
      it('eventNames are correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('bar');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName*, listenerFunc ) supports [ [eventName, PRIO], .. ]', () => {
      const listenerFunc = fake();
      const obj = eventize.inject();
      obj.on(
        [
          ['foo', 500],
          ['bar', 1000],
        ],
        listenerFunc,
      );
      const listeners = latestListenerPair(obj);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(500);
        expect(listeners[1].priority).toBe(1000);
      });
      it('eventNames are correct', () => {
        expect(listeners[0].eventName).toBe('foo');
        expect(listeners[1].eventName).toBe('bar');
      });
      it('isCatchEmAll is correct', () => {
        expect(listeners[0].isCatchEmAll).toBe(false);
        expect(listeners[1].isCatchEmAll).toBe(false);
      });
    });
  }); // eventName is an array
  // ---------------------------------------------------------------------------------------------
  describe('on( priority, listenerFunc, listenerObject ) => object.on( "*", priority, listenerFunc, listenerObject )', () => {
    const listenerObject = {};
    const listenerFunc = fake();
    const obj = eventize.inject();
    let context: object;
    obj.on(
      7,
      function (this: object) {
        context = this;
      },
      listenerObject,
    );
    const listener = latestListener(obj);
    obj.on(listenerFunc, listenerObject);
    obj.emit('foo', 'bar', 666);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
    });
    it('emit() calls the listener with correct context', () => {
      expect(context).toBe(listenerObject);
    });
    it('priority is correct', () => {
      expect(listener.priority).toBe(7);
    });
    it('eventName is correct', () => {
      expect(listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( priority, listenerFunc ) => object.on( "*", priority, listenerFunc )', () => {
    const listenerFunc = fake();
    const obj = eventize.inject();
    obj.on(11, listenerFunc);
    const listener = latestListener(obj);
    obj.emit('foo', 'plah', 669);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
    });
    it('priority is correct', () => {
      expect(listener.priority).toBe(11);
    });
    it('eventName is correct', () => {
      expect(listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( listenerFunc, listenerObject ) => object.on( "*", Priority.Normal, listenerFunc, listenerObject )', () => {
    const listenerObject = {};
    const listenerFunc = fake();
    const obj = eventize.inject();
    let context: object;
    obj.on(function (this: object) {
      context = this;
    }, listenerObject);
    const listener = latestListener(obj);
    obj.on(listenerFunc, listenerObject);
    obj.emit('foo', 'bar', 666);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
    });
    it('emit() calls the listener with correct context', () => {
      expect(context).toBe(listenerObject);
    });
    it('priority is correct', () => {
      expect(listener.priority).toBe(Priority.Normal);
    });
    it('eventName is correct', () => {
      expect(listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( listenerFunc ) => object.on( "*", Priority.Normal, listenerFunc )', () => {
    const listenerFunc = fake();
    const obj = eventize.inject();
    obj.on(listenerFunc);
    const listener = latestListener(obj);
    obj.emit('foo', 'plah', 669);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
    });
    it('priority is correct', () => {
      expect(listener.priority).toBe(Priority.Normal);
    });
    it('eventName is correct', () => {
      expect(listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( priority, object ) => object.on( "*", priority, object )', () => {
    const listenerFunc = fake();
    const obj = eventize.inject();
    obj.on(13, {foo: listenerFunc});
    const listener = latestListener(obj);
    obj.emit('foo', 'plah', 667);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 667)).toBeTruthy();
    });
    it('priority is correct', () => {
      expect(listener.priority).toBe(13);
    });
    it('eventName is correct', () => {
      expect(listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( object ) => object.on( "*", Priority.Normal, object )', () => {
    const listenerFunc = fake();
    const obj = eventize.inject();
    obj.on({foo: listenerFunc});
    const listener = latestListener(obj);
    obj.emit('foo', 'plah', 667);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 667)).toBeTruthy();
    });
    it('priority is correct', () => {
      expect(listener.priority).toBe(Priority.Normal);
    });
    it('eventName is correct', () => {
      expect(listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(listener.isCatchEmAll).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('insufficient arguments', () => {
    it('throws an Error instance (not a bare string)', () => {
      const obj = eventize();
      // @ts-expect-error - intentionally calling with insufficient args
      expect(() => on(obj)).toThrow(Error);
    });
    it('error message mentions insufficient arguments', () => {
      const obj = eventize();
      // @ts-expect-error - intentionally calling with insufficient args
      expect(() => on(obj)).toThrow(/insufficient arguments/);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // A truthy value that can never be dispatched used to be registered anyway:
  // `on(ε, 'foo', 5)` created an EventListener with no listenerType, every
  // emit() fell through all three branches of apply(), and the dead entry could
  // only be removed with off(). The same call with `0` threw, because `0` is
  // falsy — so a numeric value forwarded into the listener slot behaved
  // opposite ways depending on its value.
  describe('an unusable listener', () => {
    it('rejects a truthy non-listener instead of registering a dead subscription', () => {
      const obj = eventize();
      expect(() => on(obj, 'foo', 5 as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects the same value at the catch-all listener slot', () => {
      const obj = eventize();
      expect(() => on(obj, 42 as any)).toThrow(Error);
      expect(() => on(obj, 7, 42 as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects booleans and bigints too', () => {
      const obj = eventize();
      expect(() => on(obj, 'foo', true as any)).toThrow(Error);
      expect(() => on(obj, 'foo', 1n as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects an unusable listener behind an explicit priority', () => {
      const obj = eventize();
      expect(() => on(obj, 'foo', Priority.High, 5 as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('registers nothing for an array of event names', () => {
      const obj = eventize();
      expect(() => on(obj, ['foo', 'bar'], 5 as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects it in once() as well', () => {
      const obj = eventize();
      expect(() => once(obj, 'foo', 5 as any)).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('still rejects a falsy non-listener the way it always did', () => {
      const obj = eventize();
      expect(() => on(obj, 'foo', 0 as any)).toThrow(/insufficient arguments/);
      // '' is falsy but would pass a type-only filter as a method name — it
      // was rejected before this change and stays rejected.
      expect(() => on(obj, 'foo', '' as any, {})).toThrow(
        /insufficient arguments/,
      );
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('leaves every usable spelling alone', () => {
      const calls: string[] = [];
      const listenerObject = {foo: () => calls.push('object')};
      const methodHost = {handler: () => calls.push('method')};

      const obj = eventize();
      on(obj, 'foo', () => calls.push('func'));
      on(obj, 'foo', 'handler', methodHost);
      on(obj, 'foo', listenerObject);
      on(obj, Priority.Low, () => calls.push('catch-all'));
      on(obj, ['foo', 'bar'], () => calls.push('array'));
      on(obj, [['foo', Priority.High]], () => calls.push('tuple'));
      on(obj, {foo: () => calls.push('bare-object')});
      on(obj, 'foo', Symbol.iterator, {});

      expect(getSubscriptionCount(obj)).toBe(9);

      emit(obj, 'foo');
      expect(calls).toEqual([
        'tuple',
        'func',
        'method',
        'object',
        'array',
        'bare-object',
        'catch-all',
      ]);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // NaN is a number, so it passed the positional decoding as a priority — and
  // then poisoned it: `b.priority - a.priority` is NaN for every comparison, so
  // findInsertIndex() walked the binary search all the way right and the
  // listener landed at a position determined by the bucket size instead of by
  // its priority. No error, no warning, just the wrong call order.
  describe('a NaN priority', () => {
    it('rejects NaN as an explicit priority', () => {
      const obj = eventize();
      expect(() => on(obj, 'foo', NaN, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects NaN as a catch-all priority', () => {
      const obj = eventize();
      expect(() => on(obj, NaN, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects NaN arriving through Number() of an unparsable value', () => {
      const obj = eventize();
      const cfg = {prio: 'high-ish'};
      expect(() => on(obj, 'foo', Number(cfg.prio), () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects NaN inside a [name, priority] tuple', () => {
      const obj = eventize();
      expect(() => on(obj, [['foo', NaN]], () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('registers nothing when one tuple in a longer list carries NaN', () => {
      const obj = eventize();
      expect(() => on(obj, ['a', ['b', NaN], 'c'], () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects it in once() as well', () => {
      const obj = eventize();
      expect(() => once(obj, 'foo', NaN, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    // Priority.Max and Priority.Min are ±Infinity. Infinity is order-capable,
    // so the check has to be NaN-specific — Number.isFinite() would reject
    // both and break documented API.
    it('keeps Priority.Max, Priority.Min and Priority.Normal valid', () => {
      const obj = eventize();
      const calls: string[] = [];

      on(obj, 'foo', Priority.Min, () => calls.push('min'));
      on(obj, 'foo', Priority.Normal, () => calls.push('normal'));
      on(obj, 'foo', Priority.Max, () => calls.push('max'));

      expect(getSubscriptionCount(obj)).toBe(3);
      emit(obj, 'foo');
      expect(calls).toEqual(['max', 'normal', 'min']);
    });

    it('keeps ±Infinity valid inside a tuple, and keeps id tiebreaks stable', () => {
      const obj = eventize();
      const calls: string[] = [];

      on(obj, [['foo', Priority.Max]], () => calls.push('max-1'));
      on(obj, [['foo', Priority.Max]], () => calls.push('max-2'));
      on(obj, [['foo', Priority.Min]], () => calls.push('min'));

      emit(obj, 'foo');
      expect(calls).toEqual(['max-1', 'max-2', 'min']);
    });

    it('keeps a priority-less tuple falling back to the call-level priority', () => {
      const obj = eventize();
      const calls: string[] = [];

      // @ts-expect-error a one-element tuple is not an EventNameWithPriority
      on(obj, [['foo']], Priority.High, () => calls.push('tuple'));
      on(obj, 'foo', Priority.Normal, () => calls.push('plain'));

      emit(obj, 'foo');
      expect(calls).toEqual(['tuple', 'plain']);
    });
  });
});
