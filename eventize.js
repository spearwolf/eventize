// eventize.js
// -------------
//
// Copyright 2015-16 Wolfger Schramm <wolfger@spearwolf.de>
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
'use strict';

var LOG_NAMESPACE   = '[eventize.js]';
var CATCH_ALL_EVENT = '*';

// =====================================================================
//
// eventize( object )
//
// =====================================================================

function eventize (o) {

    if (o._eventize) return o;

    _defineHiddenPropertyRO(o, '_eventize', {
        silenced: false,
        off     : []
    });

    _defineHiddenPropertyRO(o._eventize, 'callbacks', { _id: 0, '*': [] });
    _defineHiddenPropertyRO(o._eventize, 'boundObjects', []);

    if (eventize.PRIO_DEFAULT === undefined) {
        _definePublicPropertiesRO(eventize, {
            PRIO_MAX     : Number.POSITIVE_INFINITY,
            PRIO_A       : 1000000000,
            PRIO_B       : 10000000,
            PRIO_C       : 100000,
            PRIO_DEFAULT : 0,
            PRIO_LOW     : -100000,
            PRIO_MIN     : Number.NEGATIVE_INFINITY
        });
    }

    // -----------------------------------------------------------------
    //
    // object.on( eventName [, [ prio, ] callback ] )
    //
    // -----------------------------------------------------------------

    o.on = function (eventName, prio, fn) {

        var argsLen = arguments.length;

        if (argsLen === 0) {
            o._eventize.silenced = false;
            o._eventize.off.length = 0;
            return;
        }

        var i;

        if (argsLen === 1) {
            if (typeof eventName === 'string') {

                i = o._eventize.off.indexOf(eventName);
                if (i >= 0) {
                    o._eventize.off.splice(i, 1);
                }
                return;

            } else if (typeof eventName === 'object' || typeof eventName === 'function') {

                // alias for: on('*', listener)

                fn = eventName;
                eventName = CATCH_ALL_EVENT;
                prio = eventize.PRIO_DEFAULT;

            } else {
                console.warn(LOG_NAMESPACE, '.on() called with insufficient arguments!', arguments);
                return;
            }
        }

        if (argsLen === 2) {
            fn = prio;
            prio = eventize.PRIO_DEFAULT;
        }

        var eventizeCallbacks = o._eventize.callbacks;
        var eventListener = eventizeCallbacks[eventName] || (eventizeCallbacks[eventName] = []);
        var listenerId = createId();
        var listener = _definePublicPropertiesRO({}, {
            id         : listenerId,
            fn         : fn,
            prio       : (typeof prio !== 'number' ? eventize.PRIO_DEFAULT : prio),
            isFunction : (typeof fn === 'function')
        });

        eventListener.push(listener);
        eventListener.sort(sortListenerByPrio);

        return listenerId;

    };

    function createId () {
        return ++o._eventize.callbacks._id;
    }

    function sortListenerByPrio (a, b) {
        return a.prio !== b.prio ? b.prio - a.prio : a.id - b.id;
    }

    // -----------------------------------------------------------------
    //
    // object.once( eventName, [ prio, ] callback )
    //
    // -----------------------------------------------------------------

    o.once = function (eventName, prio, fn) {

        var argsLen = arguments.length;

        if (!argsLen || argsLen > 3) {
            console.warn(LOG_NAMESPACE, '.once() called with insufficient arguments!', arguments);
            return;
        }

        if (argsLen === 1) {

            fn = eventName;
            eventName = CATCH_ALL_EVENT;
            prio = eventize.PRIO_DEFAULT;

        } else if (argsLen === 2) {

            fn = prio;
            prio = eventize.PRIO_DEFAULT;

        }

        var id = o.on(eventName, prio, function () {
            var res = fn.apply(this, arguments);
            o.off(id);
            return res;
        });

        return id;

    };

    // -----------------------------------------------------------------
    //
    // object.off( id )
    //
    // deactive listener by id or previously bound object or
    // function reference or event name or silence all events
    //
    // -----------------------------------------------------------------

    o.off = function (id) {

        if (arguments.length === 0) {
            o._eventize.silenced = true;
            o._eventize.off.length = 0;
            return;
        }

        if (typeof id === 'string') {
            //
            // by event name
            //
            if (o._eventize.off.indexOf(id) === -1) {
                o._eventize.off.push(id);
            }
            return;
        }

        var eventizeCallbacks = o._eventize.callbacks;
        var cb, i, j, _callbacks, keys;
        var isObject = typeof id === 'object';

        if (typeof id === 'number' || typeof id === 'function' || isObject) {
            //
            // by id or function reference
            //
            keys = Object.keys(eventizeCallbacks);
            for (j = 0; j < keys.length; j++) {
                _callbacks = eventizeCallbacks[keys[j]];
                for (i = 0; i < _callbacks.length; i++) {
                    cb = _callbacks[i];
                    if (cb.id === id || cb.fn === id) {
                        _callbacks.splice(i, 1);
                        if (!isObject) return;
                    }
                }
            }
        }

        if (isObject) {
            //
            // by bound object reference
            //
            i = o._eventize.boundObjects.indexOf(id);
            if ( i >= 0 ) {
                o._eventize.boundObjects.splice(i, 1);
            }
        }

    };

    // -----------------------------------------------------------------
    //
    // object.bindOn( object )
    //
    // -----------------------------------------------------------------

    o.bindOn = function (obj) {

        // TODO bindOn should ..
        // - support priority
        // - support filters (via only, except options)
        // - support senderContextArgument: 'prepend'|'append'|false

        if (!obj) return;
        var i = o._eventize.boundObjects.indexOf(obj);
        if (i === -1) {
            o._eventize.boundObjects.push(obj);
        }
        return obj;

    };

    // -----------------------------------------------------------------
    //
    // object.connect(options, listenMap)
    //
    // Example:
    //
    //   object.connect(options, {
    //        onProjectionUpdated : [100, 'projectionUpdated'],
    //        onFrame             : 'frame',
    //        onFrameEnd          : 'frameEnd'
    //   })
    //
    // -----------------------------------------------------------------

    o.connect = function (from, listenMap) {
        return setListenerFromOptions(this, from, listenMap);
    };

    // -----------------------------------------------------------------
    //
    // object.emit( eventName [, arguments .. ] )
    //
    // -----------------------------------------------------------------

    o.emit = function (eventName /*, arguments ..*/) {

        var ctx = this;
        var args = Array.prototype.slice.call(arguments, 1);
        var args1 = args.concat([ctx]);

        _emit(eventName, function (cb) {

            if (cb.isFunction) {
                cb.fn.apply(ctx, args);
            } else {
                cb.fn.emit.apply(cb.fn, [eventName].concat(args));
            }

        }, function (fn, ctx) {

            fn.apply(ctx, args1);

        });

    };

    function _emit (eventName, callback, callback1) {

        if (o._eventize.silenced) return;
        if (o._eventize.off.indexOf(eventName) >= 0) return;

        var _callbacks = o._eventize.callbacks[eventName];
        var _catchAllcallbacks = o._eventize.callbacks[CATCH_ALL_EVENT];
        var hasCalledBoundObjects = false;
        var lenBoundObjs = o._eventize.boundObjects.length;

        function callBoundObjects () {
            var j, _cb;
            if (lenBoundObjs) {
                for (j = 0; j < lenBoundObjs; j++) {
                    _cb = o._eventize.boundObjects[j][eventName];
                    if (typeof _cb === 'function') {
                        callback1(_cb, o._eventize.boundObjects[j]);
                    }
                }
            }
        }

        var i, len, cb;

        if (_callbacks || _catchAllcallbacks.length) {
            _callbacks = _callbacks ? _callbacks.concat(_catchAllcallbacks) : _catchAllcallbacks;
            len = _callbacks.length;
            for (i = 0; i < len; i++) {
                cb = _callbacks[i];
                if (!hasCalledBoundObjects && cb && cb.prio < eventize.PRIO_DEFAULT) {
                    callBoundObjects();
                    hasCalledBoundObjects = true;
                }
                callback(cb);
            }
        }

        if (!hasCalledBoundObjects) callBoundObjects();

    }

    // -----------------------------------------------------------------
    //
    // object.emitReduce( eventName [, value ] [, arguments .. ] )
    //
    // -----------------------------------------------------------------

    o.emitReduce = function (eventName /*, value, [arguments ..] */) {

        // TODO
        // - add specs

        var args = Array.prototype.slice.call(arguments, 1);
        var value;

        if (args.length === 0) {
            value = {};
            args.push(value);
        }

        var ctx = this;
        var args1 = args.concat([ctx]);

        function setValue (val) {
            if (val !== undefined) {
                value = val;
            }
        }

        _emit(eventName, function (cb) {

            args[0] = value;

            if (cb.isFunction) {
                setValue(cb.fn.apply(ctx, args));
            } else {
                setValue(value = cb.fn.emit.apply(cb.fn, [eventName].concat(args)));
            }

        }, function (fn, ctx) {

            args[1] = value;

            setValue(fn.apply(ctx, args1));

        });

        return value;

    };

    return o;

} // <= eventize()

