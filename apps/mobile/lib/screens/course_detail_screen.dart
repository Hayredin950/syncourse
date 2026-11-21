import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../offline.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _webApp = 'https://syncourse.pages.dev';
const _bot = 'https://t.me/syncourse_bot';

String _botLink(String payload) => '$_bot?start=$payload';

String _compact(int n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}m';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(n >= 10000 ? 0 : 1)}k';
  return '$n';
}

String _bytesLabel(double? mb) {
  if (mb == null) return 'Telegram attachment';
  if (mb >= 1024) return '${(mb / 1024).toStringAsFixed(1)} GB';
  return '${mb.toStringAsFixed(mb >= 10 ? 0 : 1)} MB';
}

class _Module {
  _Module(this.title);
  final String? title;
  final List<TelegramFile> files = [];
  double sizeMb = 0;
}

List<_Module> _groupFiles(List<TelegramFile> files) {
  final sorted = [...files]..sort((a, b) {
      final m = a.moduleOrder.compareTo(b.moduleOrder);
      return m != 0 ? m : a.partIndex.compareTo(b.partIndex);
    });
  final byKey = <String, _Module>{};
  final out = <_Module>[];
  for (final f in sorted) {
    final key = f.moduleTitle ?? '__ungrouped__';
    final g = byKey.putIfAbsent(key, () {
      final created = _Module(f.moduleTitle);
      out.add(created);
      return created;
    });
    g.files.add(f);
    g.sizeMb += f.fileSizeMb ?? 0;
  }
  return out;
}

