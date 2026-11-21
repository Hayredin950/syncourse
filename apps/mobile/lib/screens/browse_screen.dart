import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Browse, with the web's two-tab surface (Courses / Resources), filter sheet,
/// debounced search, content-type tabs and grid/list toggle.
class BrowseScreen extends StatefulWidget {
  const BrowseScreen({super.key});

  @override
  State<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends State<BrowseScreen> {
  static const _pageSize = 24;

  final _searchController = TextEditingController();
  Timer? _debounce;

  List<CourseSummary> _results = [];
  List<CategoryRow> _categories = [];
  int _total = 0;
  bool _loading = true;
  bool _moreBusy = false;
  String? _error;

  String _type = '';
  String _category = '';
  String _sort = 'newest';
  String _query = '';
  bool _grid = true;
  bool _initialised = false;

  @override
  void initState() {
    super.initState();
    Api.categories().then((rows) {
      if (mounted) setState(() => _categories = rows);
    }).catchError((_) {
      // The topic strip is optional; hide it rather than break the page.
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map) {
      _category = args['category'] as String? ?? '';
      _type = args['type'] as String? ?? '';
      _sort = args['sort'] as String? ?? 'newest';
      if (_category.isNotEmpty) {
        _searchController.text = '';
      }
    }
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _moreBusy = false;
    });
    try {
      final rows = await Api.browse(
        sort: _sort,
        category: _category.isEmpty ? null : _category,
        contentType: _type.isEmpty ? null : _type,
        query: _query.isEmpty ? null : _query,
        limit: _pageSize,
      );
      if (!mounted) return;
      setState(() {
        _results = rows;
        _total = rows.length;
        _loading = false;
      });
      // The endpoint reports a total; the list wrapper cannot see it, so a
      // second request is unnecessary when fewer than a page came back.
      if (rows.length == _pageSize) {
        setState(() => _moreBusy = true);
        final more = await Api.browse(
          sort: _sort,
          category: _category.isEmpty ? null : _category,
          contentType: _type.isEmpty ? null : _type,
          query: _query.isEmpty ? null : _query,
          limit: _pageSize,
          offset: rows.length,
        );
        if (!mounted) return;
        setState(() {
          _results = [...rows, ...more];
          _total = _results.length + (more.length < _pageSize ? 0 : 1);
          _moreBusy = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _query = value.trim();
      _load();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _openFilters() async {
    var type = _type;
    var category = _category;
    var sort = _sort;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheet) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Text('Filters',
                            style: TextStyle(
                                fontSize: 19, fontWeight: FontWeight.w800)),
                        const Spacer(),
                        TextButton(
                          onPressed: () {
                            setSheet(() {
                              type = '';
                              category = '';
                              sort = 'newest';
                            });
                          },
                          child: const Text('Clear all'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const _SheetLabel('SORT'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final s in const [
                          (value: 'newest', label: 'Newest'),
                          (value: 'top-rated', label: 'Top rated'),
                          (value: 'most-downloaded', label: 'Most downloaded'),
                          (value: 'a-z', label: 'A–Z'),
                        ])
                          _SheetChip(
                            label: s.label,
                            active: sort == s.value,
                            onTap: () => setSheet(() => sort = s.value),
                          ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    const _SheetLabel('TYPE'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _SheetChip(
                          label: 'All',
                          active: type.isEmpty,
                          onTap: () => setSheet(() => type = ''),
                        ),
                        _SheetChip(
                          label: 'Courses',
                          active: type == 'course',
                          onTap: () => setSheet(() => type = 'course'),
                        ),
                        _SheetChip(
                          label: 'Mini-courses',
                          active: type == 'mini-course',
                          onTap: () => setSheet(() => type = 'mini-course'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    const _SheetLabel('CATEGORY'),
                    SizedBox(
                      height: 120,
                      child: SingleChildScrollView(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _SheetChip(
                              label: 'All topics',
                              active: category.isEmpty,
                              onTap: () => setSheet(() => category = ''),
                            ),
                            for (final c in _categories)
                              _SheetChip(
                                label: c.name,
                                active: category == c.slug,
                                onTap: () => setSheet(() => category = c.slug),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Show results'),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    setState(() {
      _type = type;
      _category = category;
      _sort = sort;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final heading = _category.isNotEmpty
        ? _category.replaceAll('-', ' ')
        : _type == 'mini-course'
            ? 'Mini-courses'
            : _sort == 'top-rated'
                ? 'Top rated'
                : 'Courses';

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            const SyncourseHeader(title: 'Browse'),
            _BrowseTabs(
              onCourses: () {},
              onResources: () => Navigator.pushNamed(context, '/resources'),
            ),
            SizedBox(
              height: 66,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          Text(
                            _moreBusy
                                ? 'LOADING MORE…'
                                : '${_category.isNotEmpty ? 'TOPIC INDEX' : 'LIBRARY INDEX'} · $_total COURSES',
                            style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                                color: AppColors.accent),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            heading[0].toUpperCase() + heading.substring(1),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 27,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.9,
                                color: AppColors.text),
                          ),
                        ],
                      ),
                    ),
                    OutlinedButton.icon(
                      onPressed: _openFilters,
                      icon: const Icon(Icons.tune, size: 15),
                      label: const Text('Filters'),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 13, vertical: 8),
                        textStyle: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 4),
            PillTabs(
              items: const [
                (value: '', label: 'All'),
                (value: 'course', label: 'Courses'),
                (value: 'mini-course', label: 'Mini-courses'),
              ],
              value: _type,
              onChanged: (v) {
                setState(() => _type = v);
                _load();
              },
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: TextField(
                controller: _searchController,
                onChanged: _onQueryChanged,
                style: const TextStyle(fontSize: 13, color: AppColors.text),
                decoration: InputDecoration(
                  hintText: 'Search courses as you type…',
                  prefixIcon:
                      const Icon(Icons.search, size: 18, color: AppColors.dim),
                  suffixIcon: _query.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.close, size: 16),
                          onPressed: () {
                            _searchController.clear();
                            _query = '';
                            _load();
                          },
                        ),
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                ),
              ),
            ),
            SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                children: [
                  for (final c in _categories.take(8))
                    Padding(
                      padding: const EdgeInsets.only(right: 7),
                      child: GestureDetector(
                        onTap: () {
                          setState(() =>
                              _category = _category == c.slug ? '' : c.slug);
                          _load();
                        },
                        child: _Pill(
                          label: c.name,
                          active: _category == c.slug,
                        ),
                      ),
                    ),
                  GestureDetector(
                    onTap: () => setState(() => _grid = !_grid),
                    child: _Pill(
                      label: _grid ? 'Grid' : 'List',
                      icon: Icons.view_module_outlined,
                      active: false,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(child: _body()),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return LoadError(message: _error!, onRetry: _load);
    }
    if (_results.isEmpty) {
      return StatusView(
        icon: Icons.search_off,
        title: 'No courses match that search.',
        message: 'Try a broader topic or clear your filters.',
        actionLabel: 'Clear filters',
        onAction: () {
          _searchController.clear();
          setState(() {
            _query = '';
            _category = '';
            _type = '';
            _sort = 'newest';
          });
          _load();
        },
      );
    }
    if (_grid) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final columns = constraints.maxWidth > 520 ? 3 : 2;
          final cellWidth =
              (constraints.maxWidth - 32 - 12 * (columns - 1)) / columns;
          return GridView.builder(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 126),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: columns,
              mainAxisSpacing: 22,
              crossAxisSpacing: 12,
              childAspectRatio: .54,
            ),
            itemCount: _results.length,
            itemBuilder: (_, i) => CoursePoster(
              course: _results[i],
              width: cellWidth,
            ),
          );
        },
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 126),
      itemCount: _results.length,
      separatorBuilder: (_, __) => const DividerLine(indent: 0, endIndent: 0),
      itemBuilder: (_, i) => CourseRowTile(course: _results[i]),
    );
  }
}

class _BrowseTabs extends StatelessWidget {
  const _BrowseTabs({required this.onCourses, required this.onResources});
  final VoidCallback onCourses, onResources;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunk,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: onCourses,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: AppColors.border),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.menu_book_outlined,
                        size: 14, color: AppColors.accent),
                    SizedBox(width: 6),
                    Text('Courses',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.ink1)),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: GestureDetector(
              onTap: onResources,
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.description_outlined,
                        size: 14, color: AppColors.dim),
                    SizedBox(width: 6),
                    Text('Resources',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.dim)),
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

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.active, this.icon});
  final String label;
  final bool active;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: active ? AppColors.accentSoft : AppColors.surfaceSunk,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
            color: active
                ? AppColors.accent.withValues(alpha: .45)
                : AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon,
                size: 12, color: active ? AppColors.accent : AppColors.dim),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: active ? AppColors.accent : AppColors.ink4),
          ),
        ],
      ),
    );
  }
}

class _SheetLabel extends StatelessWidget {
  const _SheetLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Text(text,
          style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.1,
              color: AppColors.dim)),
    );
  }
}

class _SheetChip extends StatelessWidget {
  const _SheetChip(
      {required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.accentSoft : AppColors.surfaceSunk,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: active
                  ? AppColors.accent.withValues(alpha: .5)
                  : AppColors.border),
        ),
        child: Text(
          label,
          style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: active ? AppColors.accent : AppColors.ink4),
        ),
      ),
    );
  }
}
