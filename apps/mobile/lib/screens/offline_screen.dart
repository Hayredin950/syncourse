import 'package:flutter/material.dart';

import '../offline.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'offline_player_screen.dart';

/// `/offline` — the device's downloaded shelf. Only app-hosted lessons can be
/// stored; Telegram archive courses are delivered by the bot and stay there, so
/// the empty state says that plainly instead of implying a missing feature.
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
    if (bytes >= 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
    }
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / 1024).toStringAsFixed(0)} KB';
  }

  Future<void> _remove(OfflineCourse c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('Remove ${c.title}?'),
        content: const Text(
          'The downloaded files will be deleted from this device. You can '
          'download the course again at any time.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
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
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<List<OfflineCourse>>(
          future: _courses,
          builder: (context, snapshot) {
            final courses = snapshot.data ?? const <OfflineCourse>[];
            final loading = snapshot.connectionState != ConnectionState.done;
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              color: AppColors.accent,
              backgroundColor: AppColors.surface,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 40),
                children: [
                  SyncourseHeader(
                    title: 'Offline',
                    showBack: Navigator.canPop(context),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 2, 16, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'ON THIS DEVICE',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                            color: AppColors.accent,
                          ),
                        ),
                        SizedBox(height: 5),
                        Text(
                          'Your offline shelf.',
                          style: TextStyle(
                            fontSize: 30,
                            height: 1.08,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1.1,
                            color: AppColors.text,
                          ),
                        ),
                        SizedBox(height: 8),
                        Text(
                          'Lessons hosted by Syncourse can be stored on this '
                          'phone and keep working without a signal. Telegram '
                          'archive courses are delivered by the bot and are not '
                          'saved here.',
                          style: TextStyle(
                            fontSize: 12.5,
                            height: 1.6,
                            color: AppColors.dim,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Container(
                      padding: const EdgeInsets.all(15),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.sd_storage_outlined,
                              size: 20, color: AppColors.accent),
                          const SizedBox(width: 11),
                          Expanded(
                            child: Text(
                              loading
                                  ? 'Measuring this device…'
                                  : '${_size(_storage)} used · '
                                      '${courses.length} '
                                      '${courses.length == 1 ? 'course' : 'courses'}',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.text,
                              ),
                            ),
                          ),
                          Text(
                            'PREMIUM',
                            style: TextStyle(
                              fontSize: 8.5,
                              fontWeight: FontWeight.w800,
                              letterSpacing: .6,
                              color: AppColors.accent.withValues(alpha: .9),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  const SectionHead(title: 'Downloaded courses'),
                  if (loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (courses.isEmpty)
                    SizedBox(
                      height: 300,
                      child: StatusView(
                        icon: Icons.download_for_offline_outlined,
                        title: 'Nothing downloaded yet',
                        message:
                            'Open a course with app-hosted lessons and tap '
                            '“Download for offline”. Archive courses are sent '
                            'by @syncourse_bot in Telegram instead.',
                        actionLabel: 'Browse courses',
                        onAction: () => Navigator.pushNamed(context, '/browse'),
                      ),
                    )
                  else
                    for (final c in courses)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                        child: _CourseCard(
                          course: c,
                          size: _size(c.bytes),
                          date: _date(c.expiresAt),
                          onRemove: () => _remove(c),
                          onPlay: (l) => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => OfflinePlayerScreen(
                                title: l.title,
                                path: l.videoPath,
                              ),
                            ),
                          ),
                        ),
                      ),
                  const SizedBox(height: 6),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16),
                    child: Text(
                      'Downloads follow your Premium pass. When it lapses, the '
                      'files are removed on the next open — re-download them '
                      'after renewing.',
                      style: TextStyle(
                        fontSize: 10.5,
                        height: 1.6,
                        color: AppColors.dim,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  String _date(DateTime d) => '${d.day}/${d.month}/${d.year}';
}

class _CourseCard extends StatelessWidget {
  const _CourseCard({
    required this.course,
    required this.size,
    required this.date,
    required this.onRemove,
    required this.onPlay,
  });

  final OfflineCourse course;
  final String size;
  final String date;
  final VoidCallback onRemove;
  final ValueChanged<OfflineLesson> onPlay;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(15),
      ),
      clipBehavior: Clip.antiAlias,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.fromLTRB(14, 4, 8, 4),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 8),
          iconColor: AppColors.accent,
          collapsedIconColor: AppColors.dim,
          leading: Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.accentSoft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.offline_pin_outlined,
                size: 18, color: AppColors.accent),
          ),
          title: Text(
            course.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${course.lessons.length} '
              '${course.lessons.length == 1 ? 'lesson' : 'lessons'} · '
              '$size · until $date',
              style: const TextStyle(fontSize: 10.5, color: AppColors.dim),
            ),
          ),
          trailing: IconButton(
            tooltip: 'Remove download',
            icon: const Icon(Icons.delete_outline,
                size: 19, color: AppColors.dim),
            onPressed: onRemove,
          ),
          children: [
            for (final l in course.lessons)
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: l.videoPath == null ? null : () => onPlay(l),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    children: [
                      Icon(
                        l.videoPath != null
                            ? Icons.play_circle_outline
                            : Icons.description_outlined,
                        size: 18,
                        color: l.videoPath != null
                            ? AppColors.accent
                            : AppColors.dim,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12.5,
                                color: AppColors.ink2,
                              ),
                            ),
                            Text(
                              [
                                if (l.sectionTitle.isNotEmpty) l.sectionTitle,
                                if (l.files.isNotEmpty)
                                  '${l.files.length} '
                                      '${l.files.length == 1 ? 'file' : 'files'}',
                                if (l.videoPath == null) 'notes only',
                              ].join(' · '),
                              style: const TextStyle(
                                fontSize: 10,
                                color: AppColors.dim,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
