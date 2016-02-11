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

        obj.bindOn(listen);

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
});

