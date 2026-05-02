module.exports = {
  root: true,
  extends: '@react-native',
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      presets: ['babel-preset-expo'],
    },
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'error',
  },
};