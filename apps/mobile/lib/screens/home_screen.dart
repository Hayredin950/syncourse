import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// The phone home screen, rebuilt from `apps/web/src/app/page.tsx`: the
/// category strip, the featured hero carousel, and the same rails in the same
/// order — new drops, trending, top ten, editors, categories, instructors,
/// publishers, resources, community shelves and paths.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<HomeFeed> _feed;
  Future<ResourceList>? _resources;
  Future<List<CourseCollection>>? _collections;
  Future<Map<String, dynamic>?>? _forYou;
  bool _signedIn = false;
  String _trendTab = 'popular';

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _feed = Api.home();
    _resources = Api.resources(limit: 9, sort: 'newest');
    _collections =
        Api.browseLists(limit: 8).catchError((_) => <CourseCollection>[]);
    _signedIn = false;
    _forYou = Api.loadToken().then((token) async {
      if (token == null) return null;
      _signedIn = true;
      try {
        return await Api.forYou(limit: 12);
      } catch (_) {
        return null;
      }
    });
  }

  Future<void> _reload() async {
    setState(_load);
    await _feed;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<HomeFeed>(
          future: _feed,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return Column(
                children: [
                  const SyncourseHeader(),
                  const Expanded(
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
              );
            }
            if (snapshot.hasError) {
              return Column(
                children: [
                  const SyncourseHeader(),
                  Expanded(
                    child: LoadError(
                      message: '${snapshot.error}',
                      onRetry: () => setState(_load),
                    ),
                  ),
                ],
              );
            }
            final feed = snapshot.data!;
            return RefreshIndicator(
              onRefresh: _reload,
              color: AppColors.accent,
              backgroundColor: AppColors.surface,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 126),
                children: [
                  const SyncourseHeader(),
                  _CategoryStrip(),
                  if (feed.trending.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    _Hero(feed: feed),
                  ],
                  FutureBuilder<Map<String, dynamic>?>(
                    future: _forYou,
                    builder: (context, snap) {
                      final data = snap.data;
                      if (data == null) return const SizedBox.shrink();
                      final courses = ((data['courses'] as List?) ?? [])
                          .map((e) => CourseSummary.fromJson(
                              Map<String, dynamic>.from(e as Map)))
                          .toList();
                      if (courses.isEmpty) return const SizedBox.shrink();
                      final source = data['source'] as String? ?? 'popular';
                      return _Rail(
                        title: 'For you',
                        subtitle: source == 'personalised'
                            ? 'Picked from what you have saved, downloaded and rated.'
                            : 'Popular right now — save or rate a course and this grows sharper.',
                        courses: courses,
                        onSeeAll: () =>
                            Navigator.pushNamed(context, '/recommendations'),
                      );
                    },
                  ),
                  _Rail(
                    title: 'New drops',
                    subtitle: 'New courses and fresh lessons, newest first.',
                    courses: feed.latest,
                    onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                  ),
                  _Rail(
                    title: 'The courses everyone\'s watching this week',
                    subtitle: 'Ranked by what people actually take.',
                    courses: _trendSource(feed),
                    onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                    trailing: _TrendTabs(
                      value: _trendTab,
                      onChanged: (v) => setState(() => _trendTab = v),
                    ),
                  ),
                  _Rail(
                    title: 'Top 10 on Syncourse today',
                    subtitle: 'What everyone is learning right now.',
                    courses: feed.topRated.take(10).toList(),
                    onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                  ),
                  if (feed.topRated.length > 3)
                    _WideRail(
                      title: 'Our editors\' most acclaimed',
                      subtitle: 'Hand-picked, highest rated first.',
                      courses: feed.topRated.take(8).toList(),
                      onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                    ),
                  if (feed.categories.isNotEmpty)
                    _CategoryRow(categories: feed.categories),
                  if (feed.lecturers.isNotEmpty)
                    _InstructorRow(lecturers: feed.lecturers),
                  if (feed.bestOf.isNotEmpty) _BestOfRow(bestOf: feed.bestOf),
                  FutureBuilder<ResourceList>(
                    future: _resources,
                    builder: (context, snap) {
                      final data = snap.data;
                      if (data == null || data.results.isEmpty) {
                        return const SizedBox.shrink();
                      }
                      return _ResourcesBand(data: data);
                    },
                  ),
                  _NextCoursePanel(signedIn: _signedIn),
                  _Rail(
                    title: 'Top rated',
                    courses: feed.topRated,
                    onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                  ),
                  if (feed.featuredPaths.isNotEmpty)
                    _PathsBand(paths: feed.featuredPaths),
                  FutureBuilder<List<CourseCollection>>(
                    future: _collections,
                    builder: (context, snap) {
                      final lists = snap.data;
                      if (lists == null || lists.isEmpty) {
                        return const SizedBox.shrink();
                      }
                      return _CollectionsBand(lists: lists);
                    },
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  List<CourseSummary> _trendSource(HomeFeed feed) {
    switch (_trendTab) {
      case 'top':
        return feed.topRated;
      case 'newest':
        return feed.latest;
      default:
        return feed.trending;
    }
  }
}

class _CategoryStrip extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final items = [
      (label: 'All', icon: Icons.menu_book_outlined, route: '/browse'),
      (label: 'Courses', icon: null, route: '/browse'),
      (label: 'Mini', icon: Icons.bolt, route: '/browse'),
      (label: 'Resources', icon: null, route: '/resources'),
      (label: 'Collections', icon: null, route: '/lists'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 2),
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => Navigator.pushNamed(context, items[i].route),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                  decoration: BoxDecoration(
                    color: i == 0 ? AppColors.accentSoft : Colors.transparent,
                    border: Border.all(
                        color: i == 0
                            ? AppColors.accent.withValues(alpha: .45)
                            : AppColors.border),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    children: [
                      if (items[i].icon != null) ...[
                        Icon(items[i].icon,
                            size: 13,
                            color: i == 0 ? AppColors.accent : AppColors.ink4),
                        const SizedBox(width: 5),
                      ],
                      Text(
                        items[i].label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: i == 0 ? AppColors.accent : AppColors.ink4,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The featured carousel. Up to six deduped titles, auto-advancing every eight
/// seconds, with a manual dot strip underneath.
class _Hero extends StatefulWidget {
  const _Hero({required this.feed});
  final HomeFeed feed;

  @override
  State<_Hero> createState() => _HeroState();
}

class _HeroState extends State<_Hero> {
  final _controller = PageController(viewportFraction: .92);
  Timer? _timer;
  int _index = 0;
  late List<CourseSummary> _featured;

  @override
  void initState() {
    super.initState();
    final seen = <String>{};
    _featured = <CourseSummary>[];
    for (final c in [
      ...widget.feed.trending.take(4),
      ...widget.feed.topRated.take(3),
      ...widget.feed.latest.take(3),
    ]) {
      if (seen.add(c.id)) _featured.add(c);
    }
    _featured = _featured.take(6).toList();
    if (_featured.length > 1) {
      _timer = Timer.periodic(const Duration(seconds: 8), (_) {
        if (!mounted || !_controller.hasClients) return;
        final next = (_index + 1) % _featured.length;
        _controller.animateToPage(
          next,
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeOutCubic,
        );
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_featured.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        SizedBox(
          height: 392,
          child: PageView.builder(
            controller: _controller,
            itemCount: _featured.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (context, i) => Padding(
              padding: const EdgeInsets.only(right: 10),
              child: _HeroCard(
                course: _featured[i],
                rank: i + 1,
              ),
            ),
          ),
        ),
        if (_featured.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < _featured.length; i++)
                GestureDetector(
                  onTap: () => _controller.animateToPage(i,
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.easeOutCubic),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _index ? 18 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == _index ? AppColors.accent : AppColors.border,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.course, required this.rank});
  final CourseSummary course;
  final int rank;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/courses/${course.slug}'),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Stack(
          fit: StackFit.expand,
          children: [
            CoverPlate(
              seed: course.slug,
              imageUrl: course.thumbnailUrl,
              height: 392,
              radius: 0,
              glyph: course.isMini ? '⚡' : '🎓',
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0x22000000),
                    Color(0x55000000),
                    Color(0xF20E0E0D),
                  ],
                  stops: [0, .36, 1],
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
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: .42),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: AppColors.hairline),
                    ),
                    child: Text(
                      '#$rank today',
                      style: const TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: .5,
                        color: AppColors.ink2,
                      ),
                    ),
                  ),
                  const SizedBox(height: 9),
                  Text(
                    course.title,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 28,
                      height: 1.05,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -1,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 10,
                    runSpacing: 4,
                    children: [
                      if (course.ratingCount > 0)
                        _HeroMeta(
                            icon: Icons.star,
                            text: course.ratingAvg.toStringAsFixed(1)),
                      _HeroMeta(text: course.level),
                      if (course.durationText.isNotEmpty)
                        _HeroMeta(text: course.durationText),
                      if (course.lessonCount > 0)
                        _HeroMeta(text: '${course.lessonCount} lessons'),
                      if (course.categoryNames.isNotEmpty)
                        _HeroMeta(text: course.categoryNames.first),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    course.description.isEmpty
                        ? 'A hands-on course for engineers who care about the details users can feel.'
                        : course.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.45,
                      color: AppColors.ink4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      FilledButton.icon(
                        onPressed: () => Navigator.pushNamed(
                            context, '/courses/${course.slug}'),
                        icon: const Icon(Icons.play_arrow, size: 19),
                        label: const Text('Start learning'),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: () => Navigator.pushNamed(
                            context, '/courses/${course.slug}'),
                        icon: const Icon(Icons.download, size: 17),
                        label: const Text('Download'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: AppColors.hairline),
                          backgroundColor: Colors.black.withValues(alpha: .25),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroMeta extends StatelessWidget {
  const _HeroMeta({this.icon, required this.text});
  final IconData? icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 13, color: AppColors.accent),
          const SizedBox(width: 3),
        ],
        Text(text,
            style: const TextStyle(fontSize: 10.5, color: AppColors.ink3)),
      ],
    );
  }
}

class _TrendTabs extends StatelessWidget {
  const _TrendTabs({required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const tabs = [
      (value: 'popular', label: 'Popular'),
      (value: 'top', label: 'Top rated'),
      (value: 'newest', label: 'Newest'),
    ];
    return PopupMenuButton<String>(
      onSelected: onChanged,
      color: AppColors.surfaceRaised,
      itemBuilder: (_) => [
        for (final t in tabs)
          PopupMenuItem(
            value: t.value,
            child: Text(t.label,
                style: TextStyle(
                    fontSize: 12.5,
                    color:
                        t.value == value ? AppColors.accent : AppColors.ink2)),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              tabs.firstWhere((t) => t.value == value).label,
              style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink2),
            ),
            const Icon(Icons.expand_more, size: 16, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}

class _Rail extends StatelessWidget {
  const _Rail({
    required this.title,
    required this.courses,
    this.subtitle,
    this.onSeeAll,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final List<CourseSummary> courses;
  final VoidCallback? onSeeAll;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: title,
          subtitle: subtitle,
          onSeeAll: onSeeAll,
          trailing: trailing,
        ),
        SizedBox(
          height: 254,
          child: courses.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Center(
                      child: Text('Nothing here yet',
                          style:
                              TextStyle(fontSize: 12.5, color: AppColors.dim))),
                )
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: courses.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, i) => CoursePoster(
                    course: courses[i],
                    showRank: title.startsWith('Top 10'),
                  ),
                ),
        ),
      ],
    );
  }
}

class _WideRail extends StatelessWidget {
  const _WideRail({
    required this.title,
    required this.subtitle,
    required this.courses,
    required this.onSeeAll,
  });

  final String title, subtitle;
  final List<CourseSummary> courses;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(title: title, subtitle: subtitle, onSeeAll: onSeeAll),
        SizedBox(
          height: 150,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: courses.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) {
              final c = courses[i];
              return GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/courses/${c.slug}'),
                child: SizedBox(
                  width: 236,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      CoverPlate(
                        seed: c.slug,
                        imageUrl: c.thumbnailUrl,
                        width: 236,
                        height: 150,
                        radius: 12,
                        glyph: c.isMini ? '⚡' : '🎓',
                      ),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Color(0xD9000000)],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 12,
                        right: 12,
                        bottom: 11,
                        child: Text(
                          c.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            height: 1.2,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _CategoryRow extends StatefulWidget {
  const _CategoryRow({required this.categories});
  final List<CategoryRow> categories;

  @override
  State<_CategoryRow> createState() => _CategoryRowState();
}

class _CategoryRowState extends State<_CategoryRow> {
  late String _slug = widget.categories.first.slug;
  List<CourseSummary> _courses = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final rows = await Api.browse(category: _slug, limit: 12);
      if (!mounted) return;
      setState(() {
        _courses = rows;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'Explore by category',
          onSeeAll: () => Navigator.pushNamed(context, '/browse',
              arguments: {'category': _slug}),
          trailing: PopupMenuButton<String>(
            color: AppColors.surfaceRaised,
            onSelected: (v) {
              setState(() => _slug = v);
              _fetch();
            },
            itemBuilder: (_) => [
              for (final c in widget.categories)
                PopupMenuItem(
                    value: c.slug,
                    child: Text('${c.name} (${c.courseCount})',
                        style: const TextStyle(
                            fontSize: 12.5, color: AppColors.ink2))),
            ],
            child: _DropdownChip(label: _currentName),
          ),
        ),
        SizedBox(
          height: 254,
          child: _loading
              ? const Center(
                  child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2)))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _courses.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => CoursePoster(course: _courses[i]),
                ),
        ),
      ],
    );
  }

  String get _currentName => widget.categories
      .firstWhere((c) => c.slug == _slug, orElse: () => widget.categories.first)
      .name;
}

class _InstructorRow extends StatefulWidget {
  const _InstructorRow({required this.lecturers});
  final List<LecturerRow> lecturers;

  @override
  State<_InstructorRow> createState() => _InstructorRowState();
}

class _InstructorRowState extends State<_InstructorRow> {
  late String _slug = widget.lecturers.first.slug;
  List<CourseSummary> _courses = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final rows = await Api.browse(lecturer: _slug, limit: 12);
      if (!mounted) return;
      setState(() {
        _courses = rows;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'By instructor',
          onSeeAll: () => Navigator.pushNamed(context, '/lecturers/$_slug'),
          trailing: PopupMenuButton<String>(
            color: AppColors.surfaceRaised,
            onSelected: (v) {
              setState(() => _slug = v);
              _fetch();
            },
            itemBuilder: (_) => [
              for (final l in widget.lecturers)
                PopupMenuItem(
                    value: l.slug,
                    child: Text(l.name,
                        style: const TextStyle(
                            fontSize: 12.5, color: AppColors.ink2))),
            ],
            child: _DropdownChip(label: _currentName),
          ),
        ),
        SizedBox(
          height: 254,
          child: _loading
              ? const Center(
                  child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2)))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: _courses.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => CoursePoster(course: _courses[i]),
                ),
        ),
      ],
    );
  }

  String get _currentName => widget.lecturers
      .firstWhere((l) => l.slug == _slug, orElse: () => widget.lecturers.first)
      .name;
}

