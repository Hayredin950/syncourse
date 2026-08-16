import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key});

  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> {
  String? _sort = 'top-rated';
  String? _category;
  List<String> _tags = const [];
  String _query = '';

  late Future<List<CourseSummary>> _results;

  @override
  void initState() {
    super.initState();
    _results = _load();
  }

  Future<List<CourseSummary>> _load() {
    return Api.instance.browse(
      sort: _sort,
      category: _category,
      tags: _tags,
      query: _query.isEmpty ? null : _query,
    );
  }

  void _refresh() {
    setState(() {
      _results = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Browse')),
      body: FutureBuilder<List<CourseSummary>>(
        future: _results,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final courses = snapshot.data!;
          return Column(
            children: [
              _FiltersBar(
                sort: _sort,
                category: _category,
                onChanged: (sort, category) {
                  _sort = sort;
                  _category = category;
                  _refresh();
                },
              ),
              Expanded(
                child: courses.isEmpty
                    ? const Center(child: Text('No courses match your filters'))
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: courses.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, i) => _RowCard(course: courses[i]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _FiltersBar extends StatelessWidget {
  const _FiltersBar({required this.sort, required this.category, required this.onChanged});

  final String? sort;
  final String? category;
  final void Function(String?, String?) onChanged;

  static const _sorts = ['top-rated', 'most-enrolled', 'a-z'];
  static const _sortLabels = {'top-rated': 'Top rated', 'most-enrolled': 'Most enrolled', 'a-z': 'A–Z'};

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          DropdownButton<String?>(
            value: sort,
            underline: const SizedBox.shrink(),
            items: [
              for (final s in _sorts)
                DropdownMenuItem(value: s, child: Text(_sortLabels[s]!)),
            ],
            onChanged: (v) => onChanged(v, category),
          ),
          const Spacer(),
          if (category != null)
            Chip(
              label: Text(category!),
              onDeleted: () => onChanged(sort, null),
            ),
        ],
      ),
    );
  }
}

class _RowCard extends StatelessWidget {
  const _RowCard({required this.course});

  final CourseSummary course;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/courses/${course.slug}'),
      borderRadius: BorderRadius.circular(12),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: course.thumbnailUrl == null
                ? Container(
                    width: 88,
                    height: 60,
                    color: AppColors.surface,
                    child: const Icon(Icons.play_circle_outline, color: AppColors.muted),
                  )
                : Image.network(
                    course.thumbnailUrl!,
                    width: 88,
                    height: 60,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 88,
                      height: 60,
                      color: AppColors.surface,
                      child: const Icon(Icons.play_circle_outline, color: AppColors.muted),
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(course.title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                const SizedBox(height: 2),
                Text(course.durationText.isEmpty ? course.level : '${course.level} · ${course.durationText}',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    const Icon(Icons.star, size: 12, color: Colors.amber),
                    const SizedBox(width: 2),
                    Text('${course.ratingAvg.toStringAsFixed(1)} (${course.ratingCount})', style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                  ],
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AppColors.muted),
        ],
      ),
    );
  }
}
