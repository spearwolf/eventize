'use strict';

let eventize = require('../eventize');

describe("eventizedObj.connect(otherEventizedObj)", function () {

    it("should work as expected", function () {

        let res = [];

        let a = eventize({});
        let b = eventize({});
        //let b = {};

        a.connect(b);

        b.foo = function () {
            res.push('b.foo');
        };

        a.emit('foo');

        expect(res).toEqual(['b.foo']);

    });

});

