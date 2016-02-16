'use strict';

let eventize = require('../eventize');

describe("eventizedObj.emitReduce", function () {

    let obj = eventize({});

    it("should call proper listeners in correct order", function () {

        let results = [];

        let a = {
            foo: function (str, x) {
                var s = 'a.foo:'+x+'/'+arguments.length;
                results.push(s);
                return str + '|' + s;
            },
            bar: function (str, x) {
                var s = 'a.bar:'+x+'/'+arguments.length;
                results.push(s);
                return str + '|' + s;
            }
        };

        obj.on('foo', function (str, x) {
            var s = 'on.foo_1:'+x+'/'+arguments.length;
            results.push(s);
            return str + '|' + s;
        });

        obj.on('foo', eventize.PRIO_MAX, function (str, x) {
            var s = 'on.foo_0:'+x+'/'+arguments.length;
            results.push(s);
            return str + '|' + s;
        });

        obj.on('foo', eventize.PRIO_MIN, function (str, x) {
            var s = 'on.foo:'+x+'/'+arguments.length;
            results.push(s);
            return str + '|' + s;
        });

        obj.on('foo', function (str, x) {
            var s = 'on.foo_2:'+x+'/'+arguments.length;
            results.push(s);
            return str + '|' + s;
        });

        obj.on('bar', eventize.PRIO_A, function (str, x) {
            var s = 'on.bar:'+x+'/'+arguments.length;
            results.push(s);
            return str + '|' + s;
        });

        obj.on('foo', function (str, x) {
            var s = 'on.foo_3:'+x+'/'+arguments.length;
            results.push(s);
            return str + '|' + s;
        });

        obj.bindOn(a);

        var foo = obj.emitReduce('foo', 'FOO:', 'a', 23, 12);
        var bar = obj.emitReduce('bar', 'BAR:', 'b', 65);

        expect(foo).toBe('FOO:|on.foo_0:a/4|on.foo_1:a/4|on.foo_2:a/4|on.foo_3:a/4|a.foo:a/5|on.foo:a/4');
        expect(bar).toBe('BAR:|on.bar:b/3|a.bar:b/4');

        expect(results).toEqual([
            'on.foo_0:a/4',
            'on.foo_1:a/4',
            'on.foo_2:a/4',
            'on.foo_3:a/4',
            'a.foo:a/5',
            'on.foo:a/4',
            'on.bar:b/3',
            'a.bar:b/4'
        ]);

    });

});

