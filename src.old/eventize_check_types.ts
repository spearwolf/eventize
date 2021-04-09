import eventize, { PRIO_A, Eventize } from 'eventize-js';

class Awesome {
    doAwesomeThings() {}
}

const o = eventize(new Awesome());

o.on('foo', {
    foo() {
        console.log('foo');
    }
});

class Foo {
    foo() {}
    bar(x: number) {}
}

o.on(['foo', 'bar'], new Foo());

function plah (this: Foo) { }

o.on('foo', plah, new Foo())

o.on(new Foo());

o.on(PRIO_A, new Foo());
o.on(666, {});

const a = eventize.create(new Awesome());
const b = eventize.extend(new Awesome());
const c = eventize.inject(new Awesome());

if (eventize.is(a) || eventize.is({})) {
    // awesome
}

class Plah extends Eventize {
    constructor() {
        super();
        this.retain('foo');
    }
    foo() {
        this.emit('foo');
    }
 }
