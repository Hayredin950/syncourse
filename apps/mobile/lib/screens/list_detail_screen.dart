import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// One collection: a fanned cover hero, the owner's controls, and the courses
/// in it. Mirrors the web's `/lists/detail` page.
class ListDetailScreen extends StatefulWidget {
  const ListDetailScreen({super.key, required this.listId});

  final String listId;

  @override
  State<ListDetailScreen> createState() => _ListDetailScreenState();
}

class _ListDetailScreenState extends State<ListDetailScreen> {
  CourseCollection? _list;
  bool _loading = true;
  bool _gone = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _gone = false;
    });
    try {
      final l = await Api.listDetail(widget.listId);
      if (!mounted) return;
      setState(() {
        _list = l;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _gone = true;
        _loading = false;
      });
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _save() async {
    final l = _list;
    if (l == null) return;
    if (await Api.loadToken() == null) {
      await Navigator.pushNamed(context, '/auth');
      if (mounted) _load();
      return;
    }
    setState(() => _busy = true);
    try {
      final r = await Api.toggleListSaved(l.id);
      final saved = r['saved'] == true;
      if (!mounted) return;
      setState(() {
        _list = CourseCollection(
          id: l.id,
          name: l.name,
          description: l.description,
          visibility: l.visibility,
          itemCount: l.itemCount,
          savesCount: l.savesCount + (saved ? 1 : -1),
          ownerName: l.ownerName,
          ownerAvatarUrl: l.ownerAvatarUrl,
          isOwner: l.isOwner,
          saved: saved,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
          covers: l.covers,
          items: l.items,
        );
        _busy = false;
      });
      _toast(saved ? 'Collection saved' : 'Collection unsaved');
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      _toast('$e');
    }
  }

  Future<void> _addCourses() async {
    final l = _list;
    if (l == null) return;
    final courses = await showModalBottomSheet<List<String>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) {
        final have = l.items.map((i) => i.id).toSet();
        return _CoursePicker(
          already: have,
          onAdd: (ids) => Navigator.pop(context, ids),
        );
      },
    );
    if (courses == null || courses.isEmpty) return;
    setState(() => _busy = true);
    try {
      final next = await Api.addListItems(l.id, courses);
      if (!mounted) return;
      setState(() {
        _list = next;
        _busy = false;
      });
      _toast(courses.length == 1
          ? 'Course added'
          : '${courses.length} courses added');
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      _toast('$e');
    }
  }

  Future<void> _rename() async {
    final l = _list;
    if (l == null) return;
    final name = TextEditingController(text: l.name);
    final description = TextEditingController(text: l.description ?? '');
    var visibility = l.visibility;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
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
              const Text('Edit collection',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 14),
              TextField(
                  controller: name,
                  decoration: const InputDecoration(hintText: 'Name')),
              const SizedBox(height: 10),
              TextField(
                  controller: description,
                  maxLines: 3,
                  decoration:
                      const InputDecoration(hintText: 'What belongs in it?')),
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
                  onPressed: () => Navigator.pop(context, true),
                  child: const Text('Save changes'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (ok == true) {
      try {
        final next = await Api.updateList(l.id,
            name: name.text.trim(),
            description: description.text.trim(),
            visibility: visibility);
        if (!mounted) return;
        setState(() => _list = next);
        _toast('Collection updated');
      } catch (e) {
        _toast('$e');
      }
    }
    name.dispose();
    description.dispose();
  }

  Future<void> _remove(MyLearningItem item) async {
    final l = _list;
    if (l == null) return;
    try {
      final next = await Api.removeListItem(l.id, item.id);
      if (!mounted) return;
      setState(() => _list = next);
      _toast('Removed ${item.title}');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _delete() async {
    final l = _list;
    if (l == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete “${l.name}”?'),
        content: Text(
            'The list and its ordering go. All ${l.itemCount} course${l.itemCount == 1 ? '' : 's'} in it stay in the catalogue.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete list')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.deleteList(l.id);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      _toast('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _gone || _list == null
                ? Column(
                    children: [
                      SyncourseHeader(showBack: true, title: 'Collection'),
                      Expanded(
                        child: StatusView(
                          icon: Icons.lock_outline,
                          title: 'This collection is private',
                          message: 'It may have been removed or set private.',
                          actionLabel: 'Browse collections',
                          onAction: () =>
                              Navigator.pushReplacementNamed(context, '/lists'),
                        ),
                      ),
                    ],
                  )
                : _body(_list!),
      ),
    );
  }

  Widget _body(CourseCollection l) {
    final covers =
        l.items.map((i) => i.thumbnailUrl).whereType<String>().take(4).toList();
    return RefreshIndicator(
      onRefresh: _load,
      color: AppColors.accent,
      backgroundColor: AppColors.surface,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          SyncourseHeader(showBack: true, title: 'Collection'),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Stack(
                children: [
                  if (covers.isNotEmpty)
                    SizedBox(
                      height: 230,
                      child: Row(
                        children: [
                          for (final c in covers)
                            Expanded(
                              child: CoverPlate(
                                seed: c,
                                imageUrl: c,
                                height: 230,
                                width: double.infinity,
                                radius: 0,
                                glyph: '🎓',
                              ),
                            ),
                        ],
                      ),
                    )
                  else
                    const CoverPlate(
                      seed: 'collection',
                      imageUrl: null,
                      height: 200,
                      radius: 0,
                      glyph: '📚',
                    ),
                  if (covers.isNotEmpty)
                    const Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Color(0x55000000), Color(0xF20E0E0D)],
                          ),
                        ),
                      ),
                    ),
                  Positioned(
                    left: 16,
                    right: 16,
                    bottom: 14,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('COLLECTION',
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1,
                                color: AppColors.accent)),
                        const SizedBox(height: 5),
                        Text(l.name,
                            style: const TextStyle(
                                fontSize: 27,
                                height: 1.1,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -1,
                                color: Colors.white)),
                        if (l.description != null &&
                            l.description!.isNotEmpty) ...[
                          const SizedBox(height: 7),
                          Text(l.description!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12,
                                  height: 1.5,
                                  color: AppColors.ink3)),
                        ],
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 5,
                          children: [
                            _Chip(
                                icon: Icons.person_outline,
                                text: l.ownerName ?? 'Unknown'),
                            _Chip(
                                icon: l.visibility == 'public'
                                    ? Icons.public
                                    : Icons.lock_outline,
                                text: l.visibility == 'public'
                                    ? 'Public'
                                    : 'Private'),
                            _Chip(
                                icon: Icons.layers_outlined,
                                text:
                                    '${l.itemCount} course${l.itemCount == 1 ? '' : 's'}'),
                            _Chip(
                                icon: Icons.bookmark_border,
                                text:
                                    '${l.savesCount} save${l.savesCount == 1 ? '' : 's'}'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: _busy
                ? const LinearProgressIndicator(
                    minHeight: 2, color: AppColors.accent)
                : Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: l.isOwner
                        ? [
                            FilledButton.icon(
                              onPressed: _addCourses,
                              icon: const Icon(Icons.add, size: 16),
                              label: const Text('Add courses'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _rename,
                              icon: const Icon(Icons.edit, size: 14),
                              label: const Text('Edit'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _delete,
                              icon: const Icon(Icons.delete_outline,
                                  size: 14, color: AppColors.danger),
                              label: const Text('Delete',
                                  style: TextStyle(color: AppColors.danger)),
                            ),
                          ]
                        : [
                            FilledButton.icon(
                              onPressed: _save,
                              icon: Icon(
                                  l.saved ? Icons.check : Icons.bookmark_border,
                                  size: 15),
                              label:
                                  Text(l.saved ? 'Saved' : 'Save collection'),
                            ),
                          ],
                  ),
          ),
          const SectionHead(
            title: 'In this collection',
            subtitle: 'Newest addition first',
          ),
          if (l.items.isEmpty)
            const StatusView(
              icon: Icons.library_books_outlined,
              title: 'This collection is empty',
              message:
                  'Its owner has not added anything yet — check back soon.',
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  for (final item in l.items) ...[
                    _ItemRow(
                      item: item,
                      canRemove: l.isOwner,
                      onRemove: () => _remove(item),
                    ),
                    const DividerLine(indent: 0, endIndent: 0),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({
    required this.item,
    required this.canRemove,
    required this.onRemove,
  });

  final MyLearningItem item;
  final bool canRemove;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/courses/${item.slug}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            CoverPlate(
              seed: item.slug,
              imageUrl: item.thumbnailUrl,
              width: 74,
              height: 52,
              radius: 8,
              glyph: '🎓',
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14,
                          height: 1.25,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink1)),
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (item.isPremium) 'Premium',
                      if (item.level != null) item.level!,
                      if (item.lessonCount > 0)
                        '${item.lessonCount} lesson${item.lessonCount == 1 ? '' : 's'}',
                    ].join(' · '),
                    style: const TextStyle(fontSize: 11, color: AppColors.dim),
                  ),
                ],
              ),
            ),
            if (canRemove)
              IconButton(
                tooltip: 'Remove from collection',
                onPressed: onRemove,
                icon: const Icon(Icons.close, size: 17, color: AppColors.dim),
              )
            else
              const Icon(Icons.chevron_right, size: 18, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: .35),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: AppColors.ink3),
          const SizedBox(width: 4),
          Text(text,
              style: const TextStyle(fontSize: 10, color: AppColors.ink3)),
        ],
      ),
    );
  }
}