class CourseDetailScreen extends StatefulWidget {
  const CourseDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  CourseDetail? _course;
  List<CourseSummary> _similar = const [];
  Map<String, dynamic>? _progress;
  bool _loading = true;
  bool _failed = false;
  bool _saved = false;
  bool _liked = false;
  int _likeCount = 0;
  int _myRating = 0;
  bool _markingUnit = false;
  bool _offlineBusy = false;
  String? _openSection;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final d = await Api.courseDetail(widget.slug);
      if (!mounted) return;
      setState(() {
        _course = d;
        _saved = d.saved;
        _liked = d.liked;
        _likeCount = d.likeCount;
        _myRating = d.myRating;
        _openSection = d.sections.where((s) => s.lessons.isNotEmpty).isNotEmpty
            ? d.sections.firstWhere((s) => s.lessons.isNotEmpty).id
            : null;
        _loading = false;
      });
      _loadSidePanels();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  Future<void> _loadSidePanels() async {
    try {
      final p = await Api.courseProgress(widget.slug);
      if (mounted) setState(() => _progress = p);
    } catch (_) {
      // Signed-out readers get zeroed progress from the public route.
    }
    try {
      final rows = await Api.similar(widget.slug, limit: 8);
      if (mounted) {
        setState(
            () => _similar = rows.where((c) => c.id != _course?.id).toList());
      }
    } catch (_) {
      // A short rail is better than a mislabelled one.
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<bool> _requireAuth() async {
    if (await Api.loadToken() != null) return true;
    if (!mounted) return false;
    await Navigator.pushNamed(context, '/auth');
    return mounted && await Api.loadToken() != null;
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) _toast('Could not open $url');
  }

  Future<void> _share() async {
    final c = _course;
    if (c == null) return;
    await Clipboard.setData(ClipboardData(text: '$_webApp/courses/${c.slug}'));
    _toast('Course link copied');
  }

  Future<void> _toggleSave() async {
    if (!await _requireAuth()) return;
    try {
      await Api.toggleSave(widget.slug);
      if (!mounted) return;
      setState(() => _saved = !_saved);
      _toast(_saved ? 'Saved to your library' : 'Removed from saved');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _toggleLike() async {
    if (!await _requireAuth()) return;
    try {
      await Api.toggleLike(widget.slug);
      if (!mounted) return;
      setState(() {
        _liked = !_liked;
        _likeCount += _liked ? 1 : -1;
      });
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _rate(int stars) async {
    final c = _course;
    if (c == null) return;
    if (!await _requireAuth()) return;
    try {
      await Api.rateCourse(c.id, stars);
      if (!mounted) return;
      setState(() => _myRating = stars);
      _toast('Rated $stars star${stars == 1 ? '' : 's'}');
      await _load();
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _addToList() async {
    final c = _course;
    if (c == null) return;
    if (!await _requireAuth()) return;
    try {
      final lists = await Api.myLists();
      if (!mounted) return;
      final chosen = await showModalBottomSheet<CourseCollection>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppColors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        builder: (context) => _ListPicker(lists: lists),
      );
      if (chosen == null) return;
      await Api.addListItems(chosen.id, [c.id]);
      _toast('Added to ${chosen.name}');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _toggleUnit(String unitId, bool done) async {
    if (!await _requireAuth()) return;
    setState(() => _markingUnit = true);
    try {
      final p = await Api.setCourseUnitProgress(widget.slug, unitId, !done);
      if (mounted) setState(() => _progress = p);
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('Could not save your progress');
    } finally {
      if (mounted) setState(() => _markingUnit = false);
    }
  }

  Future<void> _issueCertificate() async {
    try {
      final r = await Api.issueCertificate(widget.slug);
      final serial = r['serial'] as String?;
      _toast('Certificate issued${serial == null ? '' : ' · $serial'}');
      try {
        final p = await Api.courseProgress(widget.slug);
        if (mounted) setState(() => _progress = p);
      } catch (_) {}
    } on ApiException catch (e) {
      _toast(e.message);
    } catch (_) {
      _toast('Could not issue the certificate');
    }
  }

  LessonLite? _firstLesson(CourseDetail c) {
    for (final s in c.sections) {
      if (s.lessons.isNotEmpty) return s.lessons.first;
    }
    return null;
  }

  Future<void> _downloadOffline(CourseDetail c, bool hasLessons) async {
    if (!hasLessons) {
      await _openUrl(_botLink('dl_${c.slug}'));
      return;
    }
    if (!await _requireAuth()) return;
    var progress = 0.0;
    var label = 'Preparing…';
    if (!mounted) return;
    setState(() => _offlineBusy = true);
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
                  style: const TextStyle(fontSize: 12, color: AppColors.dim),
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
      _toast('${c.title} is ready offline');
    } catch (e) {
      if (!mounted) return;
      Navigator.of(context, rootNavigator: true).pop();
      _toast('$e');
    } finally {
      _offlineProgress = null;
      if (mounted) setState(() => _offlineBusy = false);
    }
  }

  void Function(double, String)? _offlineProgress;

  Future<void> _writeReview() async {
    final c = _course;
    if (c == null) return;
    if (!await _requireAuth()) return;
    final controller = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Write a review',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            const Text(
                'One review per course — you can edit it later on the web.',
                style: TextStyle(fontSize: 11.5, color: AppColors.dim)),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              maxLines: 5,
              autofocus: true,
              decoration: const InputDecoration(
                  hintText: 'What did this course help you do?'),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Post review'),
              ),
            ),
          ],
        ),
      ),
    );
    if (ok == true && controller.text.trim().isNotEmpty) {
      try {
        await Api.postReview(c.id, controller.text.trim());
        _toast('Review posted');
        await _load();
      } catch (e) {
        _toast('$e');
      }
    }
    controller.dispose();
  }

