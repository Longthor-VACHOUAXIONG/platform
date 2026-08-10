// Adds the Android notification (status-bar) icon + color for Firebase Cloud
// Messaging notifications. The @react-native-firebase/messaging config plugin
// sets the `default_notification_icon` / `default_notification_color` manifest
// metadata but does NOT create the referenced drawable/color resources itself
// (that used to be done by the removed top-level `config.notification` field).
// This plugin copies the icon PNG into res/drawable and writes the color.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ICON_COLOR = '#B6F400';

module.exports = function withFirebaseNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;
      const resDir = path.join(platformRoot, 'app', 'src', 'main', 'res');

      const drawableDir = path.join(resDir, 'drawable');
      fs.mkdirSync(drawableDir, { recursive: true });
      fs.copyFileSync(
        path.join(projectRoot, 'assets', 'notification-icon.png'),
        path.join(drawableDir, 'notification_icon.png')
      );

      const valuesDir = path.join(resDir, 'values');
      fs.mkdirSync(valuesDir, { recursive: true });
      fs.writeFileSync(
        path.join(valuesDir, 'notification_icon_color.xml'),
        `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="notification_icon_color">${ICON_COLOR}</color>\n</resources>\n`
      );

      return config;
    },
  ]);
};
