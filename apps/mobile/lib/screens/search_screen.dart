import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Global search, mirroring the web's five tabs: Everything, Courses,
/// Resources, People and Channels. Trending chips sit under an empty box.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();
  Timer? _debounce;
  String _kind = 'all';
  String _query = '';
  SearchResult? _data;
  bool _loading = false;
  String? _error;
  List<String> _trending = const [];

  @override
  void initState() {
    super.initState();
    Api.trendingSearches().then((rows) {
      if (mounted) setState(() => _trending = rows);
    }).catchError((_) {
      // Trending chips are decoration; an empty row is fine.
    });
  }

  bool _argsRead = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_argsRead) return;
    _argsRead = true;
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map && args['q'] is String) {
      final q = args['q'] as String;
      if (q.trim().isNotEmpty) {
        _controller.text = q;
        _run(q.trim(), _kind);
      }
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _run(value.trim(), _kind);
    });
  }

  Future<void> _run(String query, String kind) async {
    if (query.length < 2) {
      setState(() {
        _query = query;
        _data = null;
        _loading = false;
        _error = null;
      });
      return;
    }
    setState(() {
      _query = query;
      _kind = kind;
      _loading = true;
      _error = null;
    });
    try {
      final data = await Api.search(query, type: kind);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 10, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      focusNode: _focus,
                      autofocus: true,
                      textInputAction: TextInputAction.search,
                      onChanged: _onChanged,
                      onSubmitted: (v) => _run(v.trim(), _kind),
                      style:
                          const TextStyle(fontSize: 15, color: AppColors.text),
                      decoration: InputDecoration(
                        hintText: 'Search courses, lecturers, tags…',
                        prefixIcon: const Icon(Icons.search,
                            size: 19, color: AppColors.dim),
                        suffixIcon: _controller.text.isEmpty
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.close, size: 17),
                                onPressed: () {
                                  _controller.clear();
                                  _run('', _kind);
                                },
                              ),
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 13),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Voice search',
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                              'Voice search is available in the web app today.'),
                        ),
                      );
                    },
                    color: AppColors.ink3,
                    icon: const Icon(Icons.mic_none, size: 21),
                  ),
                ],
              ),
            ),
            if (_query.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: PillTabs(
                  items: const [
                    (value: 'all', label: 'Everything'),
                    (value: 'courses', label: 'Courses'),
                    (value: 'resources', label: 'Resources'),
                    (value: 'people', label: 'People'),
                    (value: 'channels', label: 'Channels'),
                  ],
                  value: _kind,
                  onChanged: (kind) => _run(_query, kind),
                ),
              ),
            const SizedBox(height: 6),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return LoadError(message: _error!, onRetry: () => _run(_query, _kind));
    }
    if (_query.isEmpty) {
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 120),
        children: [
          if (_trending.isNotEmpty) ...[
            const Text(
              'Everyone is searching',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink1),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 9,
              children: [
                for (final t in _trending)
                  GestureDetector(
                    onTap: () {
                      _controller.text = t;
                      _run(t, _kind);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 9),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceSunk,
                        border: Border.all(color: AppColors.border),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(t,
                          style: const TextStyle(
                              fontSize: 12.5, color: AppColors.ink3)),
                    ),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 26),
          const Text(
            'Search everything',
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppColors.ink1),
          ),
          const SizedBox(height: 6),
          const Text(
            'One box finds courses, cheat-sheets, instructors and channels. A question with a few words in it belongs in Ask.',
            style:
                TextStyle(fontSize: 12.5, height: 1.55, color: AppColors.dim),
          ),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/ask'),
            icon: const Icon(Icons.auto_awesome, size: 15),
            label: const Text('Ask the study assistant'),
          ),
        ],
      );
    }
    final data = _data;
    if (data == null || data.isEmpty) {
      return const StatusView(
        icon: Icons.search_off,
        title: 'No matches yet.',
        message: 'Try a broader word, or ask the assistant in a sentence.',
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 126),
      children: [
        if (data.courses.isNotEmpty) ...[
          _ResultLabel('Courses', data.courses.length),
          for (final c in data.courses) ...[
            CourseRowTile(course: c),
            const DividerLine(indent: 0, endIndent: 0),
          ],
          const SizedBox(height: 8),
        ],
        if (data.resources.isNotEmpty) ...[
          _ResultLabel('Resources', data.resources.length),
          for (final r in data.resources) _ResourceHit(resource: r),
          const SizedBox(height: 8),
        ],
        if (data.lecturers.isNotEmpty) ...[
          _ResultLabel('People', data.lecturers.length),
          for (final l in data.lecturers)
            _EntityHit(
              kind: 'Person',
              name: l['name'] as String? ?? '',
              imageUrl: l['photoUrl'] as String?,
              onTap: () =>
                  Navigator.pushNamed(context, '/lecturers/${l['slug']}'),
            ),
          const SizedBox(height: 8),
        ],
        if (data.organizations.isNotEmpty) ...[
          _ResultLabel('Channels', data.organizations.length),
          for (final o in data.organizations)
            _EntityHit(
              kind: 'Channel',
              name: o['name'] as String? ?? '',
              imageUrl: o['logoUrl'] as String?,
              onTap: () =>
                  Navigator.pushNamed(context, '/organizations/${o['slug']}'),
            ),
        ],
      ],
    );
  }
}

class _ResultLabel extends StatelessWidget {
  const _ResultLabel(this.label, this.count);
  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16, bottom: 4),
      child: Row(
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .9,
                  color: AppColors.accent)),
          const SizedBox(width: 6),
          Text('$count',
              style: const TextStyle(fontSize: 10.5, color: AppColors.dim)),
        ],
      ),
    );
  }
}

class _ResourceHit extends StatelessWidget {
  const _ResourceHit({required this.resource});
  final ResourceSummary resource;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/resources/${resource.slug}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            CoverPlate(
              seed: resource.slug,
              imageUrl: resource.coverUrl,
              width: 48,
              height: 48,
              radius: 8,
              glyph: '📄',
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(resource.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink1)),
                  const SizedBox(height: 3),
                  Text(
                    '${resource.typeLabel} · ${resource.readMinutes} min',
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

class _EntityHit extends StatelessWidget {
  const _EntityHit({
    required this.kind,
    required this.name,
    required this.imageUrl,
    required this.onTap,
  });

  final String kind, name;
  final String? imageUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            CoverPlate(
              seed: name,
              imageUrl: imageUrl,
              width: 44,
              height: 44,
              radius: 22,
              glyph: kind == 'Channel' ? '🏛️' : '👤',
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink1)),
            ),
            Text(kind,
                style: const TextStyle(fontSize: 10.5, color: AppColors.dim)),
            const Icon(Icons.chevron_right, size: 18, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}