  Future<void> _upvote(Review r) async {
    if (!await _requireAuth()) return;
    try {
      await Api.upvoteReview(r.id);
      await _load();
    } catch (e) {
      _toast('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: SafeArea(
          bottom: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    final c = _course;
    if (_failed || c == null) {
      return Scaffold(
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              const SyncourseHeader(title: 'Course', showBack: true),
              Expanded(
                child: StatusView(
                  icon: Icons.search_off,
                  title: 'We can’t find that course',
                  message:
                      'It may have been unpublished, or the link may be out of date.',
                  actionLabel: 'Browse the catalogue',
                  onAction: () =>
                      Navigator.pushReplacementNamed(context, '/browse'),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final hasLessons = c.sections.any((s) => s.lessons.isNotEmpty);
    final first = _firstLesson(c);
    final curriculum = c.sections.where((s) => s.lessons.isNotEmpty).toList();
    final modules = _groupFiles(c.telegramFiles);
    final ratings = c.ratings ?? const <String, dynamic>{};
    final ratingAvg = (ratings['avg'] as num?)?.toDouble() ?? 0;
    final ratingCount = (ratings['count'] as num?)?.toInt() ?? 0;
    final distribution = ratings['distribution'] is Map
        ? Map<String, dynamic>.from(ratings['distribution'] as Map)
        : const <String, dynamic>{};
    final downloads = c.downloads;
    final totalDownloads = (downloads?['total'] as num?)?.toInt() ?? 0;

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
              const SyncourseHeader(title: 'Course', showBack: true),
              _Hero(
                course: c,
                firstLesson: first,
                hasLessons: hasLessons,
                saved: _saved,
                liked: _liked,
                likeCount: _likeCount,
                offlineBusy: _offlineBusy,
                onStart: first == null
                    ? null
                    : () => Navigator.pushNamed(
                        context, '/courses/${c.slug}/lessons/${first.id}'),
                onDownload: () => _downloadOffline(c, hasLessons),
                onAsk: () => Navigator.pushNamed(context, '/ask',
                    arguments: {'course': c.slug}),
                onSave: _toggleSave,
                onLike: _toggleLike,
                onList: _addToList,
                onShare: _share,
                previewUrl: c.previewVideoUrl,
                onPreview: c.previewVideoUrl == null
                    ? null
                    : () => _openUrl(c.previewVideoUrl!),
              ),
              const SizedBox(height: 18),
              _infoTable(c),
              if (_progress != null &&
                  ((_progress!['total'] as num?)?.toInt() ?? 0) > 0)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                  child: _ProgressCard(
                    progress: _progress!,
                    marking: _markingUnit,
                    slug: c.slug,
                    onToggle: _toggleUnit,
                    onIssue: _issueCertificate,
                    onToast: _toast,
                  ),
                ),
              if (curriculum.isNotEmpty) ...[
                const SectionHead(title: 'Curriculum'),
                for (var i = 0; i < curriculum.length; i++)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                    child: _CurriculumCard(
                      section: curriculum[i],
                      index: i + 1,
                      slug: c.slug,
                      open: _openSection == curriculum[i].id,
                      onToggle: () => setState(() => _openSection =
                          _openSection == curriculum[i].id
                              ? null
                              : curriculum[i].id),
                    ),
                  ),
              ],
              if (totalDownloads > 0) ...[
                const SectionHead(title: 'Downloads on Syncourse'),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _DownloadsPanel(downloads: downloads!),
                ),
              ],
              if (modules.isNotEmpty) ...[
                SectionHead(
                  title: 'Course files',
                  subtitle: 'Delivered by @syncourse_bot straight to Telegram',
                  trailing: TextButton.icon(
                    onPressed: () => _openUrl(_botLink('dl_${c.slug}')),
                    icon: const Icon(Icons.download, size: 14),
                    label: const Text('All'),
                  ),
                ),
                for (var i = 0; i < modules.length; i++)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: _FileModuleCard(
                      module: modules[i],
                      index: i + 1,
                      onOpen: _openUrl,
                      onToast: _toast,
                    ),
                  ),
              ],
              if (c.lecturers.isNotEmpty) ...[
                const SectionHead(title: 'Instructor'),
                for (final l in c.lecturers)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: _InstructorCard(
                      lecturer: l,
                      onTap: () =>
                          Navigator.pushNamed(context, '/lecturers/${l.slug}'),
                    ),
                  ),
              ] else if (c.lecturer != null) ...[
                const SectionHead(title: 'Instructor'),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  child: _InstructorCard(
                    lecturer: c.lecturer!,
                    onTap: () => Navigator.pushNamed(
                        context, '/lecturers/${c.lecturer!.slug}'),
                  ),
                ),
              ],
              if (c.organization != null) ...[
                const SectionHead(title: 'Published by'),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _PublisherCard(
                    organization: c.organization!,
                    onTap: () => Navigator.pushNamed(
                        context, '/organizations/${c.organization!['slug']}'),
                  ),
                ),
              ],
              const SizedBox(height: 22),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _RatingsPanel(
                  avg: ratingAvg,
                  count: ratingCount,
                  distribution: distribution,
                  myRating: _myRating,
                  onRate: _rate,
                ),
              ),
              SectionHead(
                title:
                    'Reviews · ${c.reviewTotal > 0 ? c.reviewTotal : c.reviews.length}',
                trailing: TextButton.icon(
                  onPressed: _writeReview,
                  icon: const Icon(Icons.rate_review_outlined, size: 14),
                  label: const Text('Write'),
                ),
              ),
              if (c.reviews.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    'No reviews yet — start the thread.',
                    style: TextStyle(fontSize: 12, color: AppColors.dim),
                  ),
                )
              else
                for (final r in c.reviews)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                    child: _ReviewCard(review: r, onUpvote: () => _upvote(r)),
                  ),
              if (_similar.isNotEmpty) ...[
                const SectionHead(title: 'More like this'),
                SizedBox(
                  height: 254,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: _similar.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 12),
                    itemBuilder: (_, i) => CoursePoster(course: _similar[i]),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoTable(CourseDetail c) {
    final rows = <({String label, Widget value})>[];
    if ((c.prerequisites ?? '').isNotEmpty) {
      rows.add((
        label: 'PREREQUISITES',
        value: Text(c.prerequisites!,
            style: const TextStyle(fontSize: 12.5, color: AppColors.ink3)),
      ));
    }
    if (c.audience.isNotEmpty) {
      rows.add((
        label: 'TARGET AUDIENCE',
        value: Text(c.audience.join(', '),
            style: const TextStyle(fontSize: 12.5, color: AppColors.ink3)),
      ));
    }
    rows.add((
      label: 'TAGS',
      value: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final t in c.tags)
            InkWell(
              onTap: () =>
                  Navigator.pushNamed(context, '/search', arguments: {'q': t}),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(t,
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.ink3)),
              ),
            ),
          if (c.tags.isEmpty)
            const Text('—',
                style: TextStyle(fontSize: 12.5, color: AppColors.dim)),
        ],
      ),
    ));
    rows.add((
      label: 'DETAILS',
      value: Text(
        [
          c.level,
          c.language,
          if (c.durationMin > 0) c.durationText,
          if (c.lessonCount > 0)
            '${c.lessonCount} lesson${c.lessonCount == 1 ? '' : 's'}',
          '${_compact(c.enrollmentCount)} learners',
        ].join(' · '),
        style: const TextStyle(fontSize: 12.5, color: AppColors.ink3),
      ),
    ));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0) const Divider(height: 1, color: AppColors.border),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 108,
                      child: Text(rows[i].label,
                          style: const TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: .8,
                              color: AppColors.dim)),
                    ),
                    Expanded(child: rows[i].value),
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

