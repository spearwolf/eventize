'use strict';

let eventize = require('../eventize');

describe("eventizedObj.emit", function () {

    let obj = eventize({});

    it("should call proper listeners", function () {

        // TODO current implementation should be changed:
        //   bound objects will be always called *after* other callbacks (registered via on() or once())

        let results = [];

        let a = {
            foo: function (x) {
                results.push('a.foo:'+x+'/'+arguments.length);
            },
            bar: function (x) {
                results.push('a.bar:'+x+'/'+arguments.length);
            }
        };

        obj.on('foo', eventize.PRIO_MIN, function (x) {
            results.push('on.foo:'+x+'/'+arguments.length);
        });

        obj.on('bar', eventize.PRIO_A, function (x) {
            results.push('on.bar:'+x+'/'+arguments.length);
        });

        obj.bindOn(a);

        obj.emit('foo', 'a', 0);
        obj.emit('bar', 'b');

        expect(results).toEqual(['on.foo:a/2', 'a.foo:a/3', 'on.bar:b/1', 'a.bar:b/2']);

    });

});

