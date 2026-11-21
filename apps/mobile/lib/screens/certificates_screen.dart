import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _webApp = 'https://syncourse.pages.dev';

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _date(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// `/certificates` — your earned records, plus the public serial lookup. A
/// certificate only ever means every lesson or module was marked complete.
class CertificatesScreen extends StatefulWidget {
  const CertificatesScreen({super.key});

  @override
  State<CertificatesScreen> createState() => _CertificatesScreenState();
}

class _CertificatesScreenState extends State<CertificatesScreen> {
  List<Map<String, dynamic>>? _rows;
  bool _loading = true;
  bool _failed = false;
  bool _signedIn = false;

  final _serial = TextEditingController();
  Map<String, dynamic>? _verified;
  bool _verifying = false;
  bool _notFound = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _serial.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    final token = await Api.loadToken();
    _signedIn = token != null;
    if (!_signedIn) {
      if (!mounted) return;
      setState(() {
        _rows = const [];
        _loading = false;
      });
      return;
    }
    try {
      final rows = await Api.myCertificates();
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) _toast('Could not open $url');
  }

  Future<void> _verify([String? serial]) async {
    final raw = (serial ?? _serial.text).trim().toUpperCase();
    if (raw.isEmpty) return;
    setState(() {
      _verifying = true;
      _notFound = false;
      _verified = null;
    });
    try {
      final data = await Api.verifyCertificate(raw);
      if (!mounted) return;
      setState(() {
        _verified = data;
        _verifying = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _notFound = true;
        _verifying = false;
      });
    }
  }

  Future<void> _downloadPdf(String serial) async {
    try {
      final bytes = await Api.downloadBytes(
          '/certificates/${Uri.encodeComponent(serial)}/pdf');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/syncourse-$serial.pdf');
      await file.writeAsBytes(bytes, flush: true);
      final opened = await launchUrl(Uri.file(file.path),
          mode: LaunchMode.externalApplication);
      if (!opened) _toast('Certificate saved to ${file.path}');
    } catch (e) {
      _toast('Could not build the certificate: $e');
    }
  }

  Future<void> _copyVerify(String serial) async {
    await Clipboard.setData(
        ClipboardData(text: '$_webApp/certificates/$serial'));
    _toast('Verification link copied');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              SyncourseHeader(
                title: 'Certificates',
                showBack: Navigator.canPop(context),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 2, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('CERTIFICATES OF COMPLETION',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                            color: AppColors.accent)),
                    SizedBox(height: 5),
                    Text('Proof of the work.',
                        style: TextStyle(
                            fontSize: 30,
                            height: 1.08,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1.1,
                            color: AppColors.text)),
                    SizedBox(height: 8),
                    Text(
                      'A numbered record, issued once you mark every lesson or module in a course complete. It is self-reported progress — not an exam or an accreditation.',
                      style: TextStyle(
                          fontSize: 12.5, height: 1.6, color: AppColors.dim),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              _VerifyPanel(
                controller: _serial,
                busy: _verifying,
                notFound: _notFound,
                result: _verified,
                onVerify: _verify,
                onDownload: _downloadPdf,
                onCopy: _copyVerify,
                onOpenPublic: (serial) =>
                    _open('$_webApp/certificates/$serial'),
                onOpenCourse: (slug) =>
                    Navigator.pushNamed(context, '/courses/$slug'),
              ),
              SectionHead(
                title: 'Your certificates',
                subtitle: _rows == null ? null : '${_rows!.length} issued',
              ),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (!_signedIn)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _Panel(
                    icon: Icons.lock_outline,
                    title: 'Sign in to see your certificates',
                    body:
                        'Every certificate is tied to your account, so it follows you across web, app and Telegram.',
                    primaryLabel: 'Sign in',
                    onPrimary: () async {
                      await Navigator.pushNamed(context, '/auth');
                      if (mounted) _load();
                    },
                  ),
                )
              else if (_failed)
                LoadError(
                  message: 'Your certificates did not load.',
                  onRetry: _load,
                )
              else if ((_rows ?? const []).isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _Panel(
                    icon: Icons.workspace_premium_outlined,
                    title: 'No certificates yet',
                    body:
                        'Open a course, mark every lesson or module complete, then issue the certificate from the course page.',
                    primaryLabel: 'Find a course',
                    onPrimary: () => Navigator.pushNamed(context, '/browse'),
                  ),
                )
              else
                for (final row in _rows!)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: _CertificateCard(
                      row: row,
                      onDownload: () =>
                          _downloadPdf(row['serial'] as String? ?? ''),
                      onCopy: () => _copyVerify(row['serial'] as String? ?? ''),
                      onOpenCourse: () => Navigator.pushNamed(
                          context, '/courses/${row['courseSlug']}'),
                    ),
                  ),
              const SizedBox(height: 8),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Anyone can check a serial on the public verification page. The PDF carries the same number, so a copy can be matched against this record.',
                  style: TextStyle(
                      fontSize: 11, height: 1.7, color: AppColors.dim),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VerifyPanel extends StatelessWidget {
  const _VerifyPanel({
    required this.controller,
    required this.busy,
    required this.notFound,
    required this.result,
    required this.onVerify,
    required this.onDownload,
    required this.onCopy,
    required this.onOpenPublic,
    required this.onOpenCourse,
  });

  final TextEditingController controller;
  final bool busy, notFound;
  final Map<String, dynamic>? result;
  final void Function([String? serial]) onVerify;
  final ValueChanged<String> onDownload, onCopy, onOpenPublic, onOpenCourse;

  @override
  Widget build(BuildContext context) {
    final data = result;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.verified_user_outlined,
                    size: 17, color: AppColors.accent),
                SizedBox(width: 7),
                Text('Verify a certificate',
                    style:
                        TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Type the serial printed on the PDF to see the public record.',
              style: TextStyle(fontSize: 11.5, color: AppColors.dim),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: controller,
                    textCapitalization: TextCapitalization.characters,
                    decoration:
                        const InputDecoration(hintText: 'SYN-XXXX-XXXX'),
                    onSubmitted: (_) => onVerify(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: busy ? null : () => onVerify(),
                  child: Text(busy ? 'Checking…' : 'Check'),
                ),
              ],
            ),
            if (notFound) ...[
              const SizedBox(height: 12),
              const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.gpp_bad_outlined,
                      size: 15, color: AppColors.danger),
                  SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      'No certificate matches that number. Check the serial on the PDF — certificates exist only after a course is finished.',
                      style: TextStyle(
                          fontSize: 11.5, height: 1.5, color: AppColors.danger),
                    ),
                  ),
                ],
              ),
            ],
            if (data != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  border: Border.all(
                      color: AppColors.accent.withValues(alpha: .45)),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.check_circle,
                            size: 15, color: AppColors.success),
                        SizedBox(width: 6),
                        Text('Valid certificate',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: AppColors.success)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${data['learnerName'] ?? ''} completed every '
                      '${data['unitLabel'] ?? 'lesson'} in '
                      '${data['courseTitle'] ?? ''}.',
                      style: const TextStyle(
                          fontSize: 12.5, height: 1.55, color: AppColors.ink2),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Issued ${_date(data['issuedAt'] as String?)} · ${data['serial'] ?? ''}',
                      style:
                          const TextStyle(fontSize: 10.5, color: AppColors.dim),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        FilledButton.icon(
                          onPressed: () => onDownload('${data['serial']}'),
                          icon: const Icon(Icons.download, size: 14),
                          label: const Text('Download PDF'),
                        ),
                        OutlinedButton(
                          onPressed: () => onCopy('${data['serial']}'),
                          child: const Text('Copy link'),
                        ),
                        OutlinedButton(
                          onPressed: () => onOpenPublic('${data['serial']}'),
                          child: const Text('Public page'),
                        ),
                        if (data['courseSlug'] != null)
                          OutlinedButton(
                            onPressed: () =>
                                onOpenCourse('${data['courseSlug']}'),
                            child: const Text('View course'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _CertificateCard extends StatelessWidget {
  const _CertificateCard({
    required this.row,
    required this.onDownload,
    required this.onCopy,
    required this.onOpenCourse,
  });

  final Map<String, dynamic> row;
  final VoidCallback onDownload, onCopy, onOpenCourse;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CoverPlate(
                seed: row['courseSlug'] as String? ?? '',
                imageUrl: row['thumbnailUrl'] as String?,
                width: 64,
                height: 64,
                radius: 10,
                glyph: '🎓',
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('CERTIFICATE OF COMPLETION',
                        style: const TextStyle(
                            fontSize: 8.5,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1,
                            color: AppColors.accent)),
                    const SizedBox(height: 4),
                    Text(row['courseTitle'] as String? ?? '',
                        style: const TextStyle(
                            fontSize: 15,
                            height: 1.25,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text)),
                    const SizedBox(height: 4),
                    Text(
                      'Issued ${_date(row['issuedAt'] as String?)}',
                      style:
                          const TextStyle(fontSize: 10.5, color: AppColors.dim),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: AppColors.surfaceSunk,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Text(
              row['serial'] as String? ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 12,
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink2),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: onDownload,
                icon: const Icon(Icons.download, size: 14),
                label: const Text('PDF'),
              ),
              OutlinedButton(
                onPressed: onCopy,
                child: const Text('Copy link'),
              ),
              TextButton(
                onPressed: onOpenCourse,
                child: const Text('Course'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.icon,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
  });

  final IconData icon;
  final String title, body, primaryLabel;
  final VoidCallback onPrimary;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, size: 28, color: AppColors.accent),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                  color: AppColors.text)),
          const SizedBox(height: 7),
          Text(body,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 12, height: 1.55, color: AppColors.dim)),
          const SizedBox(height: 16),
          FilledButton(onPressed: onPrimary, child: Text(primaryLabel)),
        ],
      ),
    );
  }
}
