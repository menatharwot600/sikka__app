#!/usr/bin/env bash
# build-apk.sh — سكريبت واحد يعمل كل حاجة من الصفر لحد الـ APK الموقّع
#
# يتنفذ من جذر المشروع (جنب package.json)، وعنده شرطين:
#   1) Node.js + npm متركبين
#   2) Android Studio + Android SDK متركبين (ومتغير البيئة ANDROID_HOME/ANDROID_SDK_ROOT مظبوط)
#   3) android/keystore.properties موجود ومملوء (خد نسخة من keystore.properties.example)
#
# الاستخدام:
#   chmod +x build-apk.sh
#   ./build-apk.sh

set -e  # يوقف السكريبت فوراً لو أي أمر فشل

echo "== 1/6: تركيب باكدجات npm =="
npm install

echo "== 2/6: تركيب Capacitor (لو أول مرة) =="
if [ ! -d "android" ]; then
  npx cap add android
else
  echo "   android/ موجود بالفعل، تخطينا الخطوة دي."
fi

echo "== 3/6: بناء ملفات الويب (dist/) =="
npm run build

echo "== 4/6: مزامنة Capacitor مع Android =="
npx cap sync android

echo "== 5/6: التحقق من وجود keystore.properties =="
if [ ! -f "android/keystore.properties" ]; then
  echo ""
  echo "!! خطأ: android/keystore.properties مش موجود."
  echo "   1) لو أول مرة، اعمل: keytool -genkey -v -keystore seka-release.keystore -alias seka -keyalg RSA -keysize 2048 -validity 10000"
  echo "   2) انسخ keystore.properties.example لـ android/keystore.properties واملأه"
  echo "   3) شغّل السكريبت تاني"
  exit 1
fi

echo "== 6/6: بناء الـ APK الموقّع (Release) =="
cd android
./gradlew assembleRelease
cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
  echo ""
  echo "✅ تم! الملف الجاهز للتوزيع:"
  echo "   $APK_PATH"
  echo ""
  echo "الخطوة الجاية: ارفعه على Google Drive أو موقعك وشارك الرابط."
else
  echo "!! مش لاقي الـ APK في المكان المتوقع — شوف لوج gradle فوق لأي خطأ."
  exit 1
fi
