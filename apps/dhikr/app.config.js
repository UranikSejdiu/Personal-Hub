module.exports = ({ config }) => ({
  ...config,
  version: require("./package.json").version,
});
