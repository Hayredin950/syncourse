import 'package:flutter/material.dart';

import '../offline.dart';
import '../theme.dart';
import 'offline_player_screen.dart';

class OfflineScreen extends StatefulWidget {
  const OfflineScreen({super.key});

  @override
  State<OfflineScreen> createState() => _OfflineScreenState();
}

class _OfflineScreenState extends State<OfflineScreen> {
  late Future<List<OfflineCourse>> _courses;
  int _storage = 0;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() {
    _courses = OfflineStore.courses();
    OfflineStore.storageBytes().then((b) {
      if (mounted) setState(() => _storage = b);
    });
    setState(() {});
  }

  String _size(int bytes) {
    if (bytes >= 1024 * 1024 * 1024)
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
    if (bytes >= 1024 * 1024)
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    return '${(bytes / 1024).toStringAsFixed(0)} KB';
  }

  Future<void> _remove(OfflineCourse c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Remove ${c.title}?'),
        content: const Text(
            'The downloaded files will be deleted from this device. You can download the course again at any time.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Remove')),
        ],
      ),
    );
    if (ok == true) {
      await OfflineStore.remove(c.slug);
      if (!mounted) return;
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Offline library')),
      body: FutureBuilder<List<OfflineCourse>>(
        future: _courses,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final courses = snapshot.data ?? const <OfflineCourse>[];
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: [
                    const Icon(Icons.sd_storage_outlined,
                        color: AppColors.accent),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${_size(_storage)} used · ${courses.length} ${courses.length == 1 ? "course" : "courses"}',
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Files are stored on this phone and keep working without a signal. They are removed '
                'automatically when your Premium pass ends.',
                style: TextStyle(
                    fontSize: 12, color: AppColors.muted, height: 1.5),
              ),
              const SizedBox(height: 16),
              if (courses.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Column(
                    children: [
                      const Icon(Icons.download_for_offline_outlined,
                          size: 56, color: AppColors.muted),
                      const SizedBox(height: 12),
                      const Text('Nothing downloaded yet',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      const Text(
                        'Open a course and tap "Download for offline" to keep it on this device.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 13, color: AppColors.muted, height: 1.5),
                      ),
                    ],
                  ),
                ),
              for (final c in courses)
                Card(
                  color: AppColors.surface,
                  elevation: 0,
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ExpansionTile(
                    shape: const Border(),
                    leading: const Icon(Icons.offline_pin_outlined,
                        color: AppColors.accent),
                    title: Text(c.title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 15)),
                    subtitle: Text(
                      '${c.lessons.length} lessons · ${_size(c.bytes)} · until ${_date(c.expiresAt)}',
                      style:
                          const TextStyle(fontSize: 11, color: AppColors.muted),
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, size: 20),
                      onPressed: () => _remove(c),
                    ),
                    children: [
                      for (final l in c.lessons)
                        ListTile(
                          dense: true,
                          leading: Icon(
                            l.videoPath != null
                                ? Icons.play_circle_outline
                                : Icons.description_outlined,
                            size: 20,
                          ),
                          title: Text(l.title,
                              style: const TextStyle(fontSize: 13)),
                          subtitle: Text(
                            [
                              if (l.sectionTitle.isNotEmpty) l.sectionTitle,
                              if (l.files.isNotEmpty) '${l.files.length} files'
                            ].join(' · '),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.muted),
                          ),
                          onTap: l.videoPath == null
                              ? null
                              : () => Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => OfflinePlayerScreen(
                                        title: l.title,
                                        path: l.videoPath,
                                      ),
                                    ),
                                  ),
                        ),
                      const SizedBox(height: 6),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  String _date(DateTime d) => '${d.day}/${d.month}/${d.year}';
}
