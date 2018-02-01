/* eslint-env jest */
import eventize, {
  PRIO_DEFAULT,
  EVENT_CATCH_EM_ALL,
} from '../eventize';

describe('on()', () => {
  describe('eventName is a string', () => {
    describe('on( eventName, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = jest.fn();
      const obj = eventize({});
      let context;
      const subscriber = obj.on('foo', 7, function () { // eslint-disable-line
        context = this;
      }, listenerObject);
      obj.on('foo', 0, listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        expect(subscriber.priority).toBe(7);
      });
      it('eventName is correct', () => {
        expect(subscriber.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(subscriber.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFuncName, listenerObject )', () => {
      const listenerObject = {
        foo(...args) {
          this.args = args;
        },
      };
      const obj = eventize({});
      const subscriber = obj.on('foo', 9, 'foo', listenerObject);
      obj.emit('foo', 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerObject.args).toEqual(['bar', 666]);
      });
      it('priority is correct', () => {
        expect(subscriber.priority).toBe(9);
      });
      it('eventName is correct', () => {
        expect(subscriber.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(subscriber.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, listenerFunc )', () => {
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const subscriber = obj.on('foo', 11, listenerFunc);
      obj.emit('foo', 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
      });
      it('priority is correct', () => {
        expect(subscriber.priority).toBe(11);
      });
      it('eventName is correct', () => {
        expect(subscriber.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(subscriber.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, priority, object )', () => {
      const listenerFunc = jest.fn();
      let listenerContext;
      const listener = {
        foo(...args) {
          listenerContext = this;
          listenerFunc(...args);
        },
      };
      const obj = eventize({});
      const subscriber = obj.on('foo', 13, listener);

      it('priority is correct', () => {
        expect(subscriber.priority).toBe(13);
      });
      it('eventName is correct', () => {
        expect(subscriber.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(subscriber.isCatchEmAll).toBe(false);
      });

      obj.emit('foo', 'plah', 667);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledWith('plah', 667);
      });
      it('emit() calls the listener with correct context', () => {
        expect(listener).toBe(listenerContext);
      });
    });

    describe('on( eventName, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = jest.fn();
      const obj = eventize({});
      let context;
      const subscriber = obj.on('foo', function () { // eslint-disable-line
        context = this;
      }, listenerObject);
      obj.on('foo', listenerFunc, listenerObject);
      obj.emit('foo', 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
      });
      it('emit() calls the listener with correct context', () => {
        expect(context).toBe(listenerObject);
      });
      it('priority is correct', () => {
        expect(subscriber.priority).toBe(PRIO_DEFAULT);
      });
      it('eventName is correct', () => {
        expect(subscriber.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(subscriber.isCatchEmAll).toBe(false);
      });
    });
    describe('on( eventName, listenerFunc )', () => {
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const subscriber = obj.on('foo', listenerFunc);
      obj.emit('foo', 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
      });
      it('priority is correct', () => {
        expect(subscriber.priority).toBe(PRIO_DEFAULT);
      });
      it('eventName is correct', () => {
        expect(subscriber.eventName).toBe('foo');
      });
      it('isCatchEmAll is correct', () => {
        expect(subscriber.isCatchEmAll).toBe(false);
      });
    });
  }); // eventName is a string

  describe('eventName is an array', () => {
    describe('on( eventNameArray, priority, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const context = [];
      const listeners = obj.on(['foo', 'fu'], 7, function () { // eslint-disable-line
        context.push(this);
      }, listenerObject);
      obj.on(['foo', 'fu'], 0, listenerFunc, listenerObject);
      obj.emit(['foo', 'fu'], 'bar', 666);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledTimes(2);
        expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
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
      const mockFunc = jest.fn();
      const listenerObject = {
        foo(...args) {
          this.context = this;
          this.args = args;
          mockFunc(...args);
        },
      };
      const obj = eventize({});
      const listeners = obj.on(['foo', 'fu'], 9, 'foo', listenerObject);
      obj.emit(['foo', 'fu'], 'bar', 666);

      it('emit() calls the listener', () => {
        expect(mockFunc).toHaveBeenCalledTimes(2);
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
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const listeners = obj.on(['foo', 'bar'], 11, listenerFunc);
      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledTimes(2);
        expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
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
      const listenerFuncFoo = jest.fn();
      const listenerFuncBar = jest.fn();
      const obj = eventize({});

      const listeners = obj.on(['foo', 'bar'], 13, {
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
        expect(listenerFuncFoo).toHaveBeenCalledWith('plah', 667);
      });
      it('emit() calls the :bar listener', () => {
        expect(listenerFuncBar).toHaveBeenCalledWith('plah', 667);
      });
    });

    describe('on( eventName*, listenerFunc, listenerObject )', () => {
      const listenerObject = {};
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const contexts = [];
      const listeners = obj.on(['foo', 'bar'], function fooBar(...args) {
        contexts.push(this);
        listenerFunc(...args);
      }, listenerObject);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledTimes(2);
        expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
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
        expect(contexts[0]).toBe(listenerObject);
        expect(contexts[1]).toBe(listenerObject);
      });
    });
    describe('on( eventName*, listenerFunc )', () => {
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const listeners = obj.on(['foo', 'bar'], listenerFunc);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledTimes(2);
        expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
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
      const listenerFunc = jest.fn();
      const obj = eventize({});
      const listeners = obj.on([['foo', 500], ['bar', 1000]], listenerFunc);

      obj.emit(['foo', 'bar'], 'plah', 669);

      it('emit() calls the listener', () => {
        expect(listenerFunc).toHaveBeenCalledTimes(2);
        expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
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
    const listenerFunc = jest.fn();
    const obj = eventize({});
    let context;
    const subscriber = obj.on(7, function () { // eslint-disable-line
      context = this;
    }, listenerObject);
    obj.on(listenerFunc, listenerObject);
    obj.emit('foo', 'bar', 666);

    it('emit() calls the listener', () => {
      expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
    });
    it('emit() calls the listener with correct context', () => {
      expect(context).toBe(listenerObject);
    });
    it('priority is correct', () => {
      expect(subscriber.priority).toBe(7);
    });
    it('eventName is correct', () => {
      expect(subscriber.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(subscriber.isCatchEmAll).toBe(true);
    });
  });
  describe('on( priority, listenerFunc ) => object.on( "*", priority, listenerFunc )', () => {
    const listenerFunc = jest.fn();
    const obj = eventize({});
    const subscriber = obj.on(11, listenerFunc);
    obj.emit('foo', 'plah', 669);

    it('emit() calls the listener', () => {
      expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
    });
    it('priority is correct', () => {
      expect(subscriber.priority).toBe(11);
    });
    it('eventName is correct', () => {
      expect(subscriber.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(subscriber.isCatchEmAll).toBe(true);
    });
  });

  describe('on( listenerFunc, listenerObject ) => object.on( "*", PRIO_DEFAULT, listenerFunc, listenerObject )', () => {
    const listenerObject = {};
    const listenerFunc = jest.fn();
    const obj = eventize({});
    let context;
    const subscriber = obj.on(function () { // eslint-disable-line
      context = this;
    }, listenerObject);
    obj.on(listenerFunc, listenerObject);
    obj.emit('foo', 'bar', 666);

    it('emit() calls the listener', () => {
      expect(listenerFunc).toHaveBeenCalledWith('bar', 666);
    });
    it('emit() calls the listener with correct context', () => {
      expect(context).toBe(listenerObject);
    });
    it('priority is correct', () => {
      expect(subscriber.priority).toBe(PRIO_DEFAULT);
    });
    it('eventName is correct', () => {
      expect(subscriber.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(subscriber.isCatchEmAll).toBe(true);
    });
  });
  describe('on( listenerFunc ) => object.on( "*", PRIO_DEFAULT, listenerFunc )', () => {
    const listenerFunc = jest.fn();
    const obj = eventize({});
    const subscriber = obj.on(listenerFunc);
    obj.emit('foo', 'plah', 669);

    it('emit() calls the listener', () => {
      expect(listenerFunc).toHaveBeenCalledWith('plah', 669);
    });
    it('priority is correct', () => {
      expect(subscriber.priority).toBe(PRIO_DEFAULT);
    });
    it('eventName is correct', () => {
      expect(subscriber.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(subscriber.isCatchEmAll).toBe(true);
    });
  });

  describe('on( priority, object ) => object.on( "*", priority, object )', () => {
    const listenerFunc = jest.fn();
    const obj = eventize({});
    const subscriber = obj.on(13, { foo: listenerFunc });
    obj.emit('foo', 'plah', 667);

    it('emit() calls the listener', () => {
      expect(listenerFunc).toHaveBeenCalledWith('plah', 667);
    });
    it('priority is correct', () => {
      expect(subscriber.priority).toBe(13);
    });
    it('eventName is correct', () => {
      expect(subscriber.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(subscriber.isCatchEmAll).toBe(true);
    });
  });
  describe('on( object ) => object.on( "*", PRIO_DEFAULT, object )', () => {
    const listenerFunc = jest.fn();
    const obj = eventize({});
    const subscriber = obj.on({ foo: listenerFunc });
    obj.emit('foo', 'plah', 667);

    it('emit() calls the listener', () => {
      expect(listenerFunc).toHaveBeenCalledWith('plah', 667);
    });
    it('priority is correct', () => {
      expect(subscriber.priority).toBe(PRIO_DEFAULT);
    });
    it('eventName is correct', () => {
      expect(subscriber.eventName).toBe(EVENT_CATCH_EM_ALL);
    });
    it('isCatchEmAll is correct', () => {
      expect(subscriber.isCatchEmAll).toBe(true);
    });
  });
});
