/**
 * =============================================================================
 * @spearwolf/eventize v0.6.5 -- https://github.com/spearwolf/eventize.git
 * =============================================================================
 *
 * Copyright 2015-2018 Wolfger Schramm <wolfger@spearwolf.de>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["eventize"] = factory();
	else
		root["eventize"] = factory();
})(typeof self !== 'undefined' ? self : this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 2);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;
const EVENT_CATCH_EM_ALL = exports.EVENT_CATCH_EM_ALL = '*';

const LISTENER_UNKNOWN = exports.LISTENER_UNKNOWN = 0;
const LISTENER_IS_FUNC = exports.LISTENER_IS_FUNC = 1;
const LISTENER_IS_NAMED_FUNC = exports.LISTENER_IS_NAMED_FUNC = 2;
const LISTENER_IS_OBJ = exports.LISTENER_IS_OBJ = 4;

const PRIO_MAX = exports.PRIO_MAX = Number.POSITIVE_INFINITY;
const PRIO_A = exports.PRIO_A = 1000000000;
const PRIO_B = exports.PRIO_B = 1000000;
const PRIO_C = exports.PRIO_C = 1000;
const PRIO_DEFAULT = exports.PRIO_DEFAULT = 0;
const PRIO_LOW = exports.PRIO_LOW = -10000;
const PRIO_MIN = exports.PRIO_MIN = Number.NEGATIVE_INFINITY;

const NAMESPACE = exports.NAMESPACE = (() => {
  if (!Symbol.eventize) {
    Symbol.eventize = Symbol('eventize');
  }
  return Symbol.eventize;
})();

const LOG_NAMESPACE = exports.LOG_NAMESPACE = '[@spearwolf/eventize]';

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;

var _constants = __webpack_require__(0);

const apply = (context, func, args) => {
  if (typeof func === 'function') {
    func.apply(context, args);
  }
};

const emit = (eventName, listener, args) => apply(listener, listener.emit, [eventName].concat(args));

const detectListenerType = listener => {
  switch (typeof listener) {
    case 'function':
      return _constants.LISTENER_IS_FUNC;
    case 'string':
      return _constants.LISTENER_IS_NAMED_FUNC;
    case 'object':
      return _constants.LISTENER_IS_OBJ;
  }
};

let lastId = 0;
const createUniqId = () => ++lastId;

class EventListener {
  constructor(eventName, priority, listener, listenerObject = null) {
    this.id = createUniqId();
    this.eventName = eventName;
    this.isCatchEmAll = eventName === _constants.EVENT_CATCH_EM_ALL;
    this.listener = listener;
    this.listenerObject = listenerObject;
    this.priority = priority;
    this.listenerType = detectListenerType(listener);
    this.callAfterApply = undefined;
    this.isRemoved = false;
  }

  isEqual(listener, listenerObject = null) {
    if (listener === this) return true;
    if (typeof listener === 'number' && listener === this.id) return true;
    if (listenerObject === null && typeof listener === 'string') {
      if (listener === _constants.EVENT_CATCH_EM_ALL) return true;
      if (listener === this.eventName) return true;
      return false;
    }
    return this.listener === listener && this.listenerObject === listenerObject;
  }

  apply(eventName, args) {
    if (this.isRemoved) return;

    const { listener, listenerObject } = this;

    switch (this.listenerType) {
      case _constants.LISTENER_IS_FUNC:
        apply(listenerObject, listener, args);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case _constants.LISTENER_IS_NAMED_FUNC:
        apply(listenerObject, listenerObject[listener], args);
        if (this.callAfterApply) this.callAfterApply();
        break;

      case _constants.LISTENER_IS_OBJ:
        {
          const func = listener[eventName];
          if (this.isCatchEmAll || this.eventName === eventName) {
            if (typeof func === 'function') {
              func.apply(listener, args);
            } else {
              emit(eventName, listener, args);
            }
            if (this.callAfterApply) this.callAfterApply();
          }
          break;
        }
    }
  }
}
exports.default = EventListener;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _eventize = __webpack_require__(3);

var _eventize2 = _interopRequireDefault(_eventize);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

module.exports = _eventize2.default;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;
exports.PRIO_MIN = exports.PRIO_LOW = exports.PRIO_DEFAULT = exports.PRIO_C = exports.PRIO_B = exports.PRIO_A = exports.PRIO_MAX = exports.NAMESPACE = exports.EVENT_CATCH_EM_ALL = undefined;

var _inject = __webpack_require__(4);

var _inject2 = _interopRequireDefault(_inject);

var _constants = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function eventize(obj) {
  return (0, _inject2.default)(obj);
}

eventize.inject = _inject2.default;

eventize.extend = obj => (0, _inject2.default)(Object.create(obj));

eventize.create = obj => {
  const eventizer = (0, _inject2.default)({});
  eventizer.on(_constants.EVENT_CATCH_EM_ALL, _constants.PRIO_DEFAULT, obj);
  return eventizer;
};

eventize.is = obj => !!(obj && obj[_constants.NAMESPACE]);

Object.assign(eventize, {
  PRIO_MAX: _constants.PRIO_MAX,
  PRIO_A: _constants.PRIO_A,
  PRIO_B: _constants.PRIO_B,
  PRIO_C: _constants.PRIO_C,
  PRIO_DEFAULT: _constants.PRIO_DEFAULT,
  PRIO_LOW: _constants.PRIO_LOW,
  PRIO_MIN: _constants.PRIO_MIN
});

exports.default = eventize;
exports.EVENT_CATCH_EM_ALL = _constants.EVENT_CATCH_EM_ALL;
exports.NAMESPACE = _constants.NAMESPACE;
exports.PRIO_MAX = _constants.PRIO_MAX;
exports.PRIO_A = _constants.PRIO_A;
exports.PRIO_B = _constants.PRIO_B;
exports.PRIO_C = _constants.PRIO_C;
exports.PRIO_DEFAULT = _constants.PRIO_DEFAULT;
exports.PRIO_LOW = _constants.PRIO_LOW;
exports.PRIO_MIN = _constants.PRIO_MIN;

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;
exports.default = injectEventizeApi;

var _EventStore = __webpack_require__(5);

var _EventStore2 = _interopRequireDefault(_EventStore);

var _EventKeeper = __webpack_require__(6);

var _EventKeeper2 = _interopRequireDefault(_EventKeeper);

var _propUtils = __webpack_require__(7);

var _subscribeTo = __webpack_require__(8);

var _subscribeTo2 = _interopRequireDefault(_subscribeTo);

var _constants = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const removeListener = obj => listener => {
  listener.callAfterApply = () => obj.off(listener);
};

function injectEventizeApi(obj) {
  if (obj[_constants.NAMESPACE]) return obj;

  const store = new _EventStore2.default();
  const keeper = new _EventKeeper2.default();
  (0, _propUtils.defineHiddenPropertyRO)(obj, _constants.NAMESPACE, { keeper, store });

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
      return (0, _subscribeTo2.default)(store, keeper, args);
    },
    once(...args) {
      const listeners = (0, _subscribeTo2.default)(store, keeper, args);
      if (Array.isArray(listeners)) {
        listeners.forEach(removeListener(obj));
      } else {
        removeListener(obj)(listeners);
      }
      return listeners;
    },
    off(listener, listenerObject) {
      store.remove(listener, listenerObject);
      if (Array.isArray(listener)) {
        keeper.remove(listener.filter(li => typeof li === 'string'));
      } else if (typeof listener === 'string') {
        keeper.remove(listener);
      }
    },
    emit(eventName, ...args) {
      if (Array.isArray(eventName)) {
        eventName.forEach(event => {
          store.forEach(event, listener => listener.apply(event, args));
          keeper.retain(event, args);
        });
      } else if (eventName !== _constants.EVENT_CATCH_EM_ALL) {
        store.forEach(eventName, listener => listener.apply(eventName, args));
        keeper.retain(eventName, args);
      }
    },
    retain(eventName) {
      keeper.add(eventName);
    }
  });
  return obj;
}

/***/ }),
/* 5 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;

var _constants = __webpack_require__(0);

var _EventListener = __webpack_require__(1);

var _EventListener2 = _interopRequireDefault(_EventListener);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const sortByPrioAndId = (a, b) => a.priority !== b.priority ? b.priority - a.priority : a.id - b.id;

const cloneArray = arr => {
  if (arr) {
    return arr.slice(0);
  }
};

const removeListenerItem = (arr, listener) => {
  const idx = arr.indexOf(listener);
  if (idx > -1) {
    arr.splice(idx, 1);
  }
};

const removeListener = (listeners, listener, listenerObject) => {
  const idx = listeners.findIndex(item => item.isEqual(listener, listenerObject));
  if (idx > -1) {
    listeners[idx].isRemoved = true;
    listeners.splice(idx, 1);
  }
};

const removeAllListeners = listeners => {
  if (listeners) {
    listeners.forEach(li => {
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
    } else {
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
    } else if (listener == null || listenerObject == null && listener === _constants.EVENT_CATCH_EM_ALL) {
      this.removeAllListeners();
    } else if (listenerObject == null && typeof listener === 'string') {
      const listeners = this.namedListeners.get(listener);
      removeAllListeners(listeners);
    } else if (listener instanceof _EventListener2.default) {
      listener.isRemoved = true;
      this.namedListeners.forEach(namedListeners => removeListenerItem(namedListeners, listener));
      removeListenerItem(this.catchEmAllListeners, listener);
    } else {
      this.namedListeners.forEach(namedListeners => removeListener(namedListeners, listener, listenerObject));
      removeListener(this.catchEmAllListeners, listener, listenerObject);
    }
  }

  removeAllListeners() {
    this.namedListeners.forEach(namedListeners => removeAllListeners(namedListeners));
    this.namedListeners.clear();
    removeAllListeners(this.catchEmAllListeners);
  }

  forEach(eventName, fn) {
    const catchEmAllListeners = cloneArray(this.catchEmAllListeners);
    const namedListeners = cloneArray(this.namedListeners.get(eventName));
    if (eventName === _constants.EVENT_CATCH_EM_ALL || !namedListeners || namedListeners.length === 0) {
      catchEmAllListeners.forEach(fn);
    } else if (catchEmAllListeners.length === 0) {
      namedListeners.forEach(fn);
    } else {
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
exports.default = EventStore;

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;

var _constants = __webpack_require__(0);

class EventKeeper {
  constructor() {
    this.events = new Map();
    this.eventNames = new Set();
  }

  add(eventName) {
    if (Array.isArray(eventName)) {
      eventName.forEach(en => this.eventNames.add(en));
    } else {
      this.eventNames.add(eventName);
    }
  }

  remove(eventName) {
    if (Array.isArray(eventName)) {
      eventName.forEach(en => this.remove(en));
    } else {
      this.eventNames.delete(eventName);
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
    if (eventName === _constants.EVENT_CATCH_EM_ALL) {
      this.eventNames.forEach(en => this.emit(en, eventListener));
    } else {
      const args = this.events.get(eventName);
      if (args) {
        eventListener.apply(eventName, args);
      }
    }
  }
}
exports.default = EventKeeper;

/***/ }),
/* 7 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;
const definePublicPropertyRO = exports.definePublicPropertyRO = (obj, name, value) => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true,
    enumerable: true
  });
  return obj;
};

const definePublicPropertiesRO = exports.definePublicPropertiesRO = (obj, attrs) => {
  const keys = Object.keys(attrs);
  const len = keys.length;
  for (let i = 0; i < len; i += 1) {
    definePublicPropertyRO(obj, keys[i], attrs[keys[i]]);
  }
  return obj;
};

const defineHiddenPropertyRO = exports.defineHiddenPropertyRO = (obj, name, value) => {
  Object.defineProperty(obj, name, {
    value,
    configurable: true
  });
  return obj;
};

/***/ }),
/* 8 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;

var _EventListener = __webpack_require__(1);

var _EventListener2 = _interopRequireDefault(_EventListener);

var _logUtils = __webpack_require__(9);

var _constants = __webpack_require__(0);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const registerEventListener = (store, keeper, eventName, priority, listener, listenerObject) => {
  const eventListener = new _EventListener2.default(eventName, priority, listener, listenerObject);
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
    eventName = _constants.EVENT_CATCH_EM_ALL;
    [priority, listener, listenerObject] = args;
  } else if (len >= 3 && len <= 4 && typeof args[1] === 'number') {
    [eventName, priority, listener, listenerObject] = args;
  } else {
    priority = _constants.PRIO_DEFAULT;
    if (typeOfFirstArg === 'string' || Array.isArray(args[0])) {
      [eventName, listener, listenerObject] = args;
    } else {
      eventName = _constants.EVENT_CATCH_EM_ALL;
      [listener, listenerObject] = args;
    }
  }

  if (!listener && _logUtils.hasConsole) {
    (0, _logUtils.warn)('called with insufficient arguments!', args);
    return;
  }

  const register = prio => event => registerEventListener(store, keeper, event, prio, listener, listenerObject);

  if (Array.isArray(eventName)) {
    return eventName.map(name => {
      if (Array.isArray(name)) {
        return register(name[1])(name[0]);
      }
      return register(priority)(name);
    });
  }
  return register(priority)(eventName);
};

exports.default = subscribeTo;

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


exports.__esModule = true;
exports.warn = exports.hasConsole = undefined;

var _constants = __webpack_require__(0);

const hasConsole = exports.hasConsole = typeof console !== 'undefined';

const warn = exports.warn = hasConsole ? console[console.warn ? 'warn' : 'log'].bind(console, _constants.LOG_NAMESPACE) : () => undefined; // eslint-disable-line

/***/ })
/******/ ]);
});
//# sourceMappingURL=eventize.js.map