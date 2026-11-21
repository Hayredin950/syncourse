import 'dart:io';

/// Post-`flutter create` fixes that the generated templates do not include.
///
/// Flutter puts `android.permission.INTERNET` in the debug and profile
/// manifests only. A release APK therefore has no network access at all, and
/// every request dies as `Failed host lookup` before it reaches the API. The
/// permission is inert in debug, so adding it to the main manifest is safe for
/// every build type.
///
/// The generated projects also name themselves `syncourse` everywhere, which is
/// what the launcher, window title and task switcher show. These patches only
/// touch user-visible labels; product/bundle names stay lowercase so the
/// packaging paths in the workflow keep working.
///
/// Run after `flutter create` and before `flutter build`:
///   dart tool/prepare_platforms.dart
void main() {
  _patchAndroidManifest();
  _patchAndroidDeepLinks();
  _patchIosDeepLinks();
  _patchWindowsTitle();
  _patchLinuxTitles();
  _patchMacosDisplayName();
}

void _patchAndroidManifest() {
  const permission =
      '<uses-permission android:name="android.permission.INTERNET"/>';
  final manifest = File('android/app/src/main/AndroidManifest.xml');
  if (!manifest.existsSync()) {
    stdout.writeln('No Android manifest here — skipping Android.');
    return;
  }

  var xml = manifest.readAsStringSync();
  final before = xml;

  if (!xml.contains('android.permission.INTERNET')) {
    // The manifest is <manifest …> <application …> … </manifest>. Inserting the
    // permission as a sibling of <application> is the documented placement; a
    // permission inside <application> is ignored by the installer.
    xml = xml.replaceFirst(
      '<application',
      '$permission\n\n    <application',
    );
    stdout.writeln(xml == before
        ? 'Could not find <application> in the Android manifest.'
        : 'Added INTERNET permission to AndroidManifest.xml');
  }

  // `flutter create --project-name syncourse` writes android:label="syncourse".
  // The launcher shows that string verbatim, so brand it.
  xml =
      xml.replaceAll('android:label="syncourse"', 'android:label="Syncourse"');

  if (xml != before) manifest.writeAsStringSync(xml);
}

/// Google's OAuth callback bounces through the API to `syncourse://auth`, so
/// both mobile platforms need that scheme registered or the sign-in silently
/// ends in the browser.
void _patchAndroidDeepLinks() {
  final manifest = File('android/app/src/main/AndroidManifest.xml');
  if (!manifest.existsSync()) return;
  var xml = manifest.readAsStringSync();
  if (xml.contains('android:scheme="syncourse"')) return;
  if (!xml.contains('</activity>')) return;
  const filter = '''
        <intent-filter>
            <action android:name="android.intent.action.VIEW" />
            <category android:name="android.intent.category.DEFAULT" />
            <category android:name="android.intent.category.BROWSABLE" />
            <data android:scheme="syncourse" android:host="auth" />
        </intent-filter>
''';
  xml = xml.replaceFirst('</activity>', '$filter    </activity>');
  manifest.writeAsStringSync(xml);
  stdout.writeln('Registered the syncourse:// deep link on Android.');
}

void _patchIosDeepLinks() {
  final plist = File('ios/Runner/Info.plist');
  if (!plist.existsSync()) return;
  final xml = plist.readAsStringSync();
  if (xml.contains('CFBundleURLTypes')) return;
  const entry = '''	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>syncourse</string>
			</array>
		</dict>
	</array>
''';
  final patched = xml.replaceFirst(
    RegExp(r'</dict>\s*</plist>'),
    '$entry</dict>\n</plist>',
  );
  if (patched == xml) return;
  plist.writeAsStringSync(patched);
  stdout.writeln('Registered the syncourse:// deep link on iOS.');
}

void _patchWindowsTitle() {
  final main = File('windows/runner/main.cpp');
  if (!main.existsSync()) return;
  final code = main.readAsStringSync();
  // `window.Create(L"syncourse", origin, size)` is the title bar / taskbar text.
  final patched = code.replaceAll('L"syncourse"', 'L"Syncourse"');
  if (patched != code) {
    main.writeAsStringSync(patched);
    stdout.writeln('Renamed the Windows window title.');
  }
}

void _patchLinuxTitles() {
  final app = File('linux/my_application.cc');
  if (!app.existsSync()) return;
  final code = app.readAsStringSync();
  final patched = code
      .replaceAll(
        'gtk_header_bar_set_title(header_bar, "syncourse")',
        'gtk_header_bar_set_title(header_bar, "Syncourse")',
      )
      .replaceAll(
        'gtk_window_set_title(window, "syncourse")',
        'gtk_window_set_title(window, "Syncourse")',
      );
  if (patched != code) {
    app.writeAsStringSync(patched);
    stdout.writeln('Renamed the Linux window titles.');
  }
}

void _patchMacosDisplayName() {
  final plist = File('macos/Runner/Info.plist');
  if (!plist.existsSync()) return;
  var xml = plist.readAsStringSync();
  if (xml.contains('CFBundleDisplayName')) return;
  // PRODUCT_NAME stays `syncourse` (the .app path the packaging step uses),
  // but the menu bar and Finder show the display name.
  final patched = xml.replaceFirst(
    '<key>CFBundleName</key>',
    '<key>CFBundleDisplayName</key>\n\t<string>Syncourse</string>\n\t<key>CFBundleName</key>',
  );
  if (patched != xml) {
    plist.writeAsStringSync(patched);
    stdout.writeln('Set the macOS display name.');
  }
}