class _Hero extends StatelessWidget {
  const _Hero({
    required this.course,
    required this.firstLesson,
    required this.hasLessons,
    required this.saved,
    required this.liked,
    required this.likeCount,
    required this.offlineBusy,
    required this.onStart,
    required this.onDownload,
    required this.onAsk,
    required this.onSave,
    required this.onLike,
    required this.onList,
    required this.onShare,
    required this.onPreview,
    this.previewUrl,
  });

  final CourseDetail course;
  final LessonLite? firstLesson;
  final bool hasLessons, saved, liked, offlineBusy;
  final int likeCount;
  final VoidCallback? onStart, onPreview;
  final VoidCallback onDownload, onAsk, onSave, onLike, onList, onShare;
  final String? previewUrl;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
      child: Stack(
        children: [
          CoverPlate(
            seed: course.slug,
            imageUrl: course.bannerUrl ?? course.thumbnailUrl,
            height: 430,
            radius: 0,
            glyph: '🎓',
          ),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x33000000), Color(0xFA0E0E0D)],
                  stops: [.0, .78],
                ),
              ),
            ),
          ),
          Positioned(
            left: 18,
            right: 18,
            bottom: 16,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${course.categoryNames.isEmpty ? 'COURSE' : course.categoryNames.join(' · ').toUpperCase()} · ${course.level.toUpperCase()}',
                  style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.1,
                      color: AppColors.accent),
                ),
                const SizedBox(height: 7),
                Text(course.title,
                    style: const TextStyle(
                        fontSize: 31,
                        height: 1.04,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1.2,
                        color: Colors.white)),
                if (course.description.isNotEmpty) ...[
                  const SizedBox(height: 9),
                  Text(
                    course.description,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 12.5, height: 1.5, color: AppColors.ink3),
                  ),
                ],
                const SizedBox(height: 10),
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.star,
                            size: 13, color: AppColors.accent),
                        const SizedBox(width: 3),
                        Text(
                          course.ratingCount > 0
                              ? '${course.ratingAvg.toStringAsFixed(1)} · ${_compact(course.ratingCount)} ratings'
                              : 'Not yet rated',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.ink3),
                        ),
                      ],
                    ),
                    if (course.durationMin > 0)
                      Text(course.durationText,
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.ink3)),
                    if (course.lessonCount > 0)
                      Text(
                          '${course.lessonCount} lesson${course.lessonCount == 1 ? '' : 's'}',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.ink3)),
                    Text(course.language,
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.ink3)),
                    if (course.isPremium)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.accentSoft,
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: const Text('PREMIUM',
                            style: TextStyle(
                                fontSize: 8.5,
                                fontWeight: FontWeight.w800,
                                letterSpacing: .6,
                                color: AppColors.accent)),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    if (onStart != null)
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: onStart,
                          icon: const Icon(Icons.play_arrow, size: 18),
                          label: const Text('Start course'),
                        ),
                      )
                    else
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: onDownload,
                          icon: const Icon(Icons.download, size: 17),
                          label: const Text('Get it in Telegram'),
                        ),
                      ),
                    const SizedBox(width: 8),
                    if (hasLessons)
                      IconButton.filledTonal(
                        tooltip: 'Download for offline',
                        onPressed: offlineBusy ? null : onDownload,
                        icon: const Icon(Icons.download_for_offline_outlined,
                            size: 19),
                      ),
                    if (onPreview != null)
                      Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: IconButton.filledTonal(
                          tooltip: 'Preview',
                          onPressed: onPreview,
                          icon: const Icon(Icons.smart_display_outlined,
                              size: 19),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    _HeroChip(
                      icon: saved ? Icons.bookmark : Icons.bookmark_border,
                      label: 'Save',
                      active: saved,
                      onTap: onSave,
                    ),
                    _HeroChip(
                      icon: Icons.playlist_add,
                      label: 'List',
                      onTap: onList,
                    ),
                    _HeroChip(
                      icon: liked ? Icons.favorite : Icons.favorite_border,
                      label: likeCount > 0 ? 'Like $likeCount' : 'Like',
                      active: liked,
                      onTap: onLike,
                    ),
                    _HeroChip(
                      icon: Icons.auto_awesome,
                      label: 'Ask about this',
                      onTap: onAsk,
                    ),
                    _HeroChip(
                      icon: Icons.share_outlined,
                      label: 'Share',
                      onTap: onShare,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: .35),
          borderRadius: BorderRadius.circular(999),
          border:
              Border.all(color: active ? AppColors.accent : AppColors.hairline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 12, color: active ? AppColors.accent : AppColors.ink3),
            const SizedBox(width: 5),
            Text(label,
                style: TextStyle(
                    fontSize: 10.5,
                    color: active ? AppColors.accent : AppColors.ink3)),
          ],
        ),
      ),
    );
  }
}

