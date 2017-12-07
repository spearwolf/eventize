const path = require('path');

module.exports = {
  entry: './src/eventize.js',
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
  output: {
    filename: 'eventize.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
