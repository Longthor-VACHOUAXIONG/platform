// Firebase configuration for GoFair Rider App
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
  bundleId: "com.gofair.rider",
  googleAppId: "1:775819116015:ios:bca3e085e2b8e20458ca1a",
  clientId: "775819116015-9do5h4v6360tg5o9o78h8d1ll7j579t6.apps.googleusercontent.com",
  reversedClientId: "com.googleusercontent.apps.775819116015-9do5h4v6360tg5o9o78h8d1ll7j579t6",
};

// Android Configuration
export const androidConfig = {
  packageName: "com.gofair.rider",
  mobileSdkAppId: "1:775819116015:android:b000b5fe888ad50958ca1a",
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
