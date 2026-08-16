import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class CourseDetailScreen extends StatefulWidget {
  const CourseDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  late Future<CourseDetail> _detail;
  bool _expanded = false;

  @override
  void initState() {
    super.initState();
    _detail = Api.instance.courseDetail(widget.slug);
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
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                expandedHeight: 220,
                flexibleSpace: FlexibleSpaceBar(
                  background: c.bannerUrl == null && c.thumbnailUrl == null
                      ? Container(color: AppColors.surface, alignment: Alignment.center, child: const Icon(Icons.play_circle_outline, size: 64, color: AppColors.muted))
                      : Image.network(c.bannerUrl ?? c.thumbnailUrl!, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(color: AppColors.surface)),
                ),
                actions: [
                  IconButton(icon: const Icon(Icons.share_outlined), onPressed: () {}),
                ],
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          const Icon(Icons.star, size: 16, color: Colors.amber),
                          const SizedBox(width: 4),
                          Text('${c.ratingAvg.toStringAsFixed(1)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(' (${c.ratingCount} ratings)', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                          const Spacer(),
                          Text(c.durationText, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('${c.level} · ${c.language} · ${c.enrollmentCount} enrolled',
                          style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                      if (c.isPremium) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.accent.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: const Text('PREMIUM', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.accent)),
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
                      if (c.prerequisites != null && c.prerequisites!.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text('Prerequisites: ${c.prerequisites}',
                            style: const TextStyle(fontSize: 13, color: AppColors.muted)),
                      ],
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: () => _openFirstLesson(c),
                              icon: const Icon(Icons.play_arrow),
                              label: const Text('Enroll & start'),
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
                          leading: CircleAvatar(radius: 22, child: Text(c.lecturer!.name.characters.first)),
                          title: Text(c.lecturer!.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(
                            [c.lecturer!.credentials, c.lecturer!.bio].whereType<String>().join(' · '),
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
                            style: const TextStyle(fontSize: 14, color: AppColors.muted)),
                        const SizedBox(height: 12),
                      ],
                      Text('Curriculum', style: _sectionStyle),
                      const SizedBox(height: 8),
                      for (final s in c.sections) _SectionCard(section: s, slug: c.slug),
                      const SizedBox(height: 20),
                      Text('Reviews', style: _sectionStyle),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text('${c.reviewAvg.toStringAsFixed(1)}',
                              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
                          const SizedBox(width: 8),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _Stars(value: c.reviewAvg),
                              Text('${c.reviewCount} reviews', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      for (final r in c.reviews) _ReviewCard(review: r),
                      if (c.reviews.isEmpty)
                        const Text('No reviews yet — be the first to rate this course',
                            style: TextStyle(color: AppColors.muted, fontSize: 13)),
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

  TextStyle get _sectionStyle => const TextStyle(fontSize: 17, fontWeight: FontWeight.w700);

  Widget _description(CourseDetail c) {
    final desc = c.description;
    if (desc.isEmpty) return const SizedBox.shrink();
    final showToggle = desc.length > 200;
    final text = (showToggle && !_expanded) ? '${desc.substring(0, 200)}…' : desc;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text, style: const TextStyle(fontSize: 14, height: 1.4, color: Colors.white70)),
        if (showToggle)
          TextButton(
            onPressed: () => setState(() => _expanded = !_expanded),
            child: Text(_expanded ? 'Show less' : 'Read more'),
          ),
      ],
    );
  }

  Future<void> _openFirstLesson(CourseDetail c) async {
    if (c.sections.isEmpty || c.sections.first.lessons.isEmpty) return;
    try {
      await Api.instance.enroll(c.slug);
    } catch (_) {
      // Already enrolled or anonymous — the lesson endpoint handles entitlements.
    }
    if (!mounted) return;
    Navigator.pushNamed(context, '/courses/${c.slug}/lessons/${c.sections.first.lessons.first.id}');
  }

  Future<void> _toggleSave(CourseDetail c) async {
    await Api.instance.toggleSave(c.slug);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved list updated')));
    }
  }

  Future<void> _toggleLike(CourseDetail c) async {
    await Api.instance.toggleLike(c.slug);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Liked')));
    }
  }
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
          const Text('DOWNLOADS ON SYNCOURSE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
          const SizedBox(height: 6),
          Text('$total total · $last30 last 30 days · $last7 last 7 days · $today today',
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
        title: Text(section.title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text('${section.lessons.length} lessons · ${section.durationText}',
            style: const TextStyle(fontSize: 12, color: AppColors.muted)),
        children: [
          for (final l in section.lessons)
            ListTile(
              dense: true,
              leading: Icon(l.type == 'video' ? Icons.play_circle_outline : Icons.description_outlined, size: 20),
              title: Text(l.title, style: const TextStyle(fontSize: 13)),
              subtitle: Text(l.durationText, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              onTap: () => Navigator.pushNamed(context, '/courses/$slug/lessons/${l.id}'),
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
              CircleAvatar(radius: 12, child: Text(review.userName.characters.first)),
              const SizedBox(width: 8),
              Expanded(child: Text(review.userName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
              if (review.isStaff)
                Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('EDITORIAL', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.accent)),
                ),
            ],
          ),
          if (review.body != null) ...[
            const SizedBox(height: 4),
            Text(review.body!, style: const TextStyle(fontSize: 13, color: Colors.white70)),
          ],
          const SizedBox(height: 4),
          Text('${review.replyCount} replies', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
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
        return Icon(filled ? Icons.star : Icons.star_border, size: 14, color: Colors.amber);
      }),
    );
  }
}
