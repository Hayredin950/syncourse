import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme.dart';
import '../widgets/ui.dart';

const _repo = 'https://github.com/Hayredin950/syncourse';
const _latest = '$_repo/releases/latest';
const _releases = '$_repo/releases';
const _webApp = 'https://syncourse.pages.dev';

String _asset(String file) => '$_latest/download/$file';

class _Build {
  const _Build({
    required this.os,
    required this.detail,
    required this.blurb,
    required this.file,
    required this.format,
    required this.icon,
  });

  final String os, detail, blurb, file, format;
  final IconData icon;
}

const _builds = <_Build>[
  _Build(
    os: 'Android',
    detail: 'Android 7.0+',
    blurb:
        'Install the APK directly. Updates come from the same link; no store account needed.',
    file: 'syncourse-android.apk',
    format: 'APK',
    icon: Icons.smartphone,
  ),
  _Build(
    os: 'Windows',
    detail: 'Windows 10/11 · 64-bit',
    blurb:
        'Unzip anywhere and run syncourse.exe. No installer, no admin rights.',
    file: 'syncourse-windows-x64.zip',
    format: 'ZIP',
    icon: Icons.laptop,
  ),
  _Build(
    os: 'Linux',
    detail: 'x86_64 · glibc',
    blurb:
        'Unpack the archive and run the binary inside. GTK 3 is the only system dependency.',
    file: 'syncourse-linux-x64.tar.gz',
    format: 'tar.gz',
    icon: Icons.terminal,
  ),
  _Build(
    os: 'macOS',
    detail: 'Apple silicon · macOS 11+',
    blurb:
        'Open the disk image and drag Syncourse to Applications. Unsigned build: right-click → Open the first time.',
    file: 'syncourse-macos-arm64.dmg',
    format: 'DMG',
    icon: Icons.laptop_mac,
  ),
];

/// `/download` — the same four native builds and the web-first note the web
/// page offers, so the app is not a dead end for someone deciding where to run
/// Syncourse.
class DownloadScreen extends StatelessWidget {
  const DownloadScreen({super.key});

  Future<void> _open(BuildContext context, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open $url')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            SyncourseHeader(
              title: 'Get the app',
              showBack: Navigator.canPop(context),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: Text('SYNCOURSE EVERYWHERE',
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                      color: AppColors.accent)),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 6, 16, 0),
              child: Text(
                'Learn on the screen\nyou already have.',
                style: TextStyle(
                    fontSize: 32,
                    height: 1.05,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -1.2,
                    color: AppColors.text),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Text(
                'One codebase, four native builds and the web. Courses, notes, collections and your progress stay in sync because every client reads the same API.',
                style:
                    TextStyle(fontSize: 13, height: 1.6, color: AppColors.ink4),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  FilledButton.icon(
                    onPressed: () =>
                        _open(context, _asset('syncourse-android.apk')),
                    icon: const Icon(Icons.smartphone, size: 16),
                    label: const Text('Android APK'),
                  ),
                  OutlinedButton.icon(
                    onPressed: () => _open(context, _webApp),
                    icon: const Icon(Icons.public, size: 16),
                    label: const Text('Open the web app'),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Text(
                'Version history, checksums and every platform: github.com/Hayredin950/syncourse/releases',
                style: const TextStyle(fontSize: 11, color: AppColors.dim),
              ),
            ),
            const SectionHead(title: 'Every platform'),
            for (final b in _builds)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                child: _BuildCard(
                  data: b,
                  onDownload: () => _open(context, _asset(b.file)),
                ),
              ),
            const SectionHead(title: 'Good to know'),
            const _Note(
              icon: Icons.smartphone,
              title: 'Android',
              body:
                  'Download the APK, then allow installs from your browser when Android asks. It is the same package published on every release — update by installing the newer file over the old one.',
            ),
            const _Note(
              icon: Icons.laptop,
              title: 'Desktop',
              body:
                  'The desktop builds are unsigned. macOS will warn on first launch (right-click → Open); Windows SmartScreen may ask once. Both are expected for a small project without a paid signing certificate, and both only need to be accepted the first time.',
            ),
            const _Note(
              icon: Icons.public,
              title: 'Web first',
              body:
                  'Every course page, resource and collection exists on the web with no install at all. The native apps add offline playback for app-hosted lessons; Telegram-delivered archives still open in Telegram everywhere.',
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
              child: OutlinedButton.icon(
                onPressed: () => _open(context, _releases),
                icon: const Icon(Icons.open_in_new, size: 15),
                label: const Text('All releases on GitHub'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BuildCard extends StatelessWidget {
  const _BuildCard({
    required this.data,
    required this.onDownload,
  });

  final _Build data;
  final VoidCallback onDownload;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(data.icon, size: 19, color: AppColors.accent),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(data.os,
                        style: const TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text)),
                    Text(data.detail,
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim)),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(data.format,
                    style: const TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .4,
                        color: AppColors.ink3)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(data.blurb,
              style: const TextStyle(
                  fontSize: 12, height: 1.55, color: AppColors.ink4)),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onDownload,
              icon: const Icon(Icons.download, size: 15),
              label: Text('Download for ${data.os}'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title, body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(15),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 16, color: AppColors.accent),
                const SizedBox(width: 8),
                Text(title,
                    style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text)),
              ],
            ),
            const SizedBox(height: 7),
            Text(body,
                style: const TextStyle(
                    fontSize: 12, height: 1.6, color: AppColors.dim)),
          ],
        ),
      ),
    );
  }
}
