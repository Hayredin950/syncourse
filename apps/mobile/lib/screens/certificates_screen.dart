import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';

const _webBase = String.fromEnvironment('WEB_URL',
    defaultValue: 'https://syncourse-web.vercel.app');

/// The certificates this account has earned. Opening one goes to the public
/// verification page, which also serves the PDF.
class CertificatesScreen extends StatefulWidget {
  const CertificatesScreen({super.key});

  @override
  State<CertificatesScreen> createState() => _CertificatesScreenState();
}

class _CertificatesScreenState extends State<CertificatesScreen> {
  late Future<List<Map<String, dynamic>>> _rows;

  @override
  void initState() {
    super.initState();
    _rows = Api.myCertificates();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Certificates')),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _rows,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('${snapshot.error}'));
          }
          final rows = snapshot.data ?? const [];
          if (rows.isEmpty) {
            return const Padding(
              padding: EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.workspace_premium_outlined,
                      size: 56, color: AppColors.muted),
                  SizedBox(height: 12),
                  Text('No certificates yet',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  SizedBox(height: 6),
                  Text(
                    'Mark every lesson in a course complete, then issue the certificate from the '
                    'course page. Issuing is part of Premium.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 13, color: AppColors.muted, height: 1.5),
                  ),
                ],
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Certificates record that you marked every lesson complete. They are not exams or accreditation.',
                style: TextStyle(
                    fontSize: 12, color: AppColors.muted, height: 1.5),
              ),
              const SizedBox(height: 14),
              for (final r in rows)
                Card(
                  color: AppColors.surface,
                  elevation: 0,
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    leading: const Icon(Icons.workspace_premium,
                        color: AppColors.accent),
                    title: Text((r['courseTitle'] as String?) ?? 'Course',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    subtitle: Text(
                      '${r['serial']} · ${_date(r['issuedAt'])}',
                      style:
                          const TextStyle(fontSize: 11, color: AppColors.muted),
                    ),
                    trailing: const Icon(Icons.open_in_new, size: 18),
                    onTap: () async {
                      final serial = r['serial'] as String?;
                      if (serial == null) return;
                      final uri = Uri.parse('$_webBase/certificates/$serial');
                      await launchUrl(uri,
                          mode: LaunchMode.externalApplication);
                    },
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  String _date(dynamic raw) {
    final d = DateTime.tryParse('$raw');
    if (d == null) return '';
    return '${d.day}/${d.month}/${d.year}';
  }
}
