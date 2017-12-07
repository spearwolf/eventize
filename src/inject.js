import EventStore from './EventStore';
import { defineHiddenPropertyRO } from './propUtils';
import subscribeTo from './subscribeTo';

import {
  EVENT_CATCH_EM_ALL,
  NAMESPACE,
} from './constants';

const removeListener = obj => (listener) => {
  listener.callAfterApply = () => obj.off(listener);
};

export default function injectEventizeApi(obj) {
  if (obj[NAMESPACE]) return obj;

  const store = new EventStore();
  defineHiddenPropertyRO(obj, NAMESPACE, store);

  Object.assign(obj, {
    // ----------------------------------------------------------------------------------------
    //
    // .on( eventName*, [ priority, ] listenerFunc [, listenerObject] )
    // .on( eventName*, [ priority, ] listenerFuncName, listenerObject )
    // .on( eventName*, [ priority, ] listenerObject )
    //
    // .on( [ priority, ] listenerFunc [, listenerObject] )
    //                                            => listenerObject.on( '*', listenerFunc )
    // .on( [ priority, ] listenerObject )
    //                                            => listenerObject.on( '*', listenerObject )
    //
    // .off(...)
    //
    // eventName*: eventName | Array<eventName>
    // eventName: string
    //
    // listenerFunc: function
    // listenerFuncName: string
    // listenerObject: object
    //
    // ----------------------------------------------------------------------------------------
    on(...args) {
      return subscribeTo(store, args);
    },
    once(...args) {
      const listeners = subscribeTo(store, args);
      if (Array.isArray(listeners)) {
        listeners.forEach(removeListener(obj));
      } else {
        removeListener(obj)(listeners);
      }
      return listeners;
    },
    off(listener, listenerObject) {
      store.remove(listener, listenerObject);
    },
    emit(eventName, ...args) {
      if (Array.isArray(eventName)) {
        eventName.forEach(event => store.forEach(event, listener => listener.apply(event, args)));
      } else if (eventName !== EVENT_CATCH_EM_ALL) {
        store.forEach(eventName, listener => listener.apply(eventName, args));
      }
    },
  });
  return obj;
}
