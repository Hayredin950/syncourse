import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// `/lecturers` — the instructor index.
class LecturersScreen extends StatefulWidget {
  const LecturersScreen({super.key});

  @override
  State<LecturersScreen> createState() => _LecturersScreenState();
}

class _LecturersScreenState extends State<LecturersScreen> {
  late Future<List<LecturerRow>> _rows;

  @override
  void initState() {
    super.initState();
    _rows = Api.lecturers();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<List<LecturerRow>>(
          future: _rows,
          builder: (context, snapshot) {
            final loading = snapshot.connectionState != ConnectionState.done;
            final failed = snapshot.hasError;
            final rows = snapshot.data ?? const <LecturerRow>[];
            return ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                SyncourseHeader(
                  title: 'Lecturers',
                  showBack: Navigator.canPop(context),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('INSTRUCTORS',
                          style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                              color: AppColors.accent)),
                      SizedBox(height: 5),
                      Text('Lecturers',
                          style: TextStyle(
                              fontSize: 30,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1,
                              color: AppColors.text)),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                  child: Text(
                    loading
                        ? '…'
                        : failed
                            ? '—'
                            : '${rows.length} instructor${rows.length == 1 ? '' : 's'}',
                    style: const TextStyle(fontSize: 11, color: AppColors.dim),
                  ),
                ),
                const SizedBox(height: 18),
                if (loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (failed)
                  LoadError(
                    message: '${snapshot.error}',
                    onRetry: () => setState(() {
                      _rows = Api.lecturers();
                    }),
                  )
                else if (rows.isEmpty)
                  const StatusView(
                    icon: Icons.person_search_outlined,
                    title: 'No lecturers yet',
                    message:
                        'Instructors appear here as soon as their first course is published.',
                  )
                else
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Wrap(
                      spacing: 10,
                      runSpacing: 12,
                      children: [
                        for (final l in rows)
                          SizedBox(
                            width: 104,
                            child: _EntityTile(
                              name: l.name,
                              subtitle:
                                  '${l.courseCount} course${l.courseCount == 1 ? '' : 's'}',
                              imageUrl: l.photoUrl,
                              round: true,
                              glyph: '👤',
                              onTap: () => Navigator.pushNamed(
                                  context, '/lecturers/${l.slug}'),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// `/organizations` — publishers, schools and channels.
class OrganizationsScreen extends StatefulWidget {
  const OrganizationsScreen({super.key});

  @override
  State<OrganizationsScreen> createState() => _OrganizationsScreenState();
}

class _OrganizationsScreenState extends State<OrganizationsScreen> {
  late Future<List<OrganizationRow>> _rows;

  @override
  void initState() {
    super.initState();
    _rows = Api.organizations();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<List<OrganizationRow>>(
          future: _rows,
          builder: (context, snapshot) {
            final loading = snapshot.connectionState != ConnectionState.done;
            final failed = snapshot.hasError;
            final rows = snapshot.data ?? const <OrganizationRow>[];
            return ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                SyncourseHeader(
                  title: 'Channels & Schools',
                  showBack: Navigator.canPop(context),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('PUBLISHERS',
                          style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                              color: AppColors.accent)),
                      SizedBox(height: 5),
                      Text('Channels & Schools',
                          style: TextStyle(
                              fontSize: 27,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1,
                              color: AppColors.text)),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                  child: Text(
                    loading
                        ? '…'
                        : failed
                            ? '—'
                            : '${rows.length} publisher${rows.length == 1 ? '' : 's'}',
                    style: const TextStyle(fontSize: 11, color: AppColors.dim),
                  ),
                ),
                const SizedBox(height: 18),
                if (loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (failed)
                  LoadError(
                    message: '${snapshot.error}',
                    onRetry: () => setState(() {
                      _rows = Api.organizations();
                    }),
                  )
                else if (rows.isEmpty)
                  const StatusView(
                    icon: Icons.account_balance_outlined,
                    title: 'No channels yet',
                    message:
                        'Channels and schools appear here once their courses go live.',
                  )
                else
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Wrap(
                      spacing: 10,
                      runSpacing: 12,
                      children: [
                        for (final o in rows)
                          SizedBox(
                            width: 104,
                            child: _EntityTile(
                              name: o.name,
                              subtitle:
                                  '${o.courseCount} course${o.courseCount == 1 ? '' : 's'}',
                              imageUrl: o.logoUrl,
                              round: false,
                              glyph: '🏛️',
                              onTap: () => Navigator.pushNamed(
                                  context, '/organizations/${o.slug}'),
                            ),
                          ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _EntityTile extends StatelessWidget {
  const _EntityTile({
    required this.name,
    required this.subtitle,
    required this.imageUrl,
    required this.round,
    required this.glyph,
    required this.onTap,
  });

  final String name, subtitle;
  final String? imageUrl;
  final bool round;
  final String glyph;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Column(
        children: [
          CoverPlate(
            seed: name,
            imageUrl: imageUrl,
            width: 84,
            height: 84,
            radius: round ? 42 : 14,
            glyph: glyph,
          ),
          const SizedBox(height: 8),
          Text(
            name,
            maxLines: 2,
            textAlign: TextAlign.center,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                fontSize: 12.5,
                height: 1.25,
                fontWeight: FontWeight.w700,
                color: AppColors.ink1),
          ),
          const SizedBox(height: 2),
          Text(subtitle,
              style: const TextStyle(fontSize: 10, color: AppColors.dim)),
        ],
      ),
    );
  }
}

/// `/lecturers/:slug`
class LecturerDetailScreen extends StatefulWidget {
  const LecturerDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  State<LecturerDetailScreen> createState() => _LecturerDetailScreenState();
}

class _LecturerDetailScreenState extends State<LecturerDetailScreen> {
  late Future<Map<String, dynamic>> _detail;

  @override
  void initState() {
    super.initState();
    _detail = Api.lecturerDetail(widget.slug);
  }

  @override
  Widget build(BuildContext context) {
    return _EntityDetailScaffold(
      future: _detail,
      title: 'Lecturer',
      notFound: 'We can\'t find that lecturer',
      fallbackLabel: 'All lecturers',
      fallbackRoute: '/lecturers',
      onRetry: () => setState(() {
        _detail = Api.lecturerDetail(widget.slug);
      }),
      builder: (data) {
        final name = data['name'] as String? ?? '';
        final courses = _parseCourses(data['courses']);
        return ListView(
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            SyncourseHeader(showBack: true, title: 'Lecturer'),
            _ProfileHead(
              kicker: 'LECTURER',
              name: name,
              imageUrl: data['photoUrl'] as String?,
              round: true,
              glyph: '👤',
              meta: '${data['credentials'] as String? ?? 'Practical teacher'}'
                  ' · ${courses.length} courses taught',
            ),
            if ((data['bio'] as String? ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Text(data['bio'] as String,
                    style: const TextStyle(
                        fontSize: 13.5, height: 1.7, color: AppColors.ink4)),
              ),
            if (courses.length > 3) _KnownFor(courses: courses),
            _CourseList(courses: courses, emptyIcon: Icons.school_outlined),
          ],
        );
      },
    );
  }
}

/// `/organizations/:slug`
class OrganizationDetailScreen extends StatefulWidget {
  const OrganizationDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  State<OrganizationDetailScreen> createState() =>
      _OrganizationDetailScreenState();
}

class _OrganizationDetailScreenState extends State<OrganizationDetailScreen> {
  late Future<Map<String, dynamic>> _detail;

  @override
  void initState() {
    super.initState();
    _detail = Api.organizationDetail(widget.slug);
  }

  @override
  Widget build(BuildContext context) {
    return _EntityDetailScaffold(
      future: _detail,
      title: 'Publisher',
      notFound: 'We can\'t find that channel',
      fallbackLabel: 'All channels & schools',
      fallbackRoute: '/organizations',
      onRetry: () => setState(() {
        _detail = Api.organizationDetail(widget.slug);
      }),
      builder: (data) {
        final name = data['name'] as String? ?? '';
        final courses = _parseCourses(data['courses']);
        final type = data['orgType'] as String?;
        final typeLabel = type == 'university'
            ? 'University'
            : type == 'company'
                ? 'Company'
                : 'Publisher';
        final subscribers = (data['subscribers'] as num?)?.toInt() ?? 0;
        return ListView(
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            SyncourseHeader(showBack: true, title: name),
            _ProfileHead(
              kicker: 'PUBLISHER',
              name: name,
              imageUrl: data['logoUrl'] as String?,
              round: false,
              glyph: '🏛️',
              badge: typeLabel,
              meta: '$subscribers learners · ${courses.length} courses',
            ),
            if ((data['description'] as String? ?? '').isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Text(data['description'] as String,
                    style: const TextStyle(
                        fontSize: 13.5, height: 1.7, color: AppColors.ink4)),
              ),
            _CourseList(courses: courses, emptyIcon: Icons.library_books),
          ],
        );
      },
    );
  }
}

List<CourseSummary> _parseCourses(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .map((e) => CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
      .toList();
}

class _EntityDetailScaffold extends StatelessWidget {
  const _EntityDetailScaffold({
    required this.future,
    required this.title,
    required this.notFound,
    required this.fallbackLabel,
    required this.fallbackRoute,
    required this.onRetry,
    required this.builder,
  });

  final Future<Map<String, dynamic>> future;
  final String title, notFound, fallbackLabel, fallbackRoute;
  final VoidCallback onRetry;
  final Widget Function(Map<String, dynamic> data) builder;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<Map<String, dynamic>>(
          future: future,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Column(
                children: [
                  SyncourseHeader(showBack: true, title: title),
                  Expanded(
                    child: StatusView(
                      icon: Icons.search_off,
                      title: notFound,
                      message:
                          'The page may have moved, or the name may have changed.',
                      actionLabel: fallbackLabel,
                      onAction: () => Navigator.pushReplacementNamed(
                          context, fallbackRoute),
                    ),
                  ),
                ],
              );
            }
            return builder(snapshot.data!);
          },
        ),
      ),
    );
  }
}

class _ProfileHead extends StatelessWidget {
  const _ProfileHead({
    required this.kicker,
    required this.name,
    required this.imageUrl,
    required this.round,
    required this.glyph,
    required this.meta,
    this.badge,
  });

  final String kicker, name, meta;
  final String? imageUrl;
  final bool round;
  final String glyph;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CoverPlate(
            seed: name,
            imageUrl: imageUrl,
            width: 82,
            height: 82,
            radius: round ? 41 : 16,
            glyph: glyph,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(kicker,
                    style: const TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                        color: AppColors.accent)),
                const SizedBox(height: 6),
                Text(name,
                    style: const TextStyle(
                        fontSize: 24,
                        height: 1.15,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.8,
                        color: AppColors.text)),
                const SizedBox(height: 7),
                Row(
                  children: [
                    if (badge != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceRaised,
                          borderRadius: BorderRadius.circular(5),
                        ),
                        child: Text(badge!.toUpperCase(),
                            style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: .5,
                                color: AppColors.ink3)),
                      ),
                      const SizedBox(width: 8),
                    ],
                    Expanded(
                      child: Text(meta,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11.5, color: AppColors.dim)),
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

class _KnownFor extends StatelessWidget {
  const _KnownFor({required this.courses});
  final List<CourseSummary> courses;

  @override
  Widget build(BuildContext context) {
    final rows = [...courses]..sort((a, b) =>
        b.downloadCount.compareTo(a.downloadCount) != 0
            ? b.downloadCount.compareTo(a.downloadCount)
            : b.ratingCount.compareTo(a.ratingCount));
    final shown = rows.take(6).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHead(
          title: 'Known for',
          subtitle: 'Most downloaded of ${courses.length}',
        ),
        SizedBox(
          height: 254,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: shown.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => CoursePoster(course: shown[i]),
          ),
        ),
      ],
    );
  }
}

class _CourseList extends StatefulWidget {
  const _CourseList({required this.courses, required this.emptyIcon});
  final List<CourseSummary> courses;
  final IconData emptyIcon;

  @override
  State<_CourseList> createState() => _CourseListState();
}

class _CourseListState extends State<_CourseList> {
  String _sort = 'top';
  bool _grid = false;
  String _query = '';

  List<CourseSummary> get _shown {
    var list = [...widget.courses];
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list
          .where((c) =>
              c.title.toLowerCase().contains(q) ||
              c.description.toLowerCase().contains(q))
          .toList();
    }
    switch (_sort) {
      case 'newest':
        list.sort(
            (a, b) => (b.publishedAt ?? '').compareTo(a.publishedAt ?? ''));
        break;
      case 'az':
        list.sort(
            (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
        break;
      default:
        list.sort((a, b) => b.ratingAvg.compareTo(a.ratingAvg) != 0
            ? b.ratingAvg.compareTo(a.ratingAvg)
            : b.ratingCount.compareTo(a.ratingCount));
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _shown;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHead(
          title: 'Courses',
          padding: EdgeInsets.fromLTRB(16, 26, 16, 0),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  style: const TextStyle(fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'Filter these courses…',
                    prefixIcon:
                        Icon(Icons.search, size: 18, color: AppColors.dim),
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              PopupMenuButton<String>(
                tooltip: 'Sort',
                color: AppColors.surfaceRaised,
                onSelected: (v) => setState(() => _sort = v),
                itemBuilder: (_) => const [
                  PopupMenuItem(
                      value: 'top',
                      child:
                          Text('Top rated', style: TextStyle(fontSize: 12.5))),
                  PopupMenuItem(
                      value: 'newest',
                      child: Text('Newest', style: TextStyle(fontSize: 12.5))),
                  PopupMenuItem(
                      value: 'az',
                      child: Text('A–Z', style: TextStyle(fontSize: 12.5))),
                ],
                child: const Padding(
                  padding: EdgeInsets.all(6),
                  child: Icon(Icons.swap_vert, color: AppColors.ink3),
                ),
              ),
              IconButton(
                tooltip: _grid ? 'List view' : 'Grid view',
                onPressed: () => setState(() => _grid = !_grid),
                icon: Icon(_grid ? Icons.view_list : Icons.grid_view,
                    color: AppColors.ink3),
              ),
            ],
          ),
        ),
        if (rows.isEmpty)
          StatusView(
            icon: widget.emptyIcon,
            title: 'No courses match',
            message: 'Try a different filter.',
          )
        else if (_grid)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final columns = constraints.maxWidth > 520 ? 3 : 2;
                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 20,
                    crossAxisSpacing: 12,
                    childAspectRatio: .54,
                  ),
                  itemCount: rows.length,
                  itemBuilder: (_, i) => CoursePoster(
                    course: rows[i],
                    width: double.infinity,
                  ),
                );
              },
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
            child: Column(
              children: [
                for (final c in rows) ...[
                  CourseRowTile(course: c),
                  const DividerLine(indent: 0, endIndent: 0),
                ],
              ],
            ),
          ),
        const SizedBox(height: 16),
      ],
    );
  }
}
