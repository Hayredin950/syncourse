import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../offline.dart';
import '../theme.dart';

const _webBase = String.fromEnvironment('WEB_URL',
    defaultValue: 'https://syncourse-web.vercel.app');

class CourseDetailScreen extends StatefulWidget {
  const CourseDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  late Future<CourseDetail> _detail;
  bool _expanded = false;
  Map<String, dynamic>? _progress;
  bool _markingUnit = false;

  @override
  void initState() {
    super.initState();
    _detail = Api.courseDetail(widget.slug);
    _loadProgress();
  }

  Future<void> _loadProgress() async {
    try {
      final p = await Api.courseProgress(widget.slug);
      if (mounted) setState(() => _progress = p);
    } catch (_) {
      // A signed-out reader still gets zeroed progress from the public route;
      // any other failure must not hide the course itself.
    }
  }

  Future<void> _toggleUnit(String unitId, bool done) async {
    final token = await Api.loadToken();
    if (!mounted) return;
    if (token == null) {
      Navigator.pushNamed(context, '/auth');
      return;
    }
    setState(() => _markingUnit = true);
    try {
      final p = await Api.setCourseUnitProgress(widget.slug, unitId, !done);
      if (mounted) setState(() => _progress = p);
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Could not save your progress')));
      }
    } finally {
      if (mounted) setState(() => _markingUnit = false);
    }
  }

  Future<void> _issueCertificate() async {
    try {
      final r = await Api.issueCertificate(widget.slug);
      final serial = r['serial'] as String?;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Certificate issued · ${serial ?? ''}')));
      await _loadProgress();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not issue the certificate')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<CourseDetail>(
        future: _detail,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final c = snapshot.data!;
          final hasLessons = c.sections.any((s) => s.lessons.isNotEmpty);
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                expandedHeight: 220,
                flexibleSpace: FlexibleSpaceBar(
                  background: c.bannerUrl == null && c.thumbnailUrl == null
                      ? Container(
                          color: AppColors.surface,
                          alignment: Alignment.center,
                          child: const Icon(Icons.play_circle_outline,
                              size: 64, color: AppColors.muted))
                      : Image.network(c.bannerUrl ?? c.thumbnailUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              Container(color: AppColors.surface)),
                ),
                actions: [
                  IconButton(
                    tooltip: 'Offline library',
                    icon: const Icon(Icons.download_done_outlined),
                    onPressed: () => Navigator.pushNamed(context, '/offline'),
                  ),
                  IconButton(
                      icon: const Icon(Icons.share_outlined), onPressed: () {}),
                ],
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.title,
                          style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.5)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 16, color: Colors.amber),
                          const SizedBox(width: 4),
                          Text('${c.ratingAvg.toStringAsFixed(1)}',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                          Text(' (${c.ratingCount} ratings)',
                              style: const TextStyle(
                                  color: AppColors.muted, fontSize: 13)),
                          const Spacer(),
                          Text(c.durationText,
                              style: const TextStyle(
                                  color: AppColors.muted, fontSize: 13)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                          '${c.level} · ${c.language} · ${c.enrollmentCount} enrolled',
                          style: const TextStyle(
                              color: AppColors.muted, fontSize: 13)),
                      if (c.isPremium) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text('PREMIUM',
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.accent)),
                        ),
                      ],
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final tag in c.tags)
                            Chip(
                              label: Text(tag),
                              visualDensity: VisualDensity.compact,
                              backgroundColor: AppColors.surface,
                              side: BorderSide.none,
                            ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      _description(c),
                      if (c.prerequisites != null &&
                          c.prerequisites!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text('Prerequisites: ${c.prerequisites}',
                            style: const TextStyle(
                                fontSize: 13, color: AppColors.muted)),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () => _openFirstLesson(c),
                              icon: Icon(hasLessons
                                  ? Icons.play_arrow
                                  : Icons.send_outlined),
                              label: Text(hasLessons
                                  ? 'Enroll & start'
                                  : 'Get it in Telegram'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          IconButton.filledTonal(
                            onPressed: () => _toggleSave(c),
                            icon: const Icon(Icons.bookmark_border),
                          ),
                          IconButton.filledTonal(
                            onPressed: () => _toggleLike(c),
                            icon: const Icon(Icons.favorite_border),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: () => _downloadOffline(c, hasLessons),
                        icon: const Icon(Icons.download_for_offline_outlined),
                        label: const Text('Download for offline'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(44),
                          foregroundColor: AppColors.accent,
                        ),
                      ),
                      if (_progress != null &&
                          ((_progress!['total'] as num?)?.toInt() ?? 0) >
                              0) ...[
                        const SizedBox(height: 16),
                        _ProgressCard(
                          progress: _progress!,
                          marking: _markingUnit,
                          onToggle: _toggleUnit,
                          onIssue: _issueCertificate,
                        ),
                      ],
                      if (c.downloads != null) ...[
                        const SizedBox(height: 16),
                        _DownloadsWidget(downloads: c.downloads!),
                      ],
                      const SizedBox(height: 20),
                      if (c.lecturer != null) ...[
                        Text('Lecturer', style: _sectionStyle),
                        const SizedBox(height: 8),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(
                              radius: 22,
                              child: Text(c.lecturer!.name.characters.first)),
                          title: Text(c.lecturer!.name,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(
                            [c.lecturer!.credentials, c.lecturer!.bio]
                                .whereType<String>()
                                .join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(height: 8),
                      ],
                      if (c.organization != null) ...[
                        Text('Organization', style: _sectionStyle),
                        const SizedBox(height: 4),
                        Text(c.organization!['name'] as String? ?? '',
                            style: const TextStyle(
                                fontSize: 14, color: AppColors.muted)),
                        const SizedBox(height: 12),
                      ],
                      if (hasLessons) ...[
                        Text('Curriculum', style: _sectionStyle),
                        const SizedBox(height: 8),
                        for (final s in c.sections)
                          _SectionCard(section: s, slug: c.slug),
                      ] else ...[
                        Text('Delivery', style: _sectionStyle),
                        const SizedBox(height: 8),
                        const Text(
                          'This course is a Telegram archive. The files are sent to your chat by the '
                          'bot; tick each module above as you finish it.',
                          style: TextStyle(
                              fontSize: 13,
                              color: AppColors.muted,
                              height: 1.5),
                        ),
                      ],
                      const SizedBox(height: 20),
                      Text('Reviews', style: _sectionStyle),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text('${c.reviewAvg.toStringAsFixed(1)}',
                              style: const TextStyle(
                                  fontSize: 32, fontWeight: FontWeight.w800)),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _Stars(value: c.reviewAvg),
                              Text('${c.reviewCount} reviews',
                                  style: const TextStyle(
                                      color: AppColors.muted, fontSize: 12)),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      for (final r in c.reviews) _ReviewCard(review: r),
                      if (c.reviews.isEmpty)
                        const Text(
                            'No reviews yet — be the first to rate this course',
                            style: TextStyle(
                                color: AppColors.muted, fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  TextStyle get _sectionStyle =>
      const TextStyle(fontSize: 17, fontWeight: FontWeight.w700);

  Widget _description(CourseDetail c) {
    final desc = c.description;
    if (desc.isEmpty) return const SizedBox.shrink();
    final showToggle = desc.length > 200;
    final text =
        (showToggle && !_expanded) ? '${desc.substring(0, 200)}…' : desc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text,
            style: const TextStyle(
                fontSize: 14, height: 1.4, color: Colors.white70)),
        if (showToggle)
          TextButton(
            onPressed: () => setState(() => _expanded = !_expanded),
            child: Text(_expanded ? 'Show less' : 'Read more'),
          ),
      ],
    );
  }

  Future<void> _openFirstLesson(CourseDetail c) async {
    LessonLite? first;
    for (final s in c.sections) {
      if (s.lessons.isNotEmpty) {
        first = s.lessons.first;
        break;
      }
    }
    if (first == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'This course is delivered in Telegram — the files arrive in your chat.'),
        ),
      );
      return;
    }
    if (!mounted) return;
    Navigator.pushNamed(context, '/courses/${c.slug}/lessons/${first.id}');
  }

  Future<void> _toggleSave(CourseDetail c) async {
    await Api.toggleSave(c.slug);
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Saved list updated')));
    }
  }

  Future<void> _toggleLike(CourseDetail c) async {
    await Api.toggleLike(c.slug);
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Liked')));
    }
  }

  /// The whole-course download. Progress is per file, and a failure says which
  /// side said no (usually "Premium features" from the manifest endpoint).
  Future<void> _downloadOffline(CourseDetail c, bool hasLessons) async {
    if (!hasLessons) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'This course is delivered in Telegram. Open it from your chat to download the files — '
            'offline downloads work for courses with app-hosted lessons.',
          ),
        ),
      );
      return;
    }
    var progress = 0.0;
    var label = 'Preparing…';
    if (!mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) {
          _offlineProgress = (p, l) {
            if (!ctx.mounted) return;
            setLocal(() {
              progress = p;
              label = l;
            });
          };
          return AlertDialog(
            backgroundColor: AppColors.surface,
            title: const Text('Downloading for offline'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                LinearProgressIndicator(value: progress == 0 ? null : progress),
                const SizedBox(height: 10),
                Text(
                  progress == 0
                      ? 'Preparing…'
                      : '${(progress * 100).toStringAsFixed(0)}% · $label',
                  style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          );
        },
      ),
    );

    try {
      await Future<void>.delayed(const Duration(milliseconds: 80));
      await OfflineStore.download(
        c.slug,
        onProgress: (p, l) => _offlineProgress?.call(p, l),
      );
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${c.title} is ready offline')),
      );
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      _offlineProgress = null;
    }
  }

  void Function(double, String)? _offlineProgress;
}