class _BestOfRow extends StatefulWidget {
  const _BestOfRow({required this.bestOf});
  final List<Map<String, dynamic>> bestOf;

  @override
  State<_BestOfRow> createState() => _BestOfRowState();
}

class _BestOfRowState extends State<_BestOfRow> {
  late int _index = 0;

  Map<String, dynamic> get _active {
    final withCourses = widget.bestOf
        .where((o) => ((o['courses'] as List?) ?? []).isNotEmpty)
        .toList();
    final rows = withCourses.isEmpty ? widget.bestOf : withCourses;
    return rows[_index.clamp(0, rows.length - 1)];
  }

  @override
  Widget build(BuildContext context) {
    final courses = ((_active['courses'] as List?) ?? [])
        .map((e) => CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
    final options = widget.bestOf
        .where((o) => ((o['courses'] as List?) ?? []).isNotEmpty)
        .toList();
    if (options.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'Best of',
          onSeeAll: () =>
              Navigator.pushNamed(context, '/organizations/${_active['slug']}'),
          trailing: PopupMenuButton<int>(
            color: AppColors.surfaceRaised,
            onSelected: (v) => setState(() => _index = v),
            itemBuilder: (_) => [
              for (var i = 0; i < options.length; i++)
                PopupMenuItem(
                    value: i,
                    child: Text(options[i]['name'] as String? ?? '',
                        style: const TextStyle(
                            fontSize: 12.5, color: AppColors.ink2))),
            ],
            child: _DropdownChip(label: _active['name'] as String? ?? ''),
          ),
        ),
        SizedBox(
          height: 254,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: courses.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => CoursePoster(course: courses[i]),
          ),
        ),
      ],
    );
  }
}

