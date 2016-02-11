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

// =====================================================================
//
// eventize( object )
//
// =====================================================================

function eventize (o) {

    if (o._eventize) return o;  // <= already eventized TODO test

    _defineHiddenPropertyRO(o, '_eventize', {
        silenced: false,
        off     : []
    });
    _defineHiddenPropertyRO(o._eventize, 'callbacks', { _id: 0 });
    _defineHiddenPropertyRO(o._eventize, 'boundObjects', []);

    _definePublicPropertiesRO(eventize, {
        PRIO_MAX     : Number.POSITIVE_INFINITY,
        PRIO_A       : 1000000000,
        PRIO_B       : 10000000,
        PRIO_C       : 100000,
        PRIO_DEFAULT : 0,
        PRIO_LOW     : -100000,
        PRIO_MIN     : Number.NEGATIVE_INFINITY
    });

    // -----------------------------------------------------------------
    //
    // object.on( eventName [, [ prio, ] callback ] )
    //
    // -----------------------------------------------------------------

    o.on = function (eventName, prio, fn) {

        // TODO
        // - global on (reactivate all - reverse of off())

        var argsLen = arguments.length;
        var i;

        if (argsLen === 1) {
            i = o._eventize.off.indexOf(eventName);
            if (i >= 0) {
                o._eventize.off.splice(i, 1);
            }
            return;
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
            isFunction : (typeof fn === 'function')  // TODO test fn -> object
        });

        eventListener.push(listener);
        eventListener.sort(sortListenerByPrio);

        return listenerId;

    };

    function createId () {
        return ++o._eventize.callbacks._id;
    }

    function sortListenerByPrio (a, b) {

        // TODO added second order by (id?) creation order

        return b.prio - a.prio;

    }

    // -----------------------------------------------------------------
    //
    // object.once( eventName, [ prio, ] callback )
    //
    // -----------------------------------------------------------------

    o.once = function (eventName, prio, fn) {

        if (arguments.length === 2) {
            fn = prio;
            prio = eventize.PRIO_DEFAULT;
        }

        var lid = o.on(eventName, prio, function () {
            o.off(lid);
            return fn.apply(this, arguments);
        });

        return lid;

    };

    // -----------------------------------------------------------------
    //
    // object.off( id )
    //
    // id: id or previously bound object or function reference
    //
    // -----------------------------------------------------------------

    o.off = function (id) {

        // TODO
        // - global off (deactivate all)
        // - test id === object (registered with on())

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

        if (typeof id === 'number' || typeof id === 'function' || typeof id === 'object') {
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
                        return;
                    }
                }
            }
        }

        if (typeof id === 'object') {
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

        if (o._eventize.off.indexOf(eventName) >= 0) return;

        var args = Array.prototype.slice.call(arguments, 1);
        var _callbacks = o._eventize.callbacks[eventName];
        var i, len, cb;

        if (_callbacks) {
            len = _callbacks.length;
            for (i = 0; i < len; i++) {
                cb = _callbacks[i];
                if (cb.isFunction) {
                    cb.fn.apply(this, args);
                } else {
                    cb.fn.emit(eventName, args);
                }
            }
        }

        // TODO move bound objects calls to PRIO_DEFAULT (functions)

        len = o._eventize.boundObjects.length;
        if (len) {
            //args.unshift(this);
            args.push(this);
            for (i = 0; i < len; i++) {
                cb = o._eventize.boundObjects[i][eventName];
                if (typeof cb === 'function') {
                    cb.apply(o._eventize.boundObjects[i], args);
                }
            }
        }

    };

    // -----------------------------------------------------------------
    //
    // object.emitReduce( eventName [, value ] [, arguments .. ] )
    //
    // -----------------------------------------------------------------

    o.emitReduce = function (eventName /*, value, [arguments ..] */) {
        var args = Array.prototype.slice.call(arguments, 1);
        var _callbacks = o._eventize.callbacks[eventName];
        var i, len, cb;
        if (args.length === 0) {
            args.push({});
        }
        if (_callbacks) {
            len = _callbacks.length;
            for (i = 0; i < len; i++) {
                cb = _callbacks[i];
                args[0] = cb.isFunction ? cb.fn.apply(this, args) : cb.fn.emitReduce(eventName, args);
            }
        }

        // TODO move bound objects calls to PRIO_DEFAULT (functions)

        len = o._eventize.boundObjects.length;
        if (len) {
            //args.unshift(this);
            args.push(this);
            for (i = 0; i < len; i++) {
                cb = o._eventize.boundObjects[i][eventName];
                if (typeof cb === 'function') {
                    args[1] = cb.apply(o._eventize.boundObjects[i], args);
                }
            }
            return args[1];
        }
        return args[0];
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


