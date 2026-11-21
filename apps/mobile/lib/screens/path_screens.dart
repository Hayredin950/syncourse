import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// `/paths` — the curated multi-course tracks, matching the web index.
class PathsScreen extends StatefulWidget {
  const PathsScreen({super.key});

  @override
  State<PathsScreen> createState() => _PathsScreenState();
}

class _PathsScreenState extends State<PathsScreen> {
  late Future<List<LearningPathRow>> _paths;

  @override
  void initState() {
    super.initState();
    _paths = Api.learningPaths();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<List<LearningPathRow>>(
          future: _paths,
          builder: (context, snapshot) {
            final loading = snapshot.connectionState != ConnectionState.done;
            final failed = snapshot.hasError;
            final paths = snapshot.data ?? const <LearningPathRow>[];
            return ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                SyncourseHeader(
                  title: 'Learning paths',
                  showBack: Navigator.canPop(context),
                ),
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('LEARNING PATHS',
                          style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                              color: AppColors.accent)),
                      SizedBox(height: 5),
                      Text('Featured learning paths',
                          style: TextStyle(
                              fontSize: 29,
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
                            : '${paths.length} path${paths.length == 1 ? '' : 's'}',
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
                      _paths = Api.learningPaths();
                    }),
                  )
                else if (paths.isEmpty)
                  const StatusView(
                    icon: Icons.map_outlined,
                    title: 'No learning paths yet',
                    message:
                        'A path stitches several courses into one order worth following. The first ones are on the way.',
                  )
                else
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        for (final p in paths)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _PathCard(path: p),
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

class _PathCard extends StatelessWidget {
  const _PathCard({required this.path});
  final LearningPathRow path;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/paths/${path.id}'),
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
            const Text('LEARNING PATH',
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1,
                    color: AppColors.accent)),
            const SizedBox(height: 12),
            Text(path.title,
                style: const TextStyle(
                    fontSize: 18,
                    height: 1.2,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                    color: AppColors.text)),
            if (path.description.isNotEmpty) ...[
              const SizedBox(height: 7),
              Text(path.description,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 12, height: 1.5, color: AppColors.dim)),
            ],
            if (path.courses.isNotEmpty) ...[
              const SizedBox(height: 14),
              SizedBox(
                height: 74,
                child: Row(
                  children: [
                    for (final c in path.courses.take(4))
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: CoverPlate(
                          seed: c.slug,
                          imageUrl: c.thumbnailUrl,
                          width: 56,
                          height: 74,
                          radius: 6,
                          glyph: '🎓',
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            Text(
              '${path.courseCount} courses'
              '${path.totalVotes > 0 ? ' · ★ ${path.ratingAvg.toStringAsFixed(1)} avg · ${path.totalVotes} votes' : ''}',
              style: const TextStyle(fontSize: 11, color: AppColors.dim),
            ),
          ],
        ),
      ),
    );
  }
}

/// `/paths/:id` — a franchise-style hero, path progress and numbered courses.
class PathDetailScreen extends StatefulWidget {
  const PathDetailScreen({super.key, required this.id});
  final String id;

  @override
  State<PathDetailScreen> createState() => _PathDetailScreenState();
}

class _PathDetailScreenState extends State<PathDetailScreen> {
  late Future<LearningPathDetail> _path;

  @override
  void initState() {
    super.initState();
    _path = Api.learningPathDetail(widget.id);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<LearningPathDetail>(
          future: _path,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Column(
                children: [
                  SyncourseHeader(showBack: true, title: 'Learning path'),
                  Expanded(
                    child: StatusView(
                      icon: Icons.map_outlined,
                      title: 'Learning path not found',
                      message: 'It may have been removed.',
                      actionLabel: 'All learning paths',
                      onAction: () =>
                          Navigator.pushReplacementNamed(context, '/paths'),
                    ),
                  ),
                ],
              );
            }
            final p = snapshot.data!;
            return ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                SyncourseHeader(showBack: true, title: 'Learning path'),
                _Hero(path: p),
                if (p.totalLessons > 0) _Progress(path: p),
                const SectionHead(
                  title: 'Courses in this path',
                  padding: EdgeInsets.fromLTRB(16, 26, 16, 8),
                ),
                for (var i = 0; i < p.courses.length; i++)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 26,
                          child: Text(
                            '${i + 1}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: AppColors.accent),
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(child: CourseRowTile(course: p.courses[i])),
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

class _Hero extends StatelessWidget {
  const _Hero({required this.path});
  final LearningPathDetail path;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Stack(
        children: [
          CoverPlate(
            seed: path.id,
            imageUrl: path.coverUrl,
            height: 268,
            radius: 0,
            glyph: '🗺️',
          ),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0x33000000), Color(0xF20E0E0D)],
                  stops: [.1, 1],
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
                  'LEARNING PATH · ${path.courseCount} COURSES',
                  style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1,
                      color: AppColors.accent),
                ),
                const SizedBox(height: 7),
                Text(path.title,
                    style: const TextStyle(
                        fontSize: 27,
                        height: 1.05,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1,
                        color: Colors.white)),
                if (path.description.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(path.description,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 12.5, height: 1.5, color: AppColors.ink3)),
                ],
                const SizedBox(height: 9),
                Wrap(
                  spacing: 12,
                  children: [
                    if (path.totalVotes > 0)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.star,
                              size: 13, color: AppColors.accent),
                          const SizedBox(width: 3),
                          Text('${path.ratingAvg.toStringAsFixed(1)} avg',
                              style: const TextStyle(
                                  fontSize: 11, color: AppColors.ink3)),
                        ],
                      ),
                    if (path.totalVotes > 0)
                      Text('${path.totalVotes} votes',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.ink3)),
                    Text('${path.courseCount} courses',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.ink3)),
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

class _Progress extends StatelessWidget {
  const _Progress({required this.path});
  final LearningPathDetail path;

  @override
  Widget build(BuildContext context) {
    final next = path.next;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: path.pct / 100,
                minHeight: 7,
                backgroundColor: AppColors.surfaceRaised,
                valueColor:
                    const AlwaysStoppedAnimation<Color>(AppColors.accent),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${path.pct}% of this path complete · '
                    '${path.completedLessons}/${path.totalLessons} lessons',
                    style: const TextStyle(fontSize: 12, color: AppColors.ink4),
                  ),
                ),
                if (next != null)
                  TextButton(
                    onPressed: () => Navigator.pushNamed(
                      context,
                      '/courses/${next['courseSlug']}/lessons/${next['lessonId']}',
                    ),
                    child: Text(
                      path.completedLessons > 0 ? 'Continue' : 'Start',
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w800),
                    ),
                  )
                else
                  const Text('Path complete',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: AppColors.success)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
