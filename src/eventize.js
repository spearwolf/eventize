'use strict';

var hasMap = canUseMap();
var hasSymbol = canUseSymbol();

var PROP_NAMESPACE  = hasSymbol ? Symbol('eventize') : '_eventize';
var CATCH_ALL_EVENT = '*';
var LOG_NAMESPACE   = '[eventize.js]';

// =====================================================================
//
// eventize( object )
//
// =====================================================================

function eventize (o) {

    if (o[PROP_NAMESPACE]) return o;

    var _e = {
        lastCallbackId : 0,
        callbacks      : {},
        boundObjects   : []
    };

    _e.callbacks[CATCH_ALL_EVENT] = [];

    var _ePublic = definePublicPropertiesRO({}, {
        silenced : false,
        off      : []
    });

    defineHiddenPropertyRO(o, PROP_NAMESPACE, _ePublic);

    if (eventize.PRIO_DEFAULT === undefined) {

        definePublicPropertiesRO(eventize, {
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
    // object.on( eventName, [ prio, ] callbackFunc )
    // object.on( eventName, [ prio, ] obj )
    //
    // object.on( callbackFunc )    => object.on( '*', callbackFunc )
    // object.on( obj )             => object.on( '*', obj )
    //
    // object.on( eventName )
    // object.on()
    //
    // -----------------------------------------------------------------

    o.on = function (eventName, prio, fn) {  // --- {{{

        var argsLen = arguments.length;

        if (argsLen === 0) {
            if (_ePublic.silenced) {
                definePublicPropertyRO(_ePublic, 'silenced', false);
                _ePublic.off.length = 0;
            }
            return;
        }

        var i;

        if (argsLen === 1) {
            if (typeof eventName === 'string') {

                i = _ePublic.off.indexOf(eventName);
                if (i >= 0) {
                    _ePublic.off.splice(i, 1);
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

        var eventizeCallbacks = _e.callbacks;
        var eventListener = eventizeCallbacks[eventName] || (eventizeCallbacks[eventName] = []);
        var listenerId = createId();
        var listener = definePublicPropertiesRO({}, {
            id         : listenerId,
            fn         : fn,
            prio       : (typeof prio !== 'number' ? eventize.PRIO_DEFAULT : prio),
            isFunction : (typeof fn === 'function'),
        });

        eventListener.push(listener);
        eventListener.sort(sortListenerByPrio);

        return listenerId;

    };

    function createId () {
        return ++_e.lastCallbackId;
    }

    function sortListenerByPrio (a, b) {
        return a.prio !== b.prio ? b.prio - a.prio : a.id - b.id;
    }

    // --- on }}}

    // ----------------------------------------------------------------------
    //
    // object.once( eventName, [ prio, ] callbackFunc )
    // object.once( eventName, [ prio, ] obj )
    //
    // object.once( callbackFunc )      => object.once( '*', callbackFunc )
    // object.once( obj )               => object.once( '*', obj )
    //
    // ----------------------------------------------------------------------

    o.once = function (eventName, prio, fn) {  // --- {{{

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

    // --- once }}}

    // -----------------------------------------------------------------
    //
    // object.off( id )
    // object.off( callback )
    // object.off( obj )
    // object.off( eventName )
    // object.off()
    //
    // deactive listener by id or previously bound object or
    // function reference or event name or silence all events
    //
    // -----------------------------------------------------------------

    o.off = function (id) {  // -- {{{

        if (arguments.length === 0) {
            if (!_ePublic.silenced) {
                definePublicPropertyRO(_ePublic, 'silenced', true);
                _ePublic.off.length = 0;
            }
            return;
        }

        if (typeof id === 'string') {
            //
            // by event name
            //
            if (_ePublic.off.indexOf(id) === -1) {
                _ePublic.off.push(id);
            }
            return;
        }

        var eventizeCallbacks = _e.callbacks;
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
            i = _e.boundObjects.indexOf(id);
            if ( i >= 0 ) {
                _e.boundObjects.splice(i, 1);
            }
        }

    };

    // --- off }}}

    // -----------------------------------------------------------------
    //
    // object.connect( obj )
    // object.connect( obj, mapping )
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

    o.connect = function (obj, mapping) {  // --- {{{
        var argsLen = arguments.length;
        if (argsLen === 1) {
            return _bindObject(obj);
        } else if (argsLen === 2) {
            return _connectWithMapping(this, obj, mapping);
        } else {
            console.warn(LOG_NAMESPACE, '.connect() called with insufficient arguments!', arguments);
        }
    };

    function _bindObject (obj) {

        // TODO connect(obj) should ..
        // - support priority
        // - support filters? (via only, except options)
        // - support senderContextArgument?: 'prepend'|'append'|false

        if (!obj) return;
        var i = _e.boundObjects.indexOf(obj);
        if (i === -1) {
            _e.boundObjects.push(obj);
        }
        return obj;

    }

    function _connectWithMapping (obj, options, listenerMap) {

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

    // --- connect }}}

    // -----------------------------------------------------------------
    //
    // object.emit( eventName [, arguments .. ] )
    //
    // -----------------------------------------------------------------

    o.emit = function () {  // --- {{{

        // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#3-managing-arguments
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i) {
            args[i] = arguments[i];
        }

        var eventName;
        var senderCtx = this;
        var rootCtx;
        var argsCtx;

        if (args.length > 1 && typeof args[0] !== 'string' && typeof args[1] === 'string') {
            rootCtx = args.shift();
            eventName = args.shift();
            args[args.length - 1] = rootCtx;
            argsCtx = args;
        } else {
            eventName = args.shift();  // throw out eventName
            argsCtx = args.concat([senderCtx]);
        }

        _dispatch(eventName, function (listener) {

            if (listener.isFunction) {
                listener.fn.apply(senderCtx, args);
            } else {
                var fn = listener.fn[eventName];
                if (typeof fn === 'function') {
                    fn.apply(listener.fn, argsCtx);
                } else if (listener.fn[PROP_NAMESPACE]) {
                    listener.fn.emit.apply(listener.fn, [eventName].concat(args));
                }
            }

        }, function (fn, boundObj) {

            if (fn) {
                fn.apply(boundObj, argsCtx);
            } else {
                boundObj.emit.apply(boundObj, [senderCtx, eventName].concat(argsCtx));
            }

        });

    }

    function _dispatch (eventName, emitListener, emitBoundObject) {

        if (_ePublic.silenced) return;
        if (_ePublic.off.indexOf(eventName) >= 0) return;

        var listeners              = _e.callbacks[eventName];
        var catchAllListeners      = _e.callbacks[CATCH_ALL_EVENT];
        var boundObjsCount         = _e.boundObjects.length;
        var hasBoundObjectsEmitted = false;

        function _emitBoundObjects () {
            var j, bo, fn;
            if (boundObjsCount) {
                for (j = 0; j < boundObjsCount; j++) {
                    bo = _e.boundObjects[j];
                    fn = bo[eventName];
                    if (typeof fn === 'function') {
                        emitBoundObject(fn, bo);
                    } else if (bo[PROP_NAMESPACE]) {
                        emitBoundObject(null, bo);
                    }
                }
            }
        }

        var i, len, listen;

        if (listeners || catchAllListeners.length) {

            listeners = listeners ? listeners.concat(catchAllListeners) : catchAllListeners;
            len = listeners.length;

            for (i = 0; i < len; i++) {
                listen = listeners[i];
                if (!hasBoundObjectsEmitted && listen && listen.prio < eventize.PRIO_DEFAULT) {
                    _emitBoundObjects();
                    hasBoundObjectsEmitted = true;
                }
                emitListener(listen);
            }
        }

        if (!hasBoundObjectsEmitted) _emitBoundObjects();

    }

    // --- emit }}}

    // --------------------------------------------------------------------
    //
    // object.emitReduce( eventName [, value= {} ] [, arguments .. ] )
    //
    // --------------------------------------------------------------------

    o.emitReduce = function () {  // --- {{{

        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i) {
            args[i] = arguments[i];
        }

        var eventName = args.shift();
        var value;

        function setValue (val) {
            if (val !== undefined) {
                value = val;
            }
        }

        if (args.length === 0) {
            value = {};
            args.push(value);
        } else {
            setValue(args[0]);
        }

        var ctx = this;
        var argsWithEventName = [eventName].concat(args);
        var argsCtx = args.concat([ctx]);

        _dispatch(eventName, function (listener) {

            if (listener.isFunction) {
                args[0] = value;
                setValue(listener.fn.apply(ctx, args));
            } else {
                var fn = listener.fn[eventName];
                if (typeof fn === 'function') {
                    argsCtx[0] = value;
                    setValue(fn.apply(listener.fn, argsCtx));
                } else if (listener.fn[PROP_NAMESPACE]) {
                    argsWithEventName[1] = value;
                    setValue(listener.fn.emitReduce.apply(listener.fn, argsWithEventName));
                }
            }

        }, function (fn, boundObj) {

            if (fn) {
                argsCtx[0] = value;
                setValue(fn.apply(boundObj, argsCtx));
            }

        });

        return value;

    };

    // --- emit }}}

    return o;

} // <= eventize()

eventize.is = function (obj) {
    return !!( obj && obj[PROP_NAMESPACE] );
};

defineHiddenPropertyRO(eventize, 'EventizeNamespace', PROP_NAMESPACE);


// =====================================================================
//
// eventize.queue( queueName[, options]) : queue
//
// options are:
//    - replace: true|false  - replace previous events with same name
//                             when queue is in collect mode
//
// queue.play()
// queue.collect()
// queue.state
//
// =====================================================================

defineHiddenPropertyRO(eventize, 'queues', hasMap ? new Map : {});

eventize.queue = function (name, options) {

    var queue = name ? (hasMap ? eventize.queues.get(name) : eventize.queues[name]) : null;

    if (!queue) {
        queue = createQueue(name, options);
        if (hasMap) {
            eventize.queues.set(queue.name, queue);
        } else {
            eventize.queues[queue.name] = queue;
        }
    }

    return queue;

};


var STATE = 'state';
var PLAY = 'play';
var COLLECT = 'collect';

function createQueue(name, options) {

    var queueName = ((typeof name === 'string' || typeof name === 'symbol') && name) || createUuid();
    var queue = eventize({});
    var isReplace = !!(options && options.replace);

    var setState = function (state) {
        definePublicPropertyRO(queue, STATE, state);
    };

    var emit = (function (_emit) {
            return function (args) {
            _emit.apply(queue, args);
        };
    })(queue.emit);

    defineHiddenPropertyRO(queue, 'events', []);
    definePublicPropertyRO(queue, 'name', queueName);

    queue.collect = function () {
        if (queue[STATE] !== COLLECT) {
            setState(COLLECT);
        }
        return queue;
    };

    queue.emit = function () {
        var args = Array.prototype.slice.call(arguments, 0);
        if (queue[STATE] === PLAY) {
            emit(args);
        } else {  // COLLECT
            if (isReplace) {
                for (var i = 0, len = queue.events.length; i < len; i++) {
                    if (queue.events[i][0] === args[0]) {
                        queue.events[i] = args;
                        return;
                    }
                }
            }
            queue.events.push(args);
        }
    };

    queue.play = function () {
        if (queue[STATE] !== PLAY) {
            setState(PLAY);
            queue.events.forEach(emit);
            queue.events.length = 0;
        }
        return queue;
    };

    return queue.play();

}


// =====================================================================
//
// helper functions
//
// =====================================================================

function createUuid() {
    // http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
    var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    return hasSymbol ? Symbol(uuid) : uuid;
}

function canUseSymbol () {
    return typeof Symbol !== 'undefined';
}

function canUseMap () {
    return typeof Map !== 'undefined';
}

function definePublicPropertyRO (obj, name, value) {
    Object.defineProperty(obj, name, {
        value        : value,
        configurable : true,
        enumerable   : true
    });
    return obj;
}

function definePublicPropertiesRO (obj, attrs) {
    var i, keys = Object.keys(attrs);
    for (i = keys.length; i--;) {
        definePublicPropertyRO(obj, keys[i], attrs[keys[i]]);
    }
    return obj;
}

function defineHiddenPropertyRO (obj, name, value) {
    Object.defineProperty(obj, name, {
        value        : value,
        configurable : true
    });
    return obj;
}


// --- end
//
module.exports = eventize;
