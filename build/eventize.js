
/*!
@file eventize-js - undefined
@author Wolfger Schramm <wolfger@spearwolf.de>
@version 2.0.0-alpha.1+es2017.20210411

Copyright 2015-2021 Wolfger Schramm

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/
const EVENT_CATCH_EM_ALL = '*';
const LISTENER_IS_FUNC = 1;
const LISTENER_IS_NAMED_FUNC = 2;
const LISTENER_IS_OBJ = 4;
const PRIO_MAX = Number.POSITIVE_INFINITY;
const PRIO_A = 1000000000;
const PRIO_B = 1000000;
const PRIO_C = 1000;
const PRIO_DEFAULT = 0;
const PRIO_LOW = -10000;
const PRIO_MIN = Number.NEGATIVE_INFINITY;
const NAMESPACE = (() => {
    // @ts-ignore
    if (!Symbol.eventize) {
        // @ts-ignore
        Symbol.eventize = Symbol('eventize');
    }
    // @ts-ignore
    return Symbol.eventize;
})();
const LOG_NAMESPACE = '[eventize]';

/* eslint-disable no-console */
const isCatchEmAll = (eventName) => eventName === EVENT_CATCH_EM_ALL;
const isEventName = (eventName) => {
    switch (typeof eventName) {
        case 'string':
        case 'symbol':
            return true;
        default:
            return false;
    }
};
const hasConsole = typeof console !== 'undefined';
const warn = hasConsole
    ? console[console.warn ? 'warn' : 'log'].bind(console, LOG_NAMESPACE)
    : () => { };
const defineHiddenPropertyRO = (obj, name, value) => {
    Object.defineProperty(obj, name, {
        value,
        configurable: true,
    });
    return obj;
};

class EventKeeper {
    constructor() {
        this.events = new Map();
        this.eventNames = new Set();
    }
    add(eventNames) {
        if (Array.isArray(eventNames)) {
            eventNames.forEach((name) => this.eventNames.add(name));
        }
        else {
            this.eventNames.add(eventNames);
        }
    }
    remove(eventNames) {
        if (Array.isArray(eventNames)) {
            eventNames.forEach((name) => this.eventNames.delete(name));
        }
        else {
            this.eventNames.delete(eventNames);
        }
    }
    retain(eventName, args) {
        if (this.eventNames.has(eventName)) {
            this.events.set(eventName, args);
        }
    }
    isKnown(eventName) {
        return this.eventNames.has(eventName);
    }
    emit(eventName, eventListener) {
        if (!isCatchEmAll(eventName)) {
            const args = this.events.get(eventName);
            if (args) {
                eventListener.apply(eventName, args);
            }
        }
        else {
            this.eventNames.forEach((name) => this.emit(name, eventListener));
        }
    }
}

const apply = (context, func, args) => {
    if (typeof func === 'function') {
        func.apply(context, args);
    }
};
const emit = (eventName, listener, args) => apply(listener, listener.emit, [eventName].concat(args));
const detectListenerType = (listener) => {
    switch (typeof listener) {
        case 'function':
            return LISTENER_IS_FUNC;
        case 'string':
        case 'symbol':
            return LISTENER_IS_NAMED_FUNC;
        case 'object':
            return LISTENER_IS_OBJ;
    }
};
let lastId = 0;
const createUniqId = () => ++lastId;
class EventListener {
    constructor(eventName, priority, listener, listenerObject = null) {
        this.id = createUniqId();
        this.eventName = eventName;
        this.isCatchEmAll = isCatchEmAll(eventName);
        this.listener = listener;
        this.listenerObject = listenerObject;
        this.priority = priority;
        this.listenerType = detectListenerType(listener);
        this.callAfterApply = undefined;
        this.isRemoved = false;
    }
    isEqual(listener, listenerObject = null) {
        if (listener === this)
            return true;
        if (typeof listener === 'number' && listener === this.id)
            return true;
        if (listenerObject === null && isEventName(listener)) {
            if (listener === EVENT_CATCH_EM_ALL)
                return true;
            if (listener === this.eventName)
                return true;
            return false;
        }
        return this.listener === listener && this.listenerObject === listenerObject;
    }
    apply(eventName, args) {
        if (this.isRemoved)
            return;
        const { listener, listenerObject } = this;
        switch (this.listenerType) {
            case LISTENER_IS_FUNC:
                // @ts-ignore
                apply(listenerObject, listener, args);
                if (this.callAfterApply)
                    this.callAfterApply();
                break;
            case LISTENER_IS_NAMED_FUNC:
                // @ts-ignore
                apply(listenerObject, listenerObject[listener], args);
                if (this.callAfterApply)
                    this.callAfterApply();
                break;
            case LISTENER_IS_OBJ: {
                // @ts-ignore
                const func = listener[eventName];
                if (this.isCatchEmAll || this.eventName === eventName) {
                    if (typeof func === 'function') {
                        func.apply(listener, args);
                    }
                    else {
                        // @ts-ignore
                        emit(eventName, listener, args);
                    }
                    if (this.callAfterApply)
                        this.callAfterApply();
                }
                break;
            }
        }
    }
}