class _CurriculumCard extends StatelessWidget {
  const _CurriculumCard({
    required this.section,
    required this.index,
    required this.slug,
    required this.open,
    required this.onToggle,
  });

  final Section section;
  final int index;
  final String slug;
  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          InkWell(
            onTap: onToggle,
            child: Padding(
              padding: const EdgeInsets.all(13),
              child: Row(
                children: [
                  Text('${index.toString().padLeft(2, '0')}',
                      style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .8,
                          color: AppColors.accent)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(section.title,
                        style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink1)),
                  ),
                  Text(
                      '${section.lessons.length} lesson${section.lessons.length == 1 ? '' : 's'}',
                      style: const TextStyle(
                          fontSize: 10.5, color: AppColors.dim)),
                  const SizedBox(width: 6),
                  Icon(open ? Icons.expand_less : Icons.expand_more,
                      size: 18, color: AppColors.dim),
                ],
              ),
            ),
          ),
          if (open)
            for (final l in section.lessons)
              InkWell(
                onTap: () => Navigator.pushNamed(
                    context, '/courses/$slug/lessons/${l.id}'),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(13, 10, 13, 10),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: AppColors.border)),
                  ),
                  child: Row(
                    children: [
                      Text(
                          l.isPreview
                              ? '▶'
                              : '${l.orderIndex + 1}'.padLeft(2, '0'),
                          style: const TextStyle(
                              fontSize: 10.5, color: AppColors.dim)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(l.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12.5, color: AppColors.ink2)),
                      ),
                      Text(l.durationText,
                          style: const TextStyle(
                              fontSize: 10.5, color: AppColors.dim)),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}

class _DownloadsPanel extends StatelessWidget {
  const _DownloadsPanel({required this.downloads});

