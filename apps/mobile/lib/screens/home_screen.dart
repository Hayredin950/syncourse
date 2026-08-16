import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<HomeFeed> _feed;

  @override
  void initState() {
    super.initState();
    _feed = Api.instance.home();
  }

  void _reload() {
    setState(() {
      _feed = Api.instance.home();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'SynCourse',
          style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.5),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => Navigator.pushNamed(context, '/search'),
          ),
        ],
      ),
      body: FutureBuilder<HomeFeed>(
        future: _feed,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _ErrorView(message: '${snapshot.error}', onRetry: _reload);
          }
          final feed = snapshot.data!;
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                _Rail(
                  title: '🔥 Trending',
                  courses: feed.trending,
                  onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                ),
                _Rail(
                  title: '✨ Latest',
                  courses: feed.latest,
                  onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                ),
                _Rail(
                  title: '⭐ Top rated',
                  courses: feed.topRated,
                  onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                ),
                for (final rail in feed.rails)
                  _Rail(
                    title: rail.title,
                    courses: rail.courses,
                    onSeeAll: () => Navigator.pushNamed(context, '/browse'),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Rail extends StatelessWidget {
  const _Rail({
    required this.title,
    required this.courses,
    this.onSeeAll,
  });

  final String title;
  final List<CourseSummary> courses;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                ),
              ),
              if (onSeeAll != null)
                TextButton(onPressed: onSeeAll, child: const Text('See all')),
            ],
          ),
        ),
        SizedBox(
          height: 210,
          child: courses.isEmpty
              ? const Center(child: Text('No courses yet'))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: courses.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, i) => _CourseCard(course: courses[i]),
                ),
        ),
      ],
    );
  }
}

class _CourseCard extends StatelessWidget {
  const _CourseCard({required this.course});

  final CourseSummary course;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/courses/${course.slug}'),
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: 132,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: course.thumbnailUrl == null
                  ? Container(
                      height: 150,
                      color: AppColors.surface,
                      alignment: Alignment.center,
                      child: const Icon(Icons.play_circle_outline, size: 40, color: AppColors.muted),
                    )
                  : Image.network(
                      course.thumbnailUrl!,
                      height: 150,
                      width: 132,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        height: 150,
                        color: AppColors.surface,
                        alignment: Alignment.center,
                        child: const Icon(Icons.play_circle_outline, size: 40, color: AppColors.muted),
                      ),
                    ),
            ),
            const SizedBox(height: 8),
            Text(
              course.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 2),
            Text(
              course.durationText.isEmpty
                  ? course.level
                  : '${course.level} · ${course.durationText}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: AppColors.muted),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(Icons.star, size: 12, color: Colors.amber),
                const SizedBox(width: 2),
                Text(
                  '${course.ratingAvg.toStringAsFixed(1)} (${course.ratingCount})',
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 48, color: AppColors.muted),
            const SizedBox(height: 12),
            const Text('Could not reach the server'),
            const SizedBox(height: 4),
            Text(message, style: const TextStyle(fontSize: 12, color: AppColors.muted), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