const sortByPrioAndId = (a, b) => a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;
const cloneArray = (arr) => arr === null || arr === void 0 ? void 0 : arr.slice(0);
const removeListenerItem = (arr, listener) => {
    const idx = arr.indexOf(listener);
    if (idx > -1) {
        arr.splice(idx, 1);
    }
};
const removeListener = (listeners, listener, listenerObject) => {
    const idx = listeners.findIndex((item) => item.isEqual(listener, listenerObject));
    if (idx > -1) {
        listeners[idx].isRemoved = true;
        listeners.splice(idx, 1);
    }
};
const removeAllListeners = (listeners) => {
    if (listeners) {
        listeners.forEach((li) => {
            li.isRemoved = true;
        });
        listeners.length = 0;
    }
};
class EventStore {
    constructor() {
        this.namedListeners = new Map();
        this.catchEmAllListeners = [];
    }
    add(eventListener) {
        if (eventListener.isCatchEmAll) {
            this.catchEmAllListeners.push(eventListener);
            this.catchEmAllListeners.sort(sortByPrioAndId);
        }
        else {
            const { eventName } = eventListener;
            let namedListeners = this.namedListeners.get(eventName);
            if (!namedListeners) {
                namedListeners = [];
                this.namedListeners.set(eventName, namedListeners);
            }
            namedListeners.push(eventListener);
            namedListeners.sort(sortByPrioAndId);
        }
    }
    remove(listener, listenerObject) {
        if (listenerObject == null && Array.isArray(listener)) {
            listener.forEach(this.remove.bind(this));
        }
        else if (listener == null ||
            (listenerObject == null && isCatchEmAll(listener))) {
            this.removeAllListeners();
        }
        else if (listenerObject == null && isEventName(listener)) {
            const listeners = this.namedListeners.get(listener);
            removeAllListeners(listeners);
        }
        else if (listener instanceof EventListener) {
            listener.isRemoved = true;
            this.namedListeners.forEach((namedListeners) => removeListenerItem(namedListeners, listener));
            removeListenerItem(this.catchEmAllListeners, listener);
        }
        else {
            this.namedListeners.forEach((namedListeners) => removeListener(namedListeners, listener, listenerObject));
            removeListener(this.catchEmAllListeners, listener, listenerObject);
        }
    }
    removeAllListeners() {
        this.namedListeners.forEach((namedListeners) => removeAllListeners(namedListeners));
        this.namedListeners.clear();
        removeAllListeners(this.catchEmAllListeners);
    }
    forEach(eventName, fn) {
        const catchEmAllListeners = cloneArray(this.catchEmAllListeners);
        const namedListeners = cloneArray(this.namedListeners.get(eventName));
        if (eventName === EVENT_CATCH_EM_ALL ||
            !namedListeners ||
            namedListeners.length === 0) {
            catchEmAllListeners.forEach(fn);
        }
        else if (catchEmAllListeners.length === 0) {
            namedListeners.forEach(fn);
        }
        else {
            const iLen = namedListeners.length;
            const jLen = catchEmAllListeners.length;
            let i = 0;
            let j = 0;
            while (i < iLen || j < jLen) {
                if (i < iLen) {
                    const cur = namedListeners[i];
                    if (j >= jLen || cur.priority >= catchEmAllListeners[j].priority) {
                        fn(cur);
                        ++i;
                        continue;
                    }
                }
                if (j < jLen) {
                    fn(catchEmAllListeners[j]);
                    ++j;
                }
            }
        }
    }
}

const isEventized = (obj) => !!(obj &&
    // @ts-ignore
    obj[NAMESPACE]);

