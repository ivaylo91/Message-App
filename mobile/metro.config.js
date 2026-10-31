const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withSentryConfig } = require('@sentry/react-native/metro');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

// withSentryConfig ties each bundle to its source map, so crash stack traces
// can be read once maps are uploaded.
module.exports = withSentryConfig(mergeConfig(getDefaultConfig(__dirname), config));
