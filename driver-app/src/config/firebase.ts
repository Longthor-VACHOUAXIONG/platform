// Firebase configuration for GoFair Driver App
// Production-ready configuration for lao-taxi project

export const firebaseConfig = {
  apiKey: "AIzaSyBLuQPhn6g-DUMeKWuai2HysLRCCb5OzX0",
  authDomain: "lao-taxi.firebaseapp.com",
  databaseURL: "https://lao-taxi-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lao-taxi",
  storageBucket: "lao-taxi.firebasestorage.app",
  messagingSenderId: "775819116015",
  appId: "1:775819116015:web:7d9fdc5e143aa10558ca1a",
  measurementId: "G-46GTNSJ2SP"
};

// iOS Configuration
export const iosConfig = {
  bundleId: "com.gofair.driver",
  googleAppId: "1:775819116015:ios:7f9c713762bff4fe58ca1a",
  clientId: "775819116015-ajotb85n78a5kau2reftmln6ealsp9h1.apps.googleusercontent.com",
  reversedClientId: "com.googleusercontent.apps.775819116015-ajotb85n78a5kau2reftmln6ealsp9h1",
};

// Android Configuration
export const androidConfig = {
  packageName: "com.gofair.driver",
  mobileSdkAppId: "1:775819116015:android:b9751f6528375ea758ca1a",
  apiKey: "AIzaSyA1gslH_2bw9pKmtBoqZjb93Jhtbj2vXuU",
};

// Push Notification Configuration
export const pushNotificationConfig = {
  senderId: "775819116015",
  // iOS APNs configuration is handled via GoogleService-Info.plist
  // Android FCM configuration is handled via google-services.json
};

// Feature flags
export const featureFlags = {
  enableAnalytics: true,
  enableAds: false,
  enableAppInvite: true,
  enableSignIn: true,
};
