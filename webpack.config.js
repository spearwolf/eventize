const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const packageJson = require('./package.json');

const BANNER = fs.readFileSync('./src/LICENSE.js', { encoding: 'utf-8' })
  .replace('#NPM_NAME#', packageJson.name)
  .replace('#NPM_VERSION#', packageJson.version)
  .replace('#NPM_URL#', packageJson.repository.url)
  .replace('#NPM_COPYRIGHT_YEAR#', new Date().getFullYear());

module.exports = {
  entry: './src/eventize.umd.js',
  devtool: 'source-map',
  module: {
    rules: [{
      test: /\.js$/,
      loader: 'babel-loader?cacheDirectory=.babelCache',
      exclude: [
        /node_modules/,
      ],
    }],
  },
  resolve: {
    extensions: ['.js'],
    modules: [
      './node_modules',
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: BANNER,
      raw: true,
      entryOnly: true,
    }),
  ],
  output: {
    filename: 'eventize.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: 'eventize',
  },
};