  final Map<String, dynamic> downloads;

  @override
  Widget build(BuildContext context) {
    final stats = [
      ('TOTAL', downloads['total'] ?? 0),
      ('LAST 30 DAYS', downloads['last30'] ?? 0),
      ('LAST 7 DAYS', downloads['last7'] ?? 0),
      ('TODAY', downloads['today'] ?? 0),
    ];
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Wrap(
        spacing: 26,
        runSpacing: 12,
        children: [
          for (final s in stats)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${s.$2}',
                    style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppColors.text)),
                Text(s.$1,
                    style: const TextStyle(
                        fontSize: 8.5,
                        letterSpacing: .7,
                        color: AppColors.dim)),
              ],
            ),
        ],
      ),
    );
  }
}

class _FileModuleCard extends StatelessWidget {
  const _FileModuleCard({
    required this.module,
    required this.index,
    required this.onOpen,
    required this.onToast,
  });

  final _Module module;
  final int index;
  final ValueChanged<String> onOpen;
  final ValueChanged<String> onToast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('${index.toString().padLeft(2, '0')}',
                  style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: AppColors.accent)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(module.title ?? 'Course archive',
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w700)),
              ),
              Text(
                '${module.files.length} part${module.files.length == 1 ? '' : 's'}'
                '${module.sizeMb > 0 ? ' · ${module.sizeMb.toStringAsFixed(0)} MB' : ''}',
                style: const TextStyle(fontSize: 10, color: AppColors.dim),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final f in module.files)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  SizedBox(
                    width: 22,
                    child: Text('${f.partIndex}'.padLeft(2, '0'),
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim)),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (f.fileName == null || f.fileName!.isEmpty)
                              ? 'Part ${f.partIndex}'
                              : f.fileName!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.ink2),
                        ),
                        Text(_bytesLabel(f.fileSizeMb),
                            style: const TextStyle(
                                fontSize: 9.5, color: AppColors.dim)),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () {
                      onToast('Opening Telegram — part ${f.partIndex}');
                      onOpen(_botLink('dlf_${f.id}'));
                    },
                    child: const Text('Get'),
                  ),
                ],
              ),
            ),
          if (module.files.length > 1)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () {
                  onToast(
                      'Opening Telegram — all ${module.files.length} parts');
                  onOpen(_botLink('dlmod_${module.files.first.id}'));
                },
                icon: const Icon(Icons.download, size: 13),
                label: const Text('All parts'),
              ),
            ),
        ],
      ),
    );
  }
}

class _InstructorCard extends StatelessWidget {
  const _InstructorCard({required this.lecturer, required this.onTap});

