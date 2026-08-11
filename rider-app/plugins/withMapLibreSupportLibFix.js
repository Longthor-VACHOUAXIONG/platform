// @maplibre/maplibre-react-native still hardcodes the legacy
// com.android.support:*:28.0.0 artifacts in its module build.gradle, which
// duplicate classes that modern androidx (androidx.core:core) already ships
// (android.support.v4.* compat shims). The module source never imports
// android.support.*, so excluding the group is safe. This plugin re-applies
// the exclusion to the generated app/build.gradle after every prebuild.
const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withMapLibreSupportLibFix(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes("exclude group: 'com.android.support'")) {
      contents = contents.replace(
        'dependencies {',
        `configurations.all {
    exclude group: 'com.android.support'
}

dependencies {`
      );
      config.modResults.contents = contents;
    }
    return config;
  });
};