module.exports = eventize;


// ---------------------------------------------------------------------
//
// setListenerFromOptions
//
// Example:
//
//   setListenerFromOptions(
//      obj,
//      options,
//      {
//          onProjectionUpdated: [100, 'projectionUpdated'],
//          onFrame: 'frame',
//          onFrameEnd: 'frameEnd'
//      }
//   )
//
// ---------------------------------------------------------------------

function setListenerFromOptions (obj, options, listenerMap) {

    var eventName, listenName, listenFunc, prio;

    for (listenName in listenerMap) {
        if (listenerMap.hasOwnProperty(listenName)) {
            listenFunc = options[listenName];
            if (typeof listenFunc === 'function') {
                eventName = listenerMap[listenName];
                if (Array.isArray(eventName)) {
                    prio = eventName[0];
                    eventName = eventName[1];
                } else {
                    prio = eventize.PRIO_DEFAULT;
                }
                obj.on(eventName, prio, listenFunc);
            }
        }
    }

    return obj;

}

// =====================================================================
//
// helper functions
//
// =====================================================================

function _definePublicPropertyRO (obj, name, value) {
    Object.defineProperty(obj, name, {
        value        : value,
        configurable : true,
        enumerable   : true
    });
    return obj;
}

function _definePublicPropertiesRO (obj, attrs) {
    var i, keys = Object.keys(attrs);
    for (i = keys.length; i--;) {
        _definePublicPropertyRO(obj, keys[i], attrs[keys[i]]);
    }
    return obj;
}

function _defineHiddenPropertyRO (obj, name, value) {
    Object.defineProperty(obj, name, {
        value        : value,
        configurable : true
    });
    return obj;
}


