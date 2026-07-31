/**
 * `babel-preset-expo` handles TypeScript, JSX and the Expo Router plugin.
 * Nothing else is needed: no custom module resolver, because the workspace
 * packages are consumed through their built `dist` output.
 */
module.exports = function babelConfig(api) {
  api.cache(true);
  return { presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]] };
};
