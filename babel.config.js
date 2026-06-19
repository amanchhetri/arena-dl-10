module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@/features': './src/features',
            '@/ui': './src/ui',
            '@/lib': './src/lib',
            '@/theme': './src/theme',
            '@/types': './src/types',
            '@/app': './app',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
  };
};
