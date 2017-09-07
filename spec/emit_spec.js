'use strict';

let eventize = require('../eventize');

describe("eventizedObj.emit", function () {

    let obj = eventize({});

    it("should call proper listeners in correct order", function () {

        let results = [];

        let a = {
            foo: function (x) {
                results.push('a.foo:'+x+'/'+arguments.length);
            },
            bar: function (x) {
                results.push('a.bar:'+x+'/'+arguments.length);
            }
        };

        obj.on('foo', function (x) {
            results.push('on.foo_1:'+x+'/'+arguments.length);
        });

        obj.on('foo', eventize.PRIO_MAX, function (x) {
            results.push('on.foo_0:'+x+'/'+arguments.length);
        });

        obj.on('foo', eventize.PRIO_MIN, function (x) {
            results.push('on.foo:'+x+'/'+arguments.length);
        });

        obj.on('foo', function (x) {
            results.push('on.foo_2:'+x+'/'+arguments.length);
        });

        obj.on('bar', eventize.PRIO_A, function (x) {
            results.push('on.bar:'+x+'/'+arguments.length);
        });

        obj.on('foo', function (x) {
            results.push('on.foo_3:'+x+'/'+arguments.length);
        });

        obj.on(a);

        obj.emit('foo', 'a', 0);
        obj.emit('bar', 'b');

        expect(results).toEqual([
            'on.foo_0:a/2',
            'on.foo_1:a/2',
            'on.foo_2:a/2',
            'on.foo_3:a/2',
            'on.foo:a/2',
            'a.foo:a/2',
            'on.bar:b/1',
            'a.bar:b/1'
        ]);

    });

});