class _CoursePicker extends StatefulWidget {
  const _CoursePicker({required this.already, required this.onAdd});
  final Set<String> already;
  final ValueChanged<List<String>> onAdd;

  @override
  State<_CoursePicker> createState() => _CoursePickerState();
}

class _CoursePickerState extends State<_CoursePicker> {
  final _search = TextEditingController();
  List<CourseSummary> _courses = const [];
  final _picked = <String>{};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await Api.browse(limit: 100, sort: 'top-rated');
      if (mounted) {
        setState(() {
          _courses = rows.where((c) => !widget.already.contains(c.id)).toList();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.text.trim().toLowerCase();
    final shown = q.isEmpty
        ? _courses
        : _courses.where((c) => c.title.toLowerCase().contains(q)).toList();
    return SizedBox(
      height: MediaQuery.of(context).size.height * .82,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Add courses',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Search the catalogue',
                prefixIcon: Icon(Icons.search, size: 18, color: AppColors.dim),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView.builder(
                      itemCount: shown.length,
                      itemBuilder: (context, i) {
                        final c = shown[i];
                        final on = _picked.contains(c.id);
                        return CheckboxListTile(
                          value: on,
                          activeColor: AppColors.accent,
                          contentPadding: EdgeInsets.zero,
                          title: Text(c.title,
                              style: const TextStyle(fontSize: 13.5)),
                          subtitle: Text(
                            [c.level, c.durationText]
                                .where((e) => e.isNotEmpty)
                                .join(' · '),
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.dim),
                          ),
                          onChanged: (v) => setState(() {
                            if (v == true) {
                              _picked.add(c.id);
                            } else {
                              _picked.remove(c.id);
                            }
                          }),
                        );
                      },
                    ),
            ),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _picked.isEmpty
                    ? null
                    : () => widget.onAdd(_picked.toList()),
                child: Text(
                    'Add ${_picked.isEmpty ? '' : '${_picked.length} '}course${_picked.length == 1 ? '' : 's'}'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