  final LecturerLite lecturer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            CoverPlate(
              seed: lecturer.name,
              imageUrl: lecturer.photoUrl,
              width: 46,
              height: 46,
              radius: 23,
              glyph:
                  lecturer.name.isEmpty ? '?' : lecturer.name[0].toUpperCase(),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(lecturer.name,
                      style: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(
                    (lecturer.credentials ?? '').isNotEmpty
                        ? lecturer.credentials!
                        : 'Instructor',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: AppColors.dim),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 18, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}

class _PublisherCard extends StatelessWidget {
  const _PublisherCard({required this.organization, required this.onTap});

  final Map<String, dynamic> organization;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final name = organization['name'] as String? ?? '';
    final subscribers = (organization['subscribers'] as num?)?.toInt() ?? 0;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            CoverPlate(
              seed: name,
              imageUrl: organization['logoUrl'] as String?,
              width: 42,
              height: 42,
              radius: 10,
              glyph: '🏛️',
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: const TextStyle(
                          fontSize: 13.5, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text('Publisher · ${_compact(subscribers)} learners',
                      style:
                          const TextStyle(fontSize: 11, color: AppColors.dim)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 18, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}

class _RatingsPanel extends StatelessWidget {
  const _RatingsPanel({
    required this.avg,
    required this.count,
    required this.distribution,
    required this.myRating,
    required this.onRate,
  });

  final double avg;
  final int count;
  final Map<String, dynamic> distribution;
  final int myRating;
  final ValueChanged<int> onRate;

  int _votes(int stars) =>
      (distribution['$stars'] as num?)?.toInt() ??
      (distribution[stars] as num?)?.toInt() ??
      0;

  @override
  Widget build(BuildContext context) {
    final maxVotes =
        [5, 4, 3, 2, 1].map(_votes).fold<int>(1, (a, b) => b > a ? b : a);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('HOW IT’S RATED',
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                  color: AppColors.accent)),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(avg.toStringAsFixed(1),
                  style: const TextStyle(
                      fontSize: 36,
                      height: 1,
                      fontWeight: FontWeight.w900,
                      color: AppColors.text)),
              const SizedBox(width: 6),
              const Text('/ 5',
                  style: TextStyle(fontSize: 13, color: AppColors.dim)),
            ],
          ),
          const SizedBox(height: 4),
          Text('Overall rating · ${_compact(count)} votes',
              style: const TextStyle(fontSize: 11, color: AppColors.dim)),
          if (count > 0) ...[
            const SizedBox(height: 12),
            for (final stars in [5, 4, 3, 2, 1])
              Padding(
                padding: const EdgeInsets.only(bottom: 5),
                child: Row(
                  children: [
                    SizedBox(
                      width: 18,
                      child: Text('$stars★',
                          style: const TextStyle(
                              fontSize: 10, color: AppColors.dim)),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(999),
                        child: LinearProgressIndicator(
                          value: _votes(stars) / maxVotes,
                          minHeight: 6,
                          backgroundColor: AppColors.surfaceRaised,
                          valueColor: const AlwaysStoppedAnimation<Color>(
                              AppColors.accent),
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 34,
                      child: Text('${_votes(stars)}',
                          textAlign: TextAlign.right,
                          style: const TextStyle(
                              fontSize: 10, color: AppColors.dim)),
                    ),
                  ],
                ),
              ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Your rating',
                  style: TextStyle(fontSize: 11.5, color: AppColors.ink4)),
              const SizedBox(width: 10),
              for (var i = 1; i <= 5; i++)
                GestureDetector(
                  onTap: () => onRate(i),
                  child: Padding(
                    padding: const EdgeInsets.only(right: 3),
                    child: Icon(
                      i <= myRating ? Icons.star : Icons.star_border,
                      size: 23,
                      color: AppColors.accent,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review, required this.onUpvote});

  final Review review;
  final VoidCallback onUpvote;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CoverPlate(
                seed: review.userName,
                imageUrl: review.userAvatar,
                width: 30,
                height: 30,
                radius: 15,
                glyph: review.userName.isEmpty
                    ? '?'
                    : review.userName[0].toUpperCase(),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(review.userName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12.5, fontWeight: FontWeight.w700)),
                        ),
                        if (review.isStaff) ...[
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: AppColors.accentSoft,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('EDITORIAL',
                                style: TextStyle(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.accent)),
                          ),
                        ],
                      ],
                    ),
                    Row(
                      children: [
                        for (var i = 1; i <= 5; i++)
                          Icon(
                            i <= review.rating ? Icons.star : Icons.star_border,
                            size: 11,
                            color: AppColors.accent,
                          ),
                        const SizedBox(width: 6),
                        Text(_shortDate(review.createdAt),
                            style: const TextStyle(
                                fontSize: 9.5, color: AppColors.dim)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if ((review.body ?? '').isNotEmpty) ...[
            const SizedBox(height: 9),
            Text(review.body!,
                style: const TextStyle(
                    fontSize: 12.5, height: 1.6, color: AppColors.ink2)),
          ],
          const SizedBox(height: 6),
          Row(
            children: [
              TextButton.icon(
                onPressed: onUpvote,
                style: TextButton.styleFrom(
                    padding: EdgeInsets.zero, minimumSize: const Size(0, 30)),
                icon: Icon(
                  review.upvoted ? Icons.thumb_up : Icons.thumb_up_outlined,
                  size: 13,
                  color: review.upvoted ? AppColors.accent : AppColors.dim,
                ),
                label: Text(
                  review.upvotes > 0 ? '${review.upvotes}' : 'Helpful',
                  style: const TextStyle(fontSize: 10.5, color: AppColors.dim),
                ),
              ),
              if (review.replyCount > 0) ...[
                const SizedBox(width: 12),
                Text(
                    '${review.replyCount} repl${review.replyCount == 1 ? 'y' : 'ies'}',
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.dim)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _ListPicker extends StatelessWidget {
  const _ListPicker({required this.lists});

  final List<CourseCollection> lists;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Add to a list',
              style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text('Lists keep related courses together.',
              style: TextStyle(fontSize: 11.5, color: AppColors.dim)),
          const SizedBox(height: 12),
          if (lists.isEmpty)
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'You have no lists yet. Build one from Collections first.',
                  style: TextStyle(fontSize: 12, color: AppColors.dim),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.pushNamed(context, '/lists');
                  },
                  child: const Text('Open Collections'),
                ),
              ],
            )
          else
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: lists.length,
                itemBuilder: (context, i) {
                  final l = lists[i];
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.layers_outlined,
                        size: 18, color: AppColors.accent),
                    title: Text(l.name, style: const TextStyle(fontSize: 13.5)),
                    subtitle: Text(
                        '${l.itemCount} course${l.itemCount == 1 ? '' : 's'} · ${l.visibility}',
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim)),
                    trailing: const Icon(Icons.add,
                        size: 18, color: AppColors.accent),
                    onTap: () => Navigator.pop(context, l),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// Progress and the certificate for the current course. Archive courses list
/// their Telegram files here so they can be ticked off like lessons.
class _ProgressCard extends StatelessWidget {
  const _ProgressCard({
    required this.progress,
    required this.marking,
    required this.slug,
    required this.onToggle,
    required this.onIssue,
    required this.onToast,
  });

  final Map<String, dynamic> progress;
  final bool marking;
  final String slug;
  final Future<void> Function(String unitId, bool done) onToggle;
  final Future<void> Function() onIssue;
  final ValueChanged<String> onToast;

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) onToast('Could not open $url');
  }

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
    final nextLesson = ((progress['lessons'] as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .where((e) => e['completed'] != true)
        .cast<Map<String, dynamic>?>()
        .firstWhere((e) => true, orElse: () => null);

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
            children: [
              const Text('Your progress',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('$completed/$total $unitWord',
                  style: const TextStyle(fontSize: 10.5, color: AppColors.dim)),
            ],
          ),
          const SizedBox(height: 9),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: pct / 100,
              minHeight: 7,
              backgroundColor: AppColors.surfaceRaised,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.accent),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${pct.toStringAsFixed(0)}% complete'
                  '${cert != null ? ' · certificate earned' : ''}',
                  style: const TextStyle(fontSize: 11.5, color: AppColors.dim),
                ),
              ),
              if (nextLesson != null)
                TextButton(
                  onPressed: () => Navigator.pushNamed(
                    context,
                    '/courses/$slug/lessons/${nextLesson['id']}',
                  ),
                  child: Text(
                    completed > 0 ? 'Continue' : 'Start the first lesson',
                    style: const TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w800),
                  ),
                ),
            ],
          ),
          if (unitType == 'file') ...[
            const SizedBox(height: 8),
            for (final raw in units)
              _unitRow(Map<String, dynamic>.from(raw as Map)),
          ],
          const SizedBox(height: 10),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 10),
          if (cert != null)
            Wrap(
              spacing: 8,
              runSpacing: 6,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('Certificate ${cert['serial'] ?? ''}',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700)),
                OutlinedButton(
                  onPressed: () =>
                      Navigator.pushNamed(context, '/certificates'),
                  child: const Text('View & verify'),
                ),
                OutlinedButton(
                  onPressed: () =>
                      _open('$_webApp/certificates/${cert['serial']}'),
                  child: const Text('Public page'),
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
            Text(
              'Mark every $unitLabel complete to earn a certificate. Tracking is free; issuing it is part of Premium.',
              style: const TextStyle(
                  fontSize: 11, height: 1.5, color: AppColors.dim),
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
      if (size != null) _bytesLabel(size),
      done ? 'Completed' : 'Mark when you have the file',
    ].join(' · ');
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: marking ? null : () => onToggle('${u['id']}', done),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Icon(
              done ? Icons.check_circle : Icons.radio_button_unchecked,
              size: 19,
              color: done ? AppColors.accent : AppColors.dim,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12.5)),
                  Text(sub,
                      style: const TextStyle(
                          fontSize: 10.5, color: AppColors.dim)),
                ],
              ),
            ),
            Text(
              marking
                  ? 'Saving…'
                  : done
                      ? 'Undo'
                      : 'Mark',
              style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: AppColors.accent),
            ),
          ],
        ),
      ),
    );
  }
}

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

String _shortDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';