class _DownloadsWidget extends StatelessWidget {
  const _DownloadsWidget({required this.downloads});

  final Map<String, dynamic> downloads;

  @override
  Widget build(BuildContext context) {
    final total = downloads['total'] ?? 0;
    final last30 = downloads['last30'] ?? 0;
    final last7 = downloads['last7'] ?? 0;
    final today = downloads['today'] ?? 0;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('DOWNLOADS ON SYNCOURSE',
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.muted)),
          const SizedBox(height: 6),
          Text(
              '$total total · $last30 last 30 days · $last7 last 7 days · $today today',
              style: const TextStyle(fontSize: 12, color: Colors.white70)),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.section, required this.slug});

  final Section section;
  final String slug;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.surface,
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      child: ExpansionTile(
        shape: const Border(),
        title: Text(section.title,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(
            '${section.lessons.length} lessons · ${section.durationText}',
            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        children: [
          for (final l in section.lessons)
            ListTile(
              dense: true,
              leading: Icon(
                  l.type == 'video'
                      ? Icons.play_circle_outline
                      : Icons.description_outlined,
                  size: 20),
              title: Text(l.title, style: const TextStyle(fontSize: 13)),
              subtitle: Text(l.durationText,
                  style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              onTap: () => Navigator.pushNamed(
                  context, '/courses/$slug/lessons/${l.id}'),
            ),
        ],
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                  radius: 12, child: Text(review.userName.characters.first)),
              const SizedBox(width: 8),
              Expanded(
                  child: Text(review.userName,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 13))),
              if (review.isStaff)
                Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('EDITORIAL',
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: AppColors.accent)),
                ),
            ],
          ),
          if (review.body != null) ...[
            const SizedBox(height: 4),
            Text(review.body!,
                style: const TextStyle(fontSize: 13, color: Colors.white70)),
          ],
          const SizedBox(height: 4),
          Text('${review.replyCount} replies',
              style: const TextStyle(fontSize: 11, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _Stars extends StatelessWidget {
  const _Stars({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        final filled = i < value.round();
        return Icon(filled ? Icons.star : Icons.star_border,
            size: 14, color: Colors.amber);
      }),
    );
  }
}

