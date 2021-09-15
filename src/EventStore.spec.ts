/* eslint-env jest */
import {EventListener} from './EventListener';
import {EventStore} from './EventStore';

import {EVENT_CATCH_EM_ALL} from './constants';

describe('EventStore', () => {
  describe('add()', () => {
    let store: EventStore;

    beforeEach(() => {
      store = new EventStore();
    });

    it('adding a named listener addds the listener to namedListeners store', () => {
      expect(store.namedListeners.get('a')).toBe(undefined);
      store.add(new EventListener('a', 0, null));
      expect(store.namedListeners.get('a')).toHaveLength(1);
    });

    it('adding a catch-em-all listener adds the listener to the catchEmAllListeners array', () => {
      expect(store.catchEmAllListeners).toHaveLength(0);
      store.add(new EventListener(EVENT_CATCH_EM_ALL, 0, null));
      expect(store.catchEmAllListeners).toHaveLength(1);
    });
  });

  describe('without previously added catch-em-all listeners', () => {
    const store = new EventStore();
    const origListener = [
      new EventListener('a', -7, null),
      new EventListener('a', 0, null),
      new EventListener('a', 666, null),
      new EventListener('b', 0, null),
      new EventListener('a', 0, null),
    ].map((listener) => store.add(listener));

    it('catchEmAllListeners store should be empty', () => {
      expect(store.catchEmAllListeners).toHaveLength(0);
    });

    it('forEach() calls the listener listener in highest-priority-and-id-comes-first order for all listeners for the given event name', () => {
      const listeners: Array<EventListener> = [];
      store.forEach('a', (listener) => listeners.push(listener));
      expect(listeners).toHaveLength(3);
      expect(listeners).toEqual([
        origListener[2], // a, 666
        origListener[1], // a, 0
        origListener[0], // a, -7
      ]);
    });
  });

  describe('without previously added named listeners', () => {
    const store = new EventStore();
    const origListener = [
      new EventListener(EVENT_CATCH_EM_ALL, -7, null),
      new EventListener(EVENT_CATCH_EM_ALL, 0, null),
      new EventListener(EVENT_CATCH_EM_ALL, 666, null),
      new EventListener(EVENT_CATCH_EM_ALL, 0, null),
    ].map((listener) => store.add(listener));

    it('catchEmAllListeners should not be empty', () => {
      expect(store.catchEmAllListeners).toHaveLength(3);
    });

    it('forEach() calls the listener listener in highest-priority-and-id-comes-first order for all catch-em-all listeners', () => {
      const listeners: Array<EventListener> = [];
      store.forEach('foo', (listener) => listeners.push(listener));
      expect(listeners).toHaveLength(3);
      expect(listeners).toEqual([
        origListener[2],
        origListener[1],
        origListener[0],
      ]);
    });
  });

  describe('with named and catch-em-all listeners', () => {
    const store = new EventStore();
    [
      new EventListener('a', -7, '0'),
      new EventListener(EVENT_CATCH_EM_ALL, 100, '1'),
      new EventListener('a', 0, '2'),
      new EventListener(EVENT_CATCH_EM_ALL, 666, '3'),
      new EventListener('a', 666, '4'),
      new EventListener(EVENT_CATCH_EM_ALL, 0, '5'),
      new EventListener('b', 0, '6'),
      new EventListener(EVENT_CATCH_EM_ALL, -3, '7'),
      new EventListener('a', 0, '8'),
    ].forEach((listener) => store.add(listener));

    it('forEach() calls the listener in highest-priority-and-id-comes-first order for all listeners', () => {
      const listeners: Array<EventListener> = [];
      store.forEach('a', (listener) => listeners.push(listener));
      expect(listeners).toHaveLength(8);
      expect(listeners.map((h) => h.listener)).toEqual([
        '4',
        '3',
        '1',
        '2',
        '8',
        '5',
        '7',
        '0',
      ]);
    });
  });
});
