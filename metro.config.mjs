const { getDefaultConfig } = require("@expo/metro-config");

const config = getDefaultConfig(__dirname);
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer"),
};

module.exports = config;
