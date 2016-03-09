'use strict';

require("babel-register");

const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const exit = require('gulp-exit');
const fs = require('fs');
const gulp = require('gulp');
const gutil = require('gulp-util');
const insert = require('gulp-insert');
const size = require('gulp-size');
const source = require('vinyl-source-stream');
const uglify = require('gulp-uglify');
const watchify = require('watchify');
const packageJson = require('./package');

function compile (name, isWatch) {

    let bundler = watchify(browserify('./src/' + name + '.js', {
        debug: false,
        standalone: name,
    }));

    function rebundle () {

        let target = `${name}.js`;

        gutil.log("Bundling '" + gutil.colors.yellow(target) + "'...");

        return bundler.bundle()
            .on('error', function (err) { console.error(err); this.emit('end'); })
            .pipe(source(target))
            .pipe(buffer())
            .pipe(uglify({
                mangle: true,
                compress: {
                    sequences: true,
                    dead_code: true,
                    drop_debugger: true,
                    unsafe: true,
                    conditionals: true,
                    booleans: true,
                    loops: true,
                    unused: true,
                    if_return: true,
                    join_vars: true,
                    cascade: true
                }
            }))
            .pipe(insert.prepend(fs.readFileSync('./src/LICENSE.js', 'utf8').replace(/#VERSION#/g, packageJson.version)))
            .pipe(size({ showFiles: true }))
            .pipe(gulp.dest('.'));
    }

    if (isWatch) {

        bundler.on('update', () => {
            rebundle();
        });

        rebundle();

    } else {
        rebundle().pipe(exit());
    }

}

function watch (name) {
    return compile(name, true);
}

gulp.task('build', () => compile('eventize'));
gulp.task('watch', () => watch('eventize'));

gulp.task('default', ['build']);