class _DropdownChip extends StatelessWidget {
  const _DropdownChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 110),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink2),
            ),
          ),
          const Icon(Icons.expand_more, size: 15, color: AppColors.dim),
        ],
      ),
    );
  }
}

class _ResourcesBand extends StatelessWidget {
  const _ResourcesBand({required this.data});
  final ResourceList data;

  @override
  Widget build(BuildContext context) {
    final shown = data.results.take(6).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'Cheat-sheets, roadmaps & notes',
          subtitle:
              'The short things you keep open in a second tab — published in full here.',
          onSeeAll: () => Navigator.pushNamed(context, '/resources'),
        ),
        SizedBox(
          height: 190,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: shown.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => SizedBox(
              width: 156,
              child: ResourceTile(resource: shown[i]),
            ),
          ),
        ),
      ],
    );
  }
}

class _NextCoursePanel extends StatelessWidget {
  const _NextCoursePanel({required this.signedIn});
  final bool signedIn;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 34, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('YOUR NEXT COURSE',
                style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                    color: AppColors.accent)),
            const SizedBox(height: 7),
            Text(
              signedIn
                  ? 'Pick up where you left off.'
                  : 'Recommendations made for your pace.',
              style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                  color: AppColors.text),
            ),
            const SizedBox(height: 6),
            Text(
              signedIn
                  ? 'Rate what you learn and Syncourse keeps your next picks fresh.'
                  : 'Sign in, then learn and rate what you love. Syncourse learns the topics and lecturers you gravitate toward, then keeps a fresh set of picks ready.',
              style: const TextStyle(
                  fontSize: 12.5, height: 1.55, color: AppColors.dim),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: () => Navigator.pushNamed(
                  context, signedIn ? '/my-learning' : '/auth'),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(signedIn ? 'Open your library' : 'Sign in'),
                  const SizedBox(width: 6),
                  const Icon(Icons.arrow_forward, size: 15),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PathsBand extends StatelessWidget {
  const _PathsBand({required this.paths});
  final List<LearningPathRow> paths;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'Featured learning paths',
          subtitle: 'Follow a route from first lesson to last.',
          onSeeAll: () => Navigator.pushNamed(context, '/paths'),
        ),
        SizedBox(
          height: 178,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: paths.length,
            separatorBuilder: (_, __) => const SizedBox(width: 11),
            itemBuilder: (_, i) {
              final p = paths[i];
              return GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/paths/${p.id}'),
                child: Container(
                  width: 220,
                  padding: const EdgeInsets.all(13),
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
                          for (final c in p.courses.take(4))
                            Padding(
                              padding: const EdgeInsets.only(right: 4),
                              child: CoverPlate(
                                seed: c.slug,
                                imageUrl: c.thumbnailUrl,
                                width: 30,
                                height: 38,
                                radius: 4,
                                glyph: '🎓',
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Expanded(
                        child: Text(
                          p.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 14,
                              height: 1.25,
                              fontWeight: FontWeight.w800,
                              color: AppColors.ink1),
                        ),
                      ),
                      Text(
                        '${p.courseCount} courses',
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _CollectionsBand extends StatelessWidget {
  const _CollectionsBand({required this.lists});
  final List<CourseCollection> lists;

  @override
  Widget build(BuildContext context) {
    final shown = lists.where((l) => l.itemCount > 0).take(8).toList();
    if (shown.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'Collections worth borrowing',
          subtitle:
              'Courses someone else already grouped for a reason. Save a shelf and it follows you.',
          onSeeAll: () => Navigator.pushNamed(context, '/lists'),
        ),
        SizedBox(
          height: 188,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: shown.length,
            separatorBuilder: (_, __) => const SizedBox(width: 11),
            itemBuilder: (_, i) {
              final l = shown[i];
              return GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/lists/${l.id}'),
                child: Container(
                  width: 180,
                  padding: const EdgeInsets.all(12),
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
                          for (var j = 0;
                              j <
                                  (l.covers.isEmpty
                                      ? 1
                                      : l.covers.take(3).length);
                              j++)
                            Padding(
                              padding: const EdgeInsets.only(right: 4),
                              child: CoverPlate(
                                seed: l.covers.isEmpty ? l.id : l.covers[j],
                                imageUrl: l.covers.isEmpty ? null : l.covers[j],
                                width: 40,
                                height: 54,
                                radius: 5,
                                glyph: '🎓',
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 9),
                      Expanded(
                        child: Text(
                          l.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13,
                              height: 1.25,
                              fontWeight: FontWeight.w800,
                              color: AppColors.ink1),
                        ),
                      ),
                      Text(
                        '${l.itemCount} courses · ${l.savesCount} saves',
                        style:
                            const TextStyle(fontSize: 10, color: AppColors.dim),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