const registerEventListener = (store, keeper, eventName, priority, listener, listenerObject) => {
    const eventListener = new EventListener(eventName, priority, listener, listenerObject);
    store.add(eventListener);
    keeper.emit(eventName, eventListener);
    return eventListener;
};
const subscribeTo = (store, keeper, args) => {
    const len = args.length;
    const typeOfFirstArg = typeof args[0];
    let eventName;
    let priority;
    let listener;
    let listenerObject;
    if (len >= 2 && len <= 3 && typeOfFirstArg === 'number') {
        eventName = EVENT_CATCH_EM_ALL;
        [priority, listener, listenerObject] = args;
    }
    else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
        [eventName, priority, listener, listenerObject] = args;
    }
    else {
        priority = PRIO_DEFAULT;
        if (isEventName(typeOfFirstArg) || Array.isArray(args[0])) {
            [eventName, listener, listenerObject] = args;
        }
        else {
            eventName = EVENT_CATCH_EM_ALL;
            [listener, listenerObject] = args;
        }
    }
    if (!listener && hasConsole) {
        warn('called with insufficient arguments!', args);
        throw 'subscribeTo called with insufficient arguments!';
    }
    const register = (prio) => (event) => registerEventListener(store, keeper, event, prio, listener, listenerObject);
    if (Array.isArray(eventName)) {
        return eventName.map((name) => {
            if (Array.isArray(name)) {
                return register(name[1])(name[0]);
            }
            return register(priority)(name);
        });
    }
    return register(priority)(eventName);
};

const unsubscribeAfterApply = (obj) => (listener) => {
    listener.callAfterApply = () => obj.off(listener);
};
const makeUnsubscribe = (host, listeners) => {
    const unsubscribe = () => host.off(listeners);
    return Object.assign(unsubscribe, Array.isArray(listeners) ? { listeners } : { listener: listeners });
};
function injectEventizeApi(obj) {
    if (isEventized(obj)) {
        // it already has the interface - no need to inject it again
        return obj;
    }
    const store = new EventStore();
    const keeper = new EventKeeper();
    defineHiddenPropertyRO(obj, NAMESPACE, { keeper, store });
    const eventizedObj = Object.assign(obj, {
        on(...args) {
            return makeUnsubscribe(eventizedObj, subscribeTo(store, keeper, args));
        },
        once(...args) {
            const listeners = subscribeTo(store, keeper, args);
            if (Array.isArray(listeners)) {
                listeners.forEach(unsubscribeAfterApply(eventizedObj));
            }
            else {
                unsubscribeAfterApply(eventizedObj)(listeners);
            }
            return makeUnsubscribe(eventizedObj, listeners);
        },
        off(listener, listenerObject) {
            store.remove(listener, listenerObject);
            if (Array.isArray(listener)) {
                keeper.remove(listener.filter((li) => typeof li === 'string'));
            }
            else if (isEventName(listener)) {
                keeper.remove(listener);
            }
        },
        emit(eventNames, ...args) {
            if (Array.isArray(eventNames)) {
                eventNames.forEach((event) => {
                    store.forEach(event, (listener) => listener.apply(event, args));
                    keeper.retain(event, args);
                });
            }
            else if (eventNames !== EVENT_CATCH_EM_ALL) {
                store.forEach(eventNames, (listener) => listener.apply(eventNames, args));
                keeper.retain(eventNames, args);
            }
        },
        retain(eventName) {
            keeper.add(eventName);
        },
    });
    return eventizedObj;
}

function eventize(obj) {
    return injectEventizeApi(obj);
}
eventize.inject = injectEventizeApi;
eventize.extend = (obj) => injectEventizeApi(Object.create(obj));
eventize.create = (obj) => {
    const eventizer = injectEventizeApi({});
    eventizer.on(EVENT_CATCH_EM_ALL, PRIO_DEFAULT, obj);
    return eventizer;
};
eventize.is = isEventized;
Object.assign(eventize, {
    PRIO_MAX,
    PRIO_A,
    PRIO_B,
    PRIO_C,
    PRIO_DEFAULT,
    PRIO_LOW,
    PRIO_MIN,
});
class Eventize {
    constructor() {
        eventize(this);
    }
}

export default eventize;
export { Eventize, PRIO_A, PRIO_B, PRIO_C, PRIO_DEFAULT, PRIO_LOW, PRIO_MAX, PRIO_MIN, injectEventizeApi, isEventized };
//# sourceMappingURL=eventize.js.map
