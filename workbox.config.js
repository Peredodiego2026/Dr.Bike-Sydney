export default {
  globDirectory: '.',
  globPatterns: [
    'css/*.css',
    'js/*.js',
    'images/**/*.{png,jpg,svg,webp}',
    '*.html',
  ],
  globIgnores: ['node_modules/**', '.vercel/**'],
  swSrc: 'sw.js',
  swDest: 'sw.generated.js',
  injectionPoint: 'self.__WB_MANIFEST',
};
