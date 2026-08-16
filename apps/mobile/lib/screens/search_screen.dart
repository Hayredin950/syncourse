import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<CourseSummary> _results = const [];
  bool _loading = false;
  String? _error;
  List<String> _trending = const [];

  @override
  void initState() {
    super.initState();
    _loadTrending();
  }

  Future<void> _loadTrending() async {
    try {
      final t = await Api.instance.trendingSearches();
      if (mounted) setState(() => _trending = t);
    } catch (_) {}
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) {
      setState(() {
        _results = const [];
        _loading = false;
      });
      return;
    }
    setState(() => _loading = true);
    try {
      final r = await Api.instance.search(q.trim());
      if (mounted) {
        setState(() {
          _results = r;
          _loading = false;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          onChanged: _onChanged,
          decoration: const InputDecoration(
            hintText: 'Search courses, lecturers, tags…',
            border: InputBorder.none,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.mic_none),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Voice search coming soon')),
              );
            },
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text('Error: $_error'));
    if (_controller.text.trim().isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Everyone is searching', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final t in _trending)
                ActionChip(
                  label: Text(t),
                  onPressed: () {
                    _controller.text = t;
                    _search(t);
                  },
                ),
            ],
          ),
        ],
      );
    }
    if (_results.isEmpty) return const Center(child: Text('No results'));
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _results.length,
      separatorBuilder: (_, __) => const Divider(height: 20),
      itemBuilder: (context, i) {
        final c = _results[i];
        return ListTile(
          contentPadding: EdgeInsets.zero,
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: c.thumbnailUrl == null
              ? Container(width: 48, height: 48, color: AppColors.surface, child: const Icon(Icons.play_circle_outline, color: AppColors.muted))
              : Image.network(c.thumbnailUrl!, width: 48, height: 48, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(width: 48, height: 48, color: AppColors.surface)),
        ),
        title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(c.durationText.isEmpty ? c.level : '${c.level} · ${c.durationText}', style: const TextStyle(fontSize: 12)),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.star, size: 14, color: Colors.amber),
              const SizedBox(width: 2),
              Text('${c.ratingAvg.toStringAsFixed(1)}', style: const TextStyle(fontSize: 12)),
              const SizedBox(width: 8),
              const Icon(Icons.bookmark_border, size: 18),
            ],
          ),
          onTap: () => Navigator.pushNamed(context, '/courses/${c.slug}'),
        );
      },
    );
  }
}
