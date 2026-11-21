import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// Collections, matching the web `/lists` surface: community shelves you can
/// borrow, your own shelves first when signed in, search, sort and a creator.
class ListsScreen extends StatefulWidget {
  const ListsScreen({super.key});

  @override
  State<ListsScreen> createState() => _ListsScreenState();
}

class _ListsScreenState extends State<ListsScreen> {
  final _search = TextEditingController();
  bool _signedIn = false;
  List<CourseCollection> _public = [];
  List<CourseCollection> _mine = [];
  bool _loading = true;
  String? _error;
  String _sort = 'top';

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    _signedIn = (await Api.loadToken()) != null;
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await Api.browseLists(sort: _sort, limit: 30);
      final mine = _signedIn ? await Api.myLists() : <CourseCollection>[];
      if (!mounted) return;
      setState(() {
        _public = rows;
        _mine = mine;
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

  Future<void> _create() async {
    if (!_signedIn) {
      Navigator.pushNamed(context, '/auth');
      return;
    }
    final name = TextEditingController();
    final description = TextEditingController();
    var visibility = 'private';
    final ok = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.surface,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('New collection',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(
                controller: name,
                autofocus: true,
                decoration: const InputDecoration(hintText: 'Collection name'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: description,
                maxLines: 2,
                decoration:
                    const InputDecoration(hintText: 'What belongs in it?'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  ChoiceChip(
                    label: const Text('Private'),
                    selected: visibility == 'private',
                    onSelected: (_) => setSheet(() => visibility = 'private'),
                  ),
                  const SizedBox(width: 8),
                  ChoiceChip(
                    label: const Text('Public'),
                    selected: visibility == 'public',
                    onSelected: (_) => setSheet(() => visibility = 'public'),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () async {
                    if (name.text.trim().isEmpty) return;
                    try {
                      await Api.createList(name.text.trim(),
                          visibility: visibility);
                      if (context.mounted) Navigator.pop(context, true);
                    } catch (e) {
                      if (context.mounted) {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(content: Text('$e')));
                      }
                    }
                  },
                  child: const Text('Create collection'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    name.dispose();
    description.dispose();
    if (ok == true) _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final shown = _public
        .where((l) =>
            query.isEmpty ||
            l.name.toLowerCase().contains(query) ||
            (l.ownerName ?? '').toLowerCase().contains(query))
        .toList();

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 126),
            children: [
              const SyncourseHeader(title: 'Collections'),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('COLLECTIONS',
                              style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1.1,
                                  color: AppColors.accent)),
                          SizedBox(height: 3),
                          Text('Course lists',
                              style: TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.9,
                                  color: AppColors.text)),
                          SizedBox(height: 3),
                          Text(
                            'Browse lists made by people who learn with intent.',
                            style:
                                TextStyle(fontSize: 12.5, color: AppColors.dim),
                          ),
                        ],
                      ),
                    ),
                    TextButton.icon(
                      onPressed: _create,
                      icon: const Icon(Icons.add, size: 16),
                      label: const Text('New list'),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                child: TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  style: const TextStyle(fontSize: 13),
                  decoration: const InputDecoration(
                    hintText: 'Search lists or creators',
                    prefixIcon:
                        Icon(Icons.search, size: 18, color: AppColors.dim),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              PillTabs(
                items: const [
                  (value: 'top', label: 'All topics'),
                  (value: 'most-saved', label: 'Top saved'),
                  (value: 'newest', label: 'Newest'),
                ],
                value: _sort,
                onChanged: (v) {
                  setState(() => _sort = v);
                  _load();
                },
              ),
              if (_signedIn && _mine.isNotEmpty) ...[
                const SectionHead(title: 'My lists'),
                for (final l in _mine)
                  _ListRow(
                    list: l,
                    mine: true,
                    onTap: () => Navigator.pushNamed(context, '/lists/${l.id}'),
                  ),
              ],
              const SectionHead(title: 'Public shelves'),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(40),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                LoadError(message: _error!, onRetry: _load)
              else if (shown.isEmpty)
                const StatusView(
                  icon: Icons.collections_bookmark_outlined,
                  title: 'No collections yet',
                  message:
                      'Someone has to build the first shelf. Start one and keep it private or share it.',
                )
              else
                for (final l in shown)
                  _ListRow(
                    list: l,
                    onTap: () => Navigator.pushNamed(context, '/lists/${l.id}'),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ListRow extends StatelessWidget {
  const _ListRow({required this.list, required this.onTap, this.mine = false});
  final CourseCollection list;
  final VoidCallback onTap;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          children: [
            SizedBox(
              width: 88,
              height: 64,
              child: Row(
                children: [
                  for (var i = 0; i < (list.covers.isEmpty ? 1 : 3); i++)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 3),
                        child: CoverPlate(
                          seed: list.covers.isEmpty ? list.id : list.covers[i],
                          imageUrl: list.covers.isEmpty ? null : list.covers[i],
                          width: 28,
                          height: 64,
                          radius: 5,
                          glyph: '🎓',
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(list.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink1)),
                  const SizedBox(height: 3),
                  Text(
                    '${list.itemCount} courses · ${list.savesCount} saves'
                    '${list.ownerName != null ? ' · by ${list.ownerName}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.dim),
                  ),
                ],
              ),
            ),
            if (mine)
              Icon(
                list.visibility == 'public' ? Icons.public : Icons.lock_outline,
                size: 15,
                color: AppColors.dim,
              ),
            const SizedBox(width: 6),
            const Icon(Icons.chevron_right, size: 19, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}
