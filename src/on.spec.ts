/* eslint-env jest */
import sinon from 'sinon';

import {EVENT_CATCH_EM_ALL} from './constants';

import eventize, {PRIO_DEFAULT} from '.';

describe('on()', () => {
  describe('eventName is a string', () => {
    describe('on( eventName, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      let context: Object;
      const unsubscribe = obj.on(
        'foo',
        7,
        function () {
          // @ts-ignore
          context = this;
        },
        listenerObject,
      );
      obj.on('foo', 0, listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.priority).toBe(7);
      });
      it('eventName is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFuncName, listenerObject )', () => {
      const listenerObject = {
        foo(...args: Array<any>) {
          // @ts-ignore
          this.args = args;
        },
      };
      const obj = eventize({});
      const unsubscribe = obj.on('foo', 9, 'foo', listenerObject);
      obj.emit('foo', 'bar', 666);

      it('emit() calls the listener', () => {
        // @ts-ignore
        expect(listenerObject.args).toEqual(['bar', 666]);
      });
      it('priority is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.priority).toBe(9);
      });
      it('eventName is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFunc )', () => {
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      const unsubscribe = obj.on('foo', 11, listenerFunc);
      obj.emit('foo', 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priority is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.priority).toBe(11);
      });
      it('eventName is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, object )', () => {
      const listenerFunc = sinon.fake();
      let listenerContext: Object;
      const listener = {
        foo(...args: Array<any>) {
          listenerContext = this;
          listenerFunc(...args);
        },
      };
      const obj = eventize({});
      const unsubscribe = obj.on('foo', 13, listener);

      it('priority is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.priority).toBe(13);
      });
      it('eventName is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.isCatchEmAll).toBe(false);
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
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      let context: Object;
      const unsubscribe = obj.on(
        'foo',
        function () {
          // @ts-ignore
          context = this;
        },
        listenerObject,
      );
      obj.on('foo', listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.priority).toBe(PRIO_DEFAULT);
      });
      it('eventName is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, listenerFunc )', () => {
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      const unsubscribe = obj.on('foo', listenerFunc);
      obj.emit('foo', 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priority is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.priority).toBe(PRIO_DEFAULT);
      });
      it('eventName is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        // @ts-ignore
        expect(unsubscribe.listener.isCatchEmAll).toBe(false);
      });
    });
  }); // eventName is a string

  describe('eventName is an array', () => {
    describe('on( eventNameArray, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      const context: Array<Object> = [];
      // @ts-ignore
      const {listeners} = obj.on(
        ['foo', 'fu'],
        7,
        function () {
          // @ts-ignore
          context.push(this);
        },
        listenerObject,
      );
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
      const mockFunc = sinon.fake();
      const listenerObject = {
        foo(...args: Array<any>) {
          // @ts-ignore
          this.context = this;
          // @ts-ignore
          this.args = args;
          mockFunc(...args);
        },
      };
      const obj = eventize({});
      // @ts-ignore
      const {listeners} = obj.on(['foo', 'fu'], 9, 'foo', listenerObject);
      obj.emit(['foo', 'fu'], 'bar', 666);

      it('emit() calls the listener', () => {
        expect(mockFunc.callCount).toBe(2);
        // @ts-ignore
        expect(listenerObject.args).toEqual(['bar', 666]);
        // @ts-ignore
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
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      // @ts-ignore
      const {listeners} = obj.on(['foo', 'bar'], 11, listenerFunc);
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
      const listenerFuncFoo = sinon.fake();
      const listenerFuncBar = sinon.fake();
      const obj = eventize({});

      // @ts-ignore
      const {listeners} = obj.on(['foo', 'bar'], 13, {
        foo: listenerFuncFoo,
        bar: listenerFuncBar,
      });

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
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      const contexts: Object = [];
      // @ts-ignore
      const {listeners} = obj.on(
        ['foo', 'bar'],
        function fooBar(...args) {
          // @ts-ignore
          contexts.push(this);
          listenerFunc(...args);
        },
        listenerObject,
      );

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(PRIO_DEFAULT);
        expect(listeners[1].priority).toBe(PRIO_DEFAULT);
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
        // @ts-ignore
        expect(contexts[0]).toBe(listenerObject);
        // @ts-ignore
        expect(contexts[1]).toBe(listenerObject);
      });
    });
    describe('on( eventName*, listenerFunc )', () => {
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      // @ts-ignore
      const {listeners} = obj.on(['foo', 'bar'], listenerFunc);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc.callCount).toBe(2);
        expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
      });
      it('priorities are correct', () => {
        expect(listeners[0].priority).toBe(PRIO_DEFAULT);
        expect(listeners[1].priority).toBe(PRIO_DEFAULT);
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
      const listenerFunc = sinon.fake();
      const obj = eventize({});
      // @ts-ignore
      const {listeners} = obj.on(
        [
          ['foo', 500],
          ['bar', 1000],
        ],
        listenerFunc,
      );

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

  describe('on( priority, listenerFunc, listenerObject ) => object.on( "*", priority, listenerFunc, listenerObject )', () => {
    const listenerObject = {};
    const listenerFunc = sinon.fake();
    const obj = eventize({});
    let context: Object;
    const unsubscribe = obj.on(
      7,
      function () {
        // @ts-ignore
        context = this;
      },
      listenerObject,
    );
    obj.on(listenerFunc, listenerObject);
    obj.emit('foo', 'bar', 666);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
    });
    it('emit() calls the listener with correct context', () => {
      expect(context).toBe(listenerObject);
    });
    it('priority is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.priority).toBe(7);
    });
    it('eventName is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( priority, listenerFunc ) => object.on( "*", priority, listenerFunc )', () => {
    const listenerFunc = sinon.fake();
    const obj = eventize({});
    const unsubscribe = obj.on(11, listenerFunc);
    obj.emit('foo', 'plah', 669);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
    });
    it('priority is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.priority).toBe(11);
    });
    it('eventName is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.isCatchEmAll).toBe(true);
    });
  });

  describe('on( listenerFunc, listenerObject ) => object.on( "*", PRIO_DEFAULT, listenerFunc, listenerObject )', () => {
    const listenerObject = {};
    const listenerFunc = sinon.fake();
    const obj = eventize({});
    let context: Object;
    const unsubscribe = obj.on(function () {
      // @ts-ignore
      context = this;
    }, listenerObject);
    obj.on(listenerFunc, listenerObject);
    obj.emit('foo', 'bar', 666);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('bar', 666)).toBeTruthy();
    });
    it('emit() calls the listener with correct context', () => {
      expect(context).toBe(listenerObject);
    });
    it('priority is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.priority).toBe(PRIO_DEFAULT);
    });
    it('eventName is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( listenerFunc ) => object.on( "*", PRIO_DEFAULT, listenerFunc )', () => {
    const listenerFunc = sinon.fake();
    const obj = eventize({});
    const unsubscribe = obj.on(listenerFunc);
    obj.emit('foo', 'plah', 669);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 669)).toBeTruthy();
    });
    it('priority is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.priority).toBe(PRIO_DEFAULT);
    });
    it('eventName is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.isCatchEmAll).toBe(true);
    });
  });

  describe('on( priority, object ) => object.on( "*", priority, object )', () => {
    const listenerFunc = sinon.fake();
    const obj = eventize({});
    const unsubscribe = obj.on(13, {foo: listenerFunc});
    obj.emit('foo', 'plah', 667);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 667)).toBeTruthy();
    });
    it('priority is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.priority).toBe(13);
    });
    it('eventName is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.isCatchEmAll).toBe(true);
    });
  });
  describe('on( object ) => object.on( "*", PRIO_DEFAULT, object )', () => {
    const listenerFunc = sinon.fake();
    const obj = eventize({});
    const unsubscribe = obj.on({foo: listenerFunc});
    obj.emit('foo', 'plah', 667);

    it('emit() calls the listener', () => {
      expect(listenerFunc.calledWith('plah', 667)).toBeTruthy();
    });
    it('priority is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.priority).toBe(PRIO_DEFAULT);
    });
    it('eventName is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      // @ts-ignore
      expect(unsubscribe.listener.isCatchEmAll).toBe(true);
    });
  });
});
