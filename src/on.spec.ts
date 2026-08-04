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
  off,
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
  // One thrown message, `subscribeTo() called with insufficient arguments`,
  // covers seven distinct causes — a missing listener, a value that cannot be
  // dispatched at all, an empty method name, a method name with no listener
  // object to read it from, an empty array of event names, a sparse array of
  // event names, and an array entry that is not an event name. The wording is
  // frozen (it predates v4 and is documented), but the cause that produced it
  // now rides along on Error.cause so a bug report doesn't have to guess from
  // a string that is wrong six times out of seven. The argument-shaped ones
  // are below; 'empty-names', 'sparse-names' and 'invalid-name' are pinned
  // with the rest of the array behaviour further down this file.
  describe('Error.cause distinguishes the argument-shape causes', () => {
    it('is "missing-listener" when the listener argument is absent', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        // @ts-expect-error - intentionally calling with insufficient args
        on(obj, 'foo');
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('missing-listener');
    });

    it('is "not-dispatchable" for a value that can never be a listener', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, 'foo', 5 as any);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('not-dispatchable');
    });

    it('is "empty-method-name" for an empty string in the method slot', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, 'foo', '' as any, {});
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('empty-method-name');
    });

    it('is "missing-listener-object" for a method name with nothing to read it from', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, 'foo', 'handler', null as unknown as object);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('missing-listener-object');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // A method-name listener resolves its method off the listener object at
  // dispatch time, so the object may acquire the method later — that is late
  // binding, and it stays supported. What can never grow is the object slot
  // itself: nothing writes it after registration except detach(), so a
  // method-name subscription registered without one is dead for good. It used
  // to register anyway, count towards getSubscriptionCount(), dispatch to
  // nothing, and — for once() — hold the emitter through an obligation that
  // could never settle. Rejected before registration now, atomically, so the
  // counter is the assertion that matters here.
  describe('a method-name subscription without a listener object', () => {
    it('rejects a null listener object instead of registering a dead subscription', () => {
      const obj = eventize();
      expect(() =>
        on(obj, 'foo', 'handler', null as unknown as object),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects an undefined listener object', () => {
      const obj = eventize();
      expect(() =>
        on(obj, 'foo', 'handler', undefined as unknown as object),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects a symbol method name without a listener object', () => {
      const obj = eventize();
      expect(() =>
        on(obj, 'foo', Symbol('handler'), null as unknown as object),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    // This spelling is decoded by the leading-number branch, so the cause is
    // the assertion that matters: a shift in the positional decoding would
    // land the method name in the listener slot of some other branch and this
    // case would stay green as 'not-dispatchable'.
    it('rejects the catch-all spelling with a priority', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, Priority.High, 'handler', null as unknown as object);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).cause).toBe('missing-listener-object');
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects it for an array of event names, registering none of them', () => {
      const obj = eventize();
      expect(() =>
        on(obj, ['foo', 'bar'], 'handler', null as unknown as object),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects it in once() as well', () => {
      const obj = eventize();
      expect(() =>
        once(obj, 'foo', 'handler', null as unknown as object),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    // The counter-example: an object that has no such method *yet* is the
    // documented late-bound shape and must keep registering.
    it('keeps a listener object without the method registered', () => {
      const obj = eventize();
      const listenerObject: Record<string, unknown> = {};
      expect(() => on(obj, 'foo', 'handler', listenerObject)).not.toThrow();
      expect(getSubscriptionCount(obj)).toBe(1);

      const calls: string[] = [];
      emit(obj, 'foo', 1);
      listenerObject['handler'] = (val: number) => calls.push(`late:${val}`);
      emit(obj, 'foo', 2);
      expect(calls).toEqual(['late:2']);
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

    // The one rejection with its own message — so a catch block built around
    // the documented cause vocabulary needs it to carry a cause too, or this
    // single case is the one that falls back to matching text.
    it('carries the "invalid-priority" cause on Error.cause', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, 'foo', NaN, () => {});
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/NaN priority/);
      expect((caught as Error).cause).toBe('invalid-priority');
    });

    it('carries the same cause for a non-number in a tuple', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, [['foo', 'high' as unknown as number]], () => {});
      } catch (error) {
        caught = error;
      }
      expect((caught as Error).cause).toBe('invalid-priority');
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

  // ---------------------------------------------------------------------------------------------
  // Number.isNaN() answers false for every non-number value, not just for the
  // literal NaN it was written to catch — so a string, boolean or object
  // arriving in the priority slot poisoned sortByPriorityAndId() exactly like
  // NaN did, without tripping the guard. The [name, priority] tuple's second
  // slot is the one spot that reaches assertPriorityIsUsable() without a
  // typeof gate at branch selection, so that is where an untyped call site
  // (a cast, or plain JS with no type checker at all) can smuggle one in.
  describe('a non-number priority', () => {
    it('rejects a non-number value inside a [name, priority] tuple', () => {
      const obj = eventize();
      expect(() =>
        on(obj, [['foo', 'high' as unknown as number]], () => {}),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects a boolean inside a [name, priority] tuple', () => {
      const obj = eventize();
      expect(() =>
        on(obj, [['foo', true as unknown as number]], () => {}),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('registers nothing when one tuple in a longer list carries a non-number priority', () => {
      const obj = eventize();
      expect(() =>
        on(obj, ['a', ['b', {} as unknown as number], 'c'], () => {}),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('keeps ±Infinity valid inside a tuple', () => {
      const obj = eventize();
      const calls: string[] = [];
      on(obj, [['foo', Priority.Max]], () => calls.push('max'));
      expect(getSubscriptionCount(obj)).toBe(1);
      emit(obj, 'foo');
      expect(calls).toEqual(['max']);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The array branch maps over the event names and registers one listener per
  // name — an empty array registers nothing, so on(ε, [], h) and
  // once(ε, [], h) used to return a handle for zero subscriptions with no
  // warning and no throw, and onceAsync(ε, []) resolved a promise that never
  // settles. Rejected atomically, before anything is registered, the same way
  // a NaN in one tuple rejects the whole call.
  describe('an empty array of event names', () => {
    it('rejects on() with an empty array instead of registering nothing', () => {
      const obj = eventize();
      expect(() => on(obj, [], () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects once() with an empty array instead of registering nothing', () => {
      const obj = eventize();
      expect(() => once(obj, [], () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('carries the "empty-names" cause on Error.cause', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, [], () => {});
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('empty-names');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // A hole is a missing element, not a value — an untyped call site can still
  // hand one to on()/once()/onceAsync() (`new Array(2)`, or an array grown by
  // setting `.length` past its last write). ESLint's `no-sparse-arrays`
  // forbids the `['a', , 'b']` literal spelling, so the cases below build one
  // with `Object.assign(new Array(n), {...})` instead — same hole, no lint
  // exemption needed. Rejected atomically, the same
  // treatment as an empty array and for the same reason: letting per-name
  // resolution silently skip the hole would register a subset of the names
  // instead of throwing, and a once()/onceAsync() over an all-holes array
  // would register nothing at all and hand back a handle — or a promise —
  // that never does anything, exactly the failure the empty-names guard
  // exists to prevent for `[]`.
  describe('a sparse array of event names', () => {
    it('rejects on() with a hole in the middle instead of registering only the other names', () => {
      const obj = eventize();
      expect(() =>
        on(
          obj,
          Object.assign(new Array(3), {0: 'a', 2: 'b'}) as unknown as string[],
          () => {},
        ),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects on() with an array of nothing but holes', () => {
      const obj = eventize();
      expect(() => on(obj, new Array(2), () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects once() with a hole in the middle instead of registering only the other names', () => {
      const obj = eventize();
      expect(() =>
        once(
          obj,
          Object.assign(new Array(3), {0: 'a', 2: 'b'}) as unknown as string[],
          () => {},
        ),
      ).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects once() with an array of nothing but holes', () => {
      const obj = eventize();
      expect(() => once(obj, new Array(2), () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('carries the "sparse-names" cause on Error.cause', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(
          obj,
          Object.assign(new Array(3), {0: 'a', 2: 'b'}) as unknown as string[],
          () => {},
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('sparse-names');
    });

    // An element explicitly set to `undefined` is a value, not a hole, and
    // this guard must not be the one that catches it. It is rejected all the
    // same — `undefined` is no more an event name than `null` is — but by the
    // entry check below, which is what the cause has to say. Reading it off
    // the message alone would not tell the two apart: they share one.
    it('does not treat an explicit undefined element as a hole', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, ['a', undefined, 'b'] as any, () => {});
      } catch (error) {
        caught = error;
      }
      expect((caught as Error).cause).toBe('invalid-name');
      expect(getSubscriptionCount(obj)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The array branch used to check the array — empty, holey — but never its
  // elements, so anything at all could become an event name. A number is the
  // worst of them: `on(ε, [123], fn)` registered a bucket under `123` and
  // counted, but `off(ε, 123)` could not address it, because isEventName(123)
  // is false and the removal falls through to identity matching instead.
  // `on()` accepted a name the name-based half of `off()` does not know.
  // Rejected atomically now, like the two array guards it stands next to.
  describe('an array entry that is not an event name', () => {
    it('rejects a number', () => {
      const obj = eventize();
      expect(() => on(obj, [123] as any, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects null', () => {
      const obj = eventize();
      expect(() => on(obj, [null] as any, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects an empty array as an entry', () => {
      const obj = eventize();
      expect(() => on(obj, [[]] as any, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects a non-name in the first slot of a [name, priority] tuple', () => {
      const obj = eventize();
      expect(() => on(obj, [[123, Priority.High]] as any, () => {})).toThrow(
        Error,
      );
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('registers nothing when one entry in a longer list is not a name', () => {
      const obj = eventize();
      expect(() => on(obj, ['a', 123, 'c'] as any, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects it in once() as well', () => {
      const obj = eventize();
      expect(() => once(obj, [123] as any, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('carries the "invalid-name" cause on Error.cause', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, [123] as any, () => {});
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('invalid-name');
    });

    // Symbols are event names, and an array of them has to stay one.
    it('keeps a symbol entry valid', () => {
      const obj = eventize();
      const name = Symbol('foo');
      expect(() => on(obj, [name], () => {})).not.toThrow();
      expect(getSubscriptionCount(obj)).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The array is not the only way in. The branch that decodes
  // `on(ε, name, priority, listener)` selects on `typeof args[1] === 'number'`
  // alone and then takes args[0] as the event name without ever asking what it
  // is — so the same class of dead registration the array-entry check above
  // rejects was reachable one branch over, from the same kind of untyped call
  // site, and with the same consequence: a bucket under a value `emit()`
  // cannot reach and the name-based half of `off()` cannot address.
  describe('a single event name that is not an event name', () => {
    it('rejects an object in the name slot ahead of a priority', () => {
      const obj = eventize();
      expect(() => on(obj, {} as any, 10, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects null in the name slot ahead of a priority', () => {
      const obj = eventize();
      expect(() => on(obj, null as any, 10, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    // Four arguments, so the leading number is decoded as a name rather than
    // as a catch-all priority — the one spelling that puts a number in the
    // name slot of this branch.
    it('rejects a number in the name slot ahead of a priority', () => {
      const obj = eventize();
      expect(() => on(obj, 5 as any, 10, () => {}, {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('rejects it in once() as well', () => {
      const obj = eventize();
      expect(() => once(obj, null as any, 10, () => {})).toThrow(Error);
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    it('carries the "invalid-name" cause on Error.cause', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, {} as any, 10, () => {});
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/insufficient arguments/);
      expect((caught as Error).cause).toBe('invalid-name');
    });

    // The name gate reports before the priority gate, on this branch exactly
    // as inside an array entry: a call that is wrong about where the listener
    // is filed is answered for that before it is answered for the order it is
    // filed in.
    it('reports the name before the priority when both are wrong', () => {
      const obj = eventize();
      let caught: unknown;
      try {
        on(obj, {} as any, NaN, () => {});
      } catch (error) {
        caught = error;
      }
      expect((caught as Error).cause).toBe('invalid-name');
      expect(getSubscriptionCount(obj)).toBe(0);
    });

    // The catch-all forms reach the same gate with '*' filled in by the
    // decoding, and a symbol name reaches it as itself — neither may trip it.
    it('leaves the catch-all and symbol spellings alone', () => {
      const obj = eventize();
      expect(() => on(obj, 10, () => {})).not.toThrow();
      expect(() => on(obj, Symbol('foo'), 10, () => {})).not.toThrow();
      expect(() => on(obj, () => {})).not.toThrow();
      expect(getSubscriptionCount(obj)).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('an object listener with a trailing context object', () => {
    it('registers, dispatches, and is removable by the context', () => {
      const ε = eventize();
      const owner = {};
      const listenerObject = {foo: jest.fn()};

      on(ε, 'foo', listenerObject, owner);
      emit(ε, 'foo', 42);

      expect(listenerObject.foo).toHaveBeenCalledWith(42);
      expect(getSubscriptionCount(ε)).toBe(1);

      off(ε, owner);
      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it('makes the context part of the dedup identity', () => {
      const ε = eventize();
      const listenerObject = {foo: jest.fn()};
      const ownerA = {};
      const ownerB = {};

      on(ε, 'foo', listenerObject, ownerA);
      on(ε, 'foo', listenerObject, ownerB);
      expect(getSubscriptionCount(ε)).toBe(2);

      on(ε, 'foo', listenerObject, ownerA);
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('takes the same shape as a catch-all, with and without a priority', () => {
      const ε = eventize();
      const owner = {};
      const listenerObjectA = {foo: jest.fn()};
      const listenerObjectB = {foo: jest.fn()};

      on(ε, listenerObjectA, owner);
      on(ε, 10, listenerObjectB, owner);
      expect(getSubscriptionCount(ε)).toBe(2);

      emit(ε, 'foo', 42);
      expect(listenerObjectA.foo).toHaveBeenCalledWith(42);
      expect(listenerObjectB.foo).toHaveBeenCalledWith(42);

      off(ε, owner);
      expect(getSubscriptionCount(ε)).toBe(0);
    });

    // The fourth position an object listener can occupy: a named subscription
    // that also carries a priority. Branch B of `_subscribeTo()` decodes it,
    // so the fourth argument lands in `listenerObject` exactly as it does in
    // the three siblings above.
    it('registers, dispatches, and is removable by the context, with a name and a priority', () => {
      const ε = eventize();
      const owner = {};
      const listenerObject = {foo: jest.fn()};

      on(ε, 'foo', 10, listenerObject, owner);
      emit(ε, 'foo', 42);

      expect(listenerObject.foo).toHaveBeenCalledWith(42);
      expect(getSubscriptionCount(ε)).toBe(1);

      off(ε, owner);
      expect(getSubscriptionCount(ε)).toBe(0);
    });

    it('makes the context part of the dedup identity, with a name and a priority', () => {
      const ε = eventize();
      const listenerObject = {foo: jest.fn()};
      const ownerA = {};
      const ownerB = {};

      on(ε, 'foo', 10, listenerObject, ownerA);
      on(ε, 'foo', 10, listenerObject, ownerB);
      expect(getSubscriptionCount(ε)).toBe(2);

      on(ε, 'foo', 10, listenerObject, ownerA);
      expect(getSubscriptionCount(ε)).toBe(2);
    });

    it('honours the priority of a named object listener with a context', () => {
      const ε = eventize();
      const order: string[] = [];
      const owner = {};

      on(ε, 'foo', Priority.Low, () => order.push('low'));
      on(ε, 'foo', 10, {foo: () => order.push('object')}, owner);
      on(ε, 'foo', Priority.High, () => order.push('high'));

      emit(ε, 'foo');
      expect(order).toEqual(['high', 'object', 'low']);
    });

    // The four shapes are only ever exercised against on() elsewhere in this
    // file, on the grounds that on() and once() carry byte-identical overload
    // sets. That holds exactly as long as nobody edits one of them, so the
    // once() side gets its own witness for the family.
    it('is accepted by once(), which fires one dispatch and releases the context', () => {
      const ε = eventize();
      const owner = {};
      const named = {foo: jest.fn()};
      const namedWithPriority = {foo: jest.fn()};
      const catchAll = {foo: jest.fn()};
      const catchAllWithPriority = {foo: jest.fn()};

      once(ε, 'foo', named, owner);
      once(ε, 'foo', 10, namedWithPriority, owner);
      once(ε, catchAll, owner);
      once(ε, 20, catchAllWithPriority, owner);
      expect(getSubscriptionCount(ε)).toBe(4);

      emit(ε, 'foo', 42);
      emit(ε, 'foo', 43);

      expect(named.foo).toHaveBeenCalledTimes(1);
      expect(named.foo).toHaveBeenCalledWith(42);
      expect(namedWithPriority.foo).toHaveBeenCalledTimes(1);
      expect(catchAll.foo).toHaveBeenCalledTimes(1);
      expect(catchAllWithPriority.foo).toHaveBeenCalledTimes(1);
      expect(getSubscriptionCount(ε)).toBe(0);
    });
  });

  describe('a catch-all method-name subscription with a priority', () => {
    it('resolves the method on the listener object for every event', () => {
      const ε = eventize();
      const host = {handler: jest.fn()};

      on(ε, 10, 'handler', host);
      emit(ε, 'foo', 1, 2);
      emit(ε, 'bar', 3);

      expect(host.handler).toHaveBeenNthCalledWith(1, 1, 2);
      expect(host.handler).toHaveBeenNthCalledWith(2, 3);
    });

    it('honours the priority against other catch-all listeners', () => {
      const ε = eventize();
      const order: string[] = [];
      const host = {handler: () => order.push('method')};

      on(ε, Priority.High, () => order.push('high'));
      on(ε, 10, 'handler', host);
      on(ε, Priority.Low, () => order.push('low'));
      emit(ε, 'foo');

      expect(order).toEqual(['high', 'method', 'low']);
    });
  });
});
