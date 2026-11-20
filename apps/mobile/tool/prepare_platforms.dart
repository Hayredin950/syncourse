import 'dart:io';

/// Post-`flutter create` fixes that the generated templates do not include.
///
/// Flutter puts `android.permission.INTERNET` in the debug and profile
/// manifests only. A release APK therefore has no network access at all, and
/// every request dies as `Failed host lookup` before it reaches the API. The
/// permission is inert in debug, so adding it to the main manifest is safe for
/// every build type.
///
/// Run after `flutter create` and before `flutter build`:
///   dart tool/prepare_platforms.dart
void main() {
  const permission = '<uses-permission android:name="android.permission.INTERNET"/>';
  final manifest = File('android/app/src/main/AndroidManifest.xml');

  if (!manifest.existsSync()) {
    stdout.writeln('No Android manifest here — nothing to patch.');
    return;
  }

  final xml = manifest.readAsStringSync();
  if (xml.contains('android.permission.INTERNET')) {
    stdout.writeln('INTERNET permission already present.');
    return;
  }

  // The manifest is <manifest …> <application …> … </manifest>. Inserting the
  // permission as a sibling of <application> is the documented placement; a
  // permission inside <application> is ignored by the installer.
  final patched = xml.replaceFirst(
    '<application',
    '$permission\n\n    <application',
  );
  if (patched == xml) {
    stderr.writeln('Could not find <application> in the Android manifest.');
    exitCode = 1;
    return;
  }

  manifest.writeAsStringSync(patched);
  stdout.writeln('Added INTERNET permission to AndroidManifest.xml');
}