/// Progress and the certificate for the current course. Archive courses list
/// their Telegram files here so they can be ticked off like lessons.
class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.progress,
    required this.marking,
    required this.onToggle,
    required this.onIssue,
  });

  final Map<String, dynamic> progress;
  final bool marking;
  final Future<void> Function(String unitId, bool done) onToggle;
  final Future<void> Function() onIssue;

  @override
  Widget build(BuildContext context) {
    final total = (progress['total'] as num?)?.toInt() ?? 0;
    final completed = (progress['completed'] as num?)?.toInt() ?? 0;
    final pct = (progress['pct'] as num?)?.toDouble() ?? 0;
    final unitType = progress['unitType'] as String? ?? 'none';
    final unitLabel = progress['unitLabel'] as String? ?? 'lesson';
    final units = (progress['units'] as List?) ?? [];
    final cert = progress['certificate'] as Map?;
    final premium = progress['premiumActive'] == true;
    final unitWord = unitLabel == 'module' ? 'modules' : 'lessons';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('Your progress',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const Spacer(),
              Text('$completed/$total $unitWord',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: pct / 100,
              minHeight: 6,
              backgroundColor: AppColors.surface.withValues(alpha: 0.6),
              color: AppColors.accent,
            ),
          ),
          if (unitType == 'file') ...[
            const SizedBox(height: 8),
            for (final raw in units) _unitRow(raw as Map<String, dynamic>),
          ],
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          if (cert != null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Certificate ${cert['serial'] ?? ''}',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
                TextButton(
                  onPressed: () => launchUrl(
                    Uri.parse('$_webBase/certificates/${cert['serial']}'),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: const Text('View'),
                ),
              ],
            )
          else if (total > 0 && completed == total)
            premium
                ? Row(
                    children: [
                      Expanded(
                        child: Text('Every $unitLabel is done.',
                            style: const TextStyle(fontSize: 12)),
                      ),
                      FilledButton(
                        onPressed: () => onIssue(),
                        child: const Text('Get certificate'),
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Every $unitLabel is done. Certificates are part of Premium.',
                        style: const TextStyle(fontSize: 12),
                      ),
                      TextButton(
                        style: TextButton.styleFrom(padding: EdgeInsets.zero),
                        onPressed: () =>
                            Navigator.pushNamed(context, '/premium'),
                        child: const Text('Unlock certificates'),
                      ),
                    ],
                  )
          else
            const Text(
              'Mark every unit complete to earn a certificate. Tracking is free; issuing it is part of Premium.',
              style:
                  TextStyle(fontSize: 11, color: AppColors.muted, height: 1.5),
            ),
        ],
      ),
    );
  }

  Widget _unitRow(Map<String, dynamic> u) {
    final done = u['completed'] == true;
    final title = (u['title'] as String?) ?? 'Module';
    final section = (u['sectionTitle'] as String?) ?? '';
    final size = (u['sizeMb'] as num?)?.toDouble();
    final sub = [
      if (section.isNotEmpty) section,
      if (size != null) '${size.toStringAsFixed(1)} MB',
      done ? 'Completed' : 'Tap when done',
    ].join(' · ');
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: marking ? null : () => onToggle(u['id'] as String, done),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(
              done ? Icons.check_circle : Icons.radio_button_unchecked,
              size: 20,
              color: done ? AppColors.accent : AppColors.muted,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13)),
                  Text(sub,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.muted)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 16, color: AppColors.muted),
          ],
        ),
      ),
    );
  }
}
