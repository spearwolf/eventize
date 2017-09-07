'use strict';

let eventize = require('../eventize');

describe("eventizedObj.off", function () {

    let obj = eventize({});

    it("should deregister listener by id", function () {

        let result = null;
        let id = obj.on('foo', function (x) { result = x; });

        obj.emit('foo', 1);
        obj.off(id);
        obj.emit('foo', 2);

        expect(result).toBe(1);

    });

    it("should deregister listener by (bound) object reference", function () {

        let result = null;

        let listen = {
            'bar': function (x) { result = x; }
        };

        obj.on(listen);

        obj.emit('bar', 55);
        obj.off(listen);
        obj.emit('bar', 66);

        expect(result).toBe(55);

    });

    it("should deregister listener by event name", function () {

        let result = null;

        obj.on('plah', function (x) { result = x; });

        obj.emit('plah', 50);
        obj.off('plah');
        obj.emit('plah', 70);

        expect(result).toBe(50);

    });

    it("should deregister listener by function reference", function () {

        let result = null;
        let fn = function (x) { result = x; };

        obj.connect({
            onGraka: fn
        }, {
            onGraka: 'graka'
        });

        obj.emit('graka', 9);
        obj.off(fn);
        obj.emit('graka', 12);

        expect(result).toBe(9);

    });

    it("should silence eventized object if called with no arguments", function () {

        let result = [];

        let listen = {
            'bar': function (x) { result.push(x) },
            'foo': function (x) { result.push(x) }
        };

        obj.on(listen);

        obj.emit('bar', 1);
        obj.emit('foo', 2);
        obj.off('bar');
        obj.emit('bar', 3);
        obj.emit('foo', 4);
        obj.off();
        obj.emit('bar', 5);
        obj.emit('foo', 6);
        obj.on();
        obj.emit('bar', 7);
        obj.emit('foo', 8);

        expect(result).toEqual([1, 2, 4, 7, 8]);

    });

    it("should deregister catch all listeners by id", function () {

        let result = [];

        let id = obj.on(function (x) { result.push(x); });
        obj.on('fooo', function (x) { result.push(x+1000); });

        obj.emit('fooo', 1);

        obj.off(id);

        obj.emit('fooo', 2);

        expect(result).toEqual([1001, 1, 1002]);

    });

    it("should deregister catch all listeners by function reference", function () {

        let result = [];

        let fn = function (x) { result.push(x); };

        obj.on(fn);
        obj.on('rokko', function (x) { result.push(x+1000); });

        obj.emit('rokko', 1);

        obj.off(fn);

        obj.emit('rokko', 2);

        expect(result).toEqual([1001, 1, 1002]);

    });

    it("should deregister catch all listeners by object reference", function () {

        let result = [];

        let obj2 = eventize({});
        obj2.on('sahel', function (x) { result.push(x); });

        obj.on(obj2);
        obj.on('sahel', function (x) { result.push(x+1000); });

        obj.emit('sahel', 1);

        obj.off(obj2);

        obj.emit('sahel', 2);

        expect(result).toEqual([1001, 1, 1002]);

    });

});

