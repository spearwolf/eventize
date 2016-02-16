'use strict';

let eventize = require('../eventize');

describe("eventizedObj.connect", function () {

    let obj = eventize({});

    it("should register multiple listeners", function () {

        let result = [];

        obj.connect({
            'onFoo': function (x) {
                result.push(x);
            },
            'onBar': function (x) {
                result.push(x);
            }
        }, {
            'onFoo': 'foo',
            'onBar': 'bar'
        });

        obj.connect({
            'onFoo': function (x) {
                result.push(x*2);
            },
            'onBar': function (x) {
                result.push(x*2);
            }
        }, {
            'onFoo': [ eventize.PRIO_MAX, 'foo'],
            'onBar': [ eventize.PRIO_C, 'bar' ]
        });

        obj.emit('bar', 666);
        obj.emit('foo', 23);

        expect(result).toEqual([1332, 666, 46, 23]);

    });

});

