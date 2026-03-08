const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
    entry: './src/index.ts',
    target: 'node',
    mode: 'production',
    externals: [nodeExternals()], // node_modules 以下のネイティブ依存関係はバンドルしない
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'index.js',
        libraryTarget: 'commonjs' // Firebase Functions が require できるようにする
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    },
    optimization: {
        minimize: false // クラッシュ時のスタックトレースを読みやすくするため minify OFF
    }
};
