'use strict';

let eventize = require('../eventize');

describe("eventizedObj.bindOn", function () {

    let obj = eventize({});

    it("should return the object given as first argument", function () {

        let a = {};
        let b = obj.bindOn(a);

        expect(a).toBe(b);

    });

    it("should call the same-name-as-event method", function () {

        let result = 0;
        let a = {
            foo: function (x) { result = x; }
        };

        obj.bindOn(a);
        obj.emit('foo', 23);

        expect(result).toBe(23);

    });

    it("scope of callback should be the bound object scope", function () {

        let scope = null;
        let a = {
            bar: function () { scope = this; }
        };

        obj.bindOn(a);
        obj.emit('bar');

        expect(scope).toBe(a);

    });

    it("undefined event methods should be silently ignored", function () {

        let result = null;
        let a = {
            pfuu: function () { result = 13; }
        };

        obj.bindOn(a);

        obj.emit('xxcxcxc'); // <= undefined
        obj.emit('pfuu');    // <= defined

        expect(result).toBe(13);

    });

    it("last argument should be always the eventized object", function () {

        let result = [];
        let a = {
            plah: function (_a, b, c) {
                result.push(this);
                result.push(_a);
                result.push(b);
                result.push(c);
            }
        };

        obj.bindOn(a);
        obj.emit('plah', 7, 666);

        expect(result).toEqual([a, 7, 666, obj]);

    });

});

