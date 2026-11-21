import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// `/circles` — the study circles surface. Two panes, exactly like the web:
/// the activity feed from people you follow, and the circles themselves with
/// their wall and member list.
class CirclesScreen extends StatefulWidget {
  const CirclesScreen({super.key});

  @override
  State<CirclesScreen> createState() => _CirclesScreenState();
}

class _CirclesScreenState extends State<CirclesScreen> {
  String _pane = 'activity';
  bool _signedIn = false;

  List<CircleRow> _circles = const [];
  bool _circlesLoading = true;
  bool _circlesFailed = false;
  String _query = '';

  List<ActivityFeedItem> _feed = const [];
  int _followingCount = 0;
  bool _feedLoading = true;
  bool _feedFailed = false;

  CircleDetail? _selected;
  bool _circleLoading = false;

  @override
  void initState() {
    super.initState();
    _loadCircles();
    _loadFeed();
  }

  Future<void> _loadCircles() async {
    setState(() {
      _circlesLoading = true;
      _circlesFailed = false;
    });
    try {
      final rows = await Api.circles();
      if (!mounted) return;
      setState(() {
        _circles = rows.map(CircleRow.fromJson).toList();
        _circlesLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _circlesFailed = true;
        _circlesLoading = false;
      });
    }
  }

  Future<void> _loadFeed() async {
    final token = await Api.loadToken();
    _signedIn = token != null;
    if (!_signedIn) {
      if (!mounted) return;
      setState(() {
        _feedLoading = false;
        _feedFailed = false;
      });
      return;
    }
    setState(() {
      _feedLoading = true;
      _feedFailed = false;
    });
    try {
      final data = await Api.activityFeed();
      if (!mounted) return;
      setState(() {
        _feed = ((data['items'] as List?) ?? [])
            .map((e) =>
                ActivityFeedItem.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
        _followingCount = (data['followingCount'] as num?)?.toInt() ?? 0;
        _feedLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _feedFailed = true;
        _feedLoading = false;
      });
    }
  }

  Future<void> _openCircle(String id) async {
    setState(() {
      _pane = 'circle';
      _circleLoading = true;
    });
    try {
      final data = await Api.circleDetail(id);
      if (!mounted) return;
      setState(() {
        _selected = CircleDetail.fromJson(data);
        _circleLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _circleLoading = false);
      _toast('$e');
    }
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<bool> _requireSignIn() async {
    if (await Api.loadToken() != null) return true;
    if (!mounted) return false;
    await Navigator.pushNamed(context, '/auth');
    if (!mounted) return false;
    final ok = await Api.loadToken() != null;
    if (ok) {
      _loadFeed();
      _loadCircles();
      if (_selected != null) _openCircle(_selected!.id);
    }
    return ok;
  }

  Future<void> _toggleJoin() async {
    final c = _selected;
    if (c == null) return;
    if (!await _requireSignIn()) return;
    try {
      if (c.joined) {
        await Api.leaveCircle(c.id);
        _toast('Left ${c.name}');
      } else {
        await Api.joinCircle(c.id);
        _toast('Joined ${c.name}');
      }
      await _openCircle(c.id);
      _loadCircles();
      _loadFeed();
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _createCircle() async {
    if (!await _requireSignIn()) return;
    final name = TextEditingController();
    final description = TextEditingController();
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _circles.isEmpty ? 'Start your first circle' : 'Start a circle',
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            const Text(
              'A circle is a small room: a wall, a member list, and the courses you point each other at.',
              style: TextStyle(fontSize: 11.5, color: AppColors.dim),
            ),
            const SizedBox(height: 16),
            const _FieldLabel('Name'),
            TextField(
              controller: name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                  hintText: 'e.g. Full-Stack Study Group'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            const _FieldLabel('Description'),
            TextField(
              controller: description,
              maxLines: 3,
              decoration: const InputDecoration(
                  hintText: 'What will this circle study together?'),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Create circle'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
    if (ok == true) {
      try {
        final detail =
            await Api.createCircle(name.text.trim(), description.text.trim());
        if (!mounted) return;
        setState(() {
          _selected = CircleDetail.fromJson(detail);
          _pane = 'circle';
        });
        _loadCircles();
        _toast('Circle created');
      } catch (e) {
        _toast('$e');
      }
    }
    name.dispose();
    description.dispose();
  }

  Future<void> _editCircle() async {
    final c = _selected;
    if (c == null) return;
    final name = TextEditingController(text: c.name);
    final description = TextEditingController(text: c.description ?? '');
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Edit circle',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            const _FieldLabel('Name'),
            TextField(controller: name),
            const SizedBox(height: 12),
            const _FieldLabel('Description'),
            TextField(controller: description, maxLines: 3),
            const SizedBox(height: 20),
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
    );
    if (ok == true) {
      try {
        await Api.updateCircle(c.id,
            name: name.text.trim(), description: description.text.trim());
        await _openCircle(c.id);
        _loadCircles();
        _toast('Circle updated');
      } catch (e) {
        _toast('$e');
      }
    }
    name.dispose();
    description.dispose();
  }

  Future<void> _deleteCircle() async {
    final c = _selected;
    if (c == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete “${c.name}”?'),
        content: const Text(
            'The wall and the membership go with it. Nobody is removed from the courses they found here.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete circle')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.deleteCircle(c.id);
      if (!mounted) return;
      setState(() {
        _selected = null;
        _pane = 'circles';
      });
      _loadCircles();
      _toast('Circle deleted');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _post(String body) async {
    final c = _selected;
    if (c == null) return;
    try {
      final next = await Api.createCirclePost(c.id, body);
      if (!mounted) return;
      setState(() => _selected = CircleDetail.fromJson(next));
      _loadCircles();
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _deletePost(String postId) async {
    final c = _selected;
    if (c == null) return;
    try {
      final next = await Api.deleteCirclePost(c.id, postId);
      if (!mounted) return;
      setState(() => _selected = CircleDetail.fromJson(next));
      _loadCircles();
      _toast('Post removed');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _removeMember(String memberId, String name) async {
    final c = _selected;
    if (c == null) return;
    try {
      final next = await Api.removeCircleMember(c.id, memberId);
      if (!mounted) return;
      setState(() => _selected = CircleDetail.fromJson(next));
      _loadCircles();
      _toast('Removed $name');
    } catch (e) {
      _toast('$e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async {
            await Future.wait([_loadCircles(), _loadFeed()]);
            if (_selected != null) await _openCircle(_selected!.id);
          },
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              SyncourseHeader(
                title: 'Circles',
                showBack: Navigator.canPop(context),
              ),
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 2, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('STUDY CIRCLES',
                        style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                            color: AppColors.accent)),
                    SizedBox(height: 5),
                    Text('Learn in public.\nKeep the signal.',
                        style: TextStyle(
                            fontSize: 30,
                            height: 1.06,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1.1,
                            color: AppColors.text)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: PillTabs(
                  value: _pane,
                  onChanged: (v) => setState(() => _pane = v),
                  items: const [
                    (value: 'activity', label: 'Activity'),
                    (value: 'circles', label: 'Circles'),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              if (_pane == 'activity') _activityPane() else _circlesPane(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _activityPane() {
    if (!_signedIn) {
      return _Panel(
        icon: Icons.groups_outlined,
        title: 'Follow people to see what they are learning.',
        body:
            'Your activity feed fills in as your circle grows — the courses and reviews of the people you follow.',
        primaryLabel: 'Sign in',
        onPrimary: () async {
          await _requireSignIn();
        },
        secondaryLabel: 'Browse circles',
        onSecondary: () => setState(() => _pane = 'circles'),
      );
    }
    if (_feedLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 50),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_feedFailed) {
      return _Panel(
        icon: Icons.cloud_off_outlined,
        title: 'Your feed did not load',
        body: 'The circles are still there — try again.',
        primaryLabel: 'Try again',
        onPrimary: _loadFeed,
      );
    }
    if (_feed.isEmpty) {
      return _Panel(
        icon: Icons.groups_outlined,
        title: 'Your feed is quiet.',
        body:
            'Follow ${_followingCount > 0 ? 'more people or join' : 'people or join'} a circle to see their learning activity here.',
        primaryLabel: 'Browse circles',
        onPrimary: () => setState(() => _pane = 'circles'),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(15, 14, 15, 8),
              child: Row(
                children: [
                  Text('From your circles · ${_feed.length}',
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
            for (var i = 0; i < _feed.length; i++) ...[
              if (i > 0) const Divider(height: 1, color: AppColors.border),
              _FeedRow(
                item: _feed[i],
                onOpenCourse: (slug) =>
                    Navigator.pushNamed(context, '/courses/$slug'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _circlesPane() {
    final q = _query.trim().toLowerCase();
    final shown = q.isEmpty
        ? _circles
        : _circles
            .where((c) =>
                c.name.toLowerCase().contains(q) ||
                (c.description ?? '').toLowerCase().contains(q))
            .toList();
    final selected = _selected;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextField(
            onChanged: (v) => setState(() => _query = v),
            style: const TextStyle(fontSize: 13),
            decoration: const InputDecoration(
              hintText: 'Search circles…',
              prefixIcon: Icon(Icons.search, size: 18, color: AppColors.dim),
              contentPadding:
                  EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _createCircle,
              icon: const Icon(Icons.add, size: 16),
              label: Text(
                  _circles.isEmpty ? 'Start your first circle' : 'New circle'),
            ),
          ),
        ),
        if (_circlesLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_circlesFailed)
          LoadError(
            message: 'The circles did not load.',
            onRetry: _loadCircles,
          )
        else if (shown.isEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Text(
              _circles.isEmpty
                  ? 'No circles yet — start one.'
                  : 'No circles match “$_query”.',
              style: const TextStyle(fontSize: 11.5, color: AppColors.dim),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(16),
              ),
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (var i = 0; i < shown.length; i++) ...[
                    if (i > 0)
                      const Divider(height: 1, color: AppColors.border),
                    _CircleRowTile(
                      circle: shown[i],
                      active: selected?.id == shown[i].id,
                      onTap: () => _openCircle(shown[i].id),
                      onEdit: shown[i].isOwner
                          ? () async {
                              await _openCircle(shown[i].id);
                              if (mounted) _editCircle();
                            }
                          : null,
                      onDelete: shown[i].isOwner
                          ? () async {
                              await _openCircle(shown[i].id);
                              if (mounted) _deleteCircle();
                            }
                          : null,
                    ),
                  ],
                ],
              ),
            ),
          ),
        if (_circleLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (selected != null)
          _CirclePane(
            key: ValueKey(selected.id),
            circle: selected,
            onToggleJoin: _toggleJoin,
            onEdit: _editCircle,
            onDelete: _deleteCircle,
            onPost: _post,
            onDeletePost: _deletePost,
            onRemoveMember: _removeMember,
            onOpenCourse: (slug) =>
                Navigator.pushNamed(context, '/courses/$slug'),
          )
        else
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 22, 16, 0),
            child: _EmptyCirclePanel(),
          ),
      ],
    );
  }
}

class _CirclePane extends StatefulWidget {
  const _CirclePane({
    super.key,
    required this.circle,
    required this.onToggleJoin,
    required this.onEdit,
    required this.onDelete,
    required this.onPost,
    required this.onDeletePost,
    required this.onRemoveMember,
    required this.onOpenCourse,
  });

  final CircleDetail circle;
  final VoidCallback onToggleJoin, onEdit, onDelete;
  final Future<void> Function(String body) onPost;
  final Future<void> Function(String postId) onDeletePost;
  final Future<void> Function(String memberId, String name) onRemoveMember;
  final ValueChanged<String> onOpenCourse;

  @override
  State<_CirclePane> createState() => _CirclePaneState();
}

class _CirclePaneState extends State<_CirclePane> {
  final _composer = TextEditingController();
  bool _posting = false;

  @override
  void dispose() {
    _composer.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _composer.text.trim();
    if (text.isEmpty || _posting) return;
    setState(() => _posting = true);
    await widget.onPost(text);
    if (!mounted) return;
    setState(() {
      _posting = false;
      _composer.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.circle;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: AppColors.accentSoft,
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: const Icon(Icons.groups,
                          size: 19, color: AppColors.accent),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.name,
                              style: const TextStyle(
                                  fontSize: 19,
                                  height: 1.15,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.3,
                                  color: AppColors.text)),
                          const SizedBox(height: 5),
                          Text(
                            '${c.memberCount} member${c.memberCount == 1 ? '' : 's'} · '
                            '${c.postCount} post${c.postCount == 1 ? '' : 's'} · '
                            'owned by ${c.ownerName}',
                            style: const TextStyle(
                                fontSize: 11.5, color: AppColors.dim),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if ((c.description ?? '').isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(c.description!,
                      style: const TextStyle(
                          fontSize: 12, height: 1.6, color: AppColors.ink4)),
                ],
                const SizedBox(height: 12),
                if (c.isOwner)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: widget.onEdit,
                        icon: const Icon(Icons.edit, size: 14),
                        label: const Text('Edit'),
                      ),
                      OutlinedButton.icon(
                        onPressed: widget.onDelete,
                        icon: const Icon(Icons.delete_outline,
                            size: 14, color: AppColors.danger),
                        label: const Text('Delete',
                            style: TextStyle(color: AppColors.danger)),
                      ),
                    ],
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: widget.onToggleJoin,
                      style: c.joined
                          ? FilledButton.styleFrom(
                              backgroundColor: AppColors.surfaceRaised,
                              foregroundColor: AppColors.ink2,
                            )
                          : null,
                      child: Text(c.joined ? 'Joined ✓' : 'Join circle'),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Text('Wall · ${c.postCount}',
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 10),
          if (c.canPost) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                children: [
                  TextField(
                    controller: _composer,
                    maxLines: 3,
                    maxLength: 2000,
                    style: const TextStyle(fontSize: 12.5),
                    decoration: InputDecoration(
                      hintText: 'Share something with ${c.name}…',
                      counterText: '',
                      border: InputBorder.none,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      FilledButton.icon(
                        onPressed: _posting ? null : _submit,
                        icon: const Icon(Icons.send, size: 14),
                        label: Text(_posting ? 'Posting…' : 'Post'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],
          if (c.posts.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(
                c.canPost
                    ? 'The wall is empty. Point the circle at a course worth starting.'
                    : 'Join this circle to read and post on its wall.',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: AppColors.dim),
              ),
            )
          else
            for (final post in c.posts)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _PostTile(
                  post: post,
                  onDelete: post.canDelete
                      ? () => widget.onDeletePost(post.id)
                      : null,
                  onOpenCourse: widget.onOpenCourse,
                ),
              ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text('Members · ${c.memberCount}',
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 12,
            children: [
              for (final m in c.members)
                SizedBox(
                  width: 76,
                  child: Column(
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          CoverPlate(
                            seed: m.name,
                            imageUrl: m.avatarUrl,
                            width: 52,
                            height: 52,
                            radius: 26,
                            glyph:
                                m.name.isEmpty ? '?' : m.name[0].toUpperCase(),
                          ),
                          if (c.isOwner && m.role != 'owner')
                            Positioned(
                              right: -4,
                              top: -4,
                              child: GestureDetector(
                                onTap: () =>
                                    widget.onRemoveMember(m.id, m.name),
                                child: Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: const BoxDecoration(
                                    color: AppColors.surfaceRaised,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close,
                                      size: 11, color: AppColors.danger),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 5),
                      Text(
                        m.name,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.ink4),
                      ),
                      if (m.role == 'owner')
                        const Text('OWNER',
                            style: TextStyle(
                                fontSize: 8,
                                letterSpacing: .5,
                                color: AppColors.accent)),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PostTile extends StatelessWidget {
  const _PostTile({
    required this.post,
    required this.onDelete,
    required this.onOpenCourse,
  });

  final CirclePost post;
  final VoidCallback? onDelete;
  final ValueChanged<String> onOpenCourse;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CoverPlate(
                seed: post.authorName,
                imageUrl: post.authorAvatarUrl,
                width: 28,
                height: 28,
                radius: 14,
                glyph: post.authorName.isEmpty
                    ? '?'
                    : post.authorName[0].toUpperCase(),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(post.authorName,
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700)),
              ),
              Text(_date(post.createdAt),
                  style: const TextStyle(fontSize: 10, color: AppColors.dim)),
              if (onDelete != null)
                IconButton(
                  tooltip: 'Delete post',
                  visualDensity: VisualDensity.compact,
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline,
                      size: 15, color: AppColors.dim),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(post.body,
              style: const TextStyle(
                  fontSize: 12.5, height: 1.6, color: AppColors.ink2)),
          if (post.courseSlug != null) ...[
            const SizedBox(height: 10),
            InkWell(
              onTap: () => onOpenCourse(post.courseSlug!),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.surfaceRaised,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    CoverPlate(
                      seed: post.courseSlug!,
                      imageUrl: post.courseThumbnailUrl,
                      width: 30,
                      height: 42,
                      radius: 5,
                      glyph: '🎓',
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(post.courseTitle ?? '',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 12, fontWeight: FontWeight.w700)),
                          const Text('recommended with this post',
                              style: TextStyle(
                                  fontSize: 9.5, color: AppColors.dim)),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right,
                        size: 16, color: AppColors.dim),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _FeedRow extends StatelessWidget {
  const _FeedRow({required this.item, required this.onOpenCourse});

  final ActivityFeedItem item;
  final ValueChanged<String> onOpenCourse;

  @override
  Widget build(BuildContext context) {
    final isReview = item.type == 'review';
    return Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: AppColors.surfaceRaised,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(isReview ? Icons.star_border : Icons.download,
                size: 14, color: AppColors.ink3),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: item.userName,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      TextSpan(
                        text: isReview ? ' reviewed ' : ' downloaded ',
                        style: const TextStyle(color: AppColors.dim),
                      ),
                      TextSpan(
                        text: item.courseTitle,
                        style: const TextStyle(
                            color: AppColors.accent,
                            fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  style: const TextStyle(fontSize: 12, color: AppColors.ink2),
                ),
                if ((item.body ?? '').isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('“${item.body}”',
                      style: const TextStyle(
                          fontSize: 11, height: 1.5, color: AppColors.dim)),
                ],
                const SizedBox(height: 3),
                Text(_date(item.createdAt),
                    style: const TextStyle(fontSize: 9, color: AppColors.dim)),
                if (item.courseSlug != null)
                  GestureDetector(
                    onTap: () => onOpenCourse(item.courseSlug!),
                    behavior: HitTestBehavior.opaque,
                    child: const Padding(
                      padding: EdgeInsets.only(top: 5),
                      child: Text('Open course →',
                          style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.accent)),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleRowTile extends StatelessWidget {
  const _CircleRowTile({
    required this.circle,
    required this.active,
    required this.onTap,
    this.onEdit,
    this.onDelete,
  });

  final CircleRow circle;
  final bool active;
  final VoidCallback onTap;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: active ? AppColors.surfaceRaised : Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 11, 8, 11),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  borderRadius: BorderRadius.circular(9),
                ),
                child:
                    const Icon(Icons.groups, size: 15, color: AppColors.accent),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(circle.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w700)),
                    Text(
                      '${circle.memberCount} members · ${circle.postCount} posts',
                      style:
                          const TextStyle(fontSize: 10, color: AppColors.dim),
                    ),
                  ],
                ),
              ),
              if (circle.isOwner) ...[
                IconButton(
                  tooltip: 'Rename this circle',
                  visualDensity: VisualDensity.compact,
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit, size: 13, color: AppColors.dim),
                ),
                IconButton(
                  tooltip: 'Delete this circle',
                  visualDensity: VisualDensity.compact,
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline,
                      size: 13, color: AppColors.dim),
                ),
              ] else if (circle.joined)
                const Padding(
                  padding: EdgeInsets.only(right: 8),
                  child: Icon(Icons.check, size: 13, color: AppColors.success),
                )
              else
                const Padding(
                  padding: EdgeInsets.only(right: 8),
                  child:
                      Icon(Icons.chevron_right, size: 16, color: AppColors.dim),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyCirclePanel extends StatelessWidget {
  const _EmptyCirclePanel();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Column(
        children: [
          Text('🛋️', style: TextStyle(fontSize: 26)),
          SizedBox(height: 10),
          Text(
            'Pick a circle from the list to see who is in it and what they are learning.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, height: 1.55, color: AppColors.dim),
          ),
        ],
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.icon,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
  });

  final IconData icon;
  final String title, body, primaryLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Icon(icon, size: 30, color: AppColors.accent),
            const SizedBox(height: 12),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 18,
                    height: 1.25,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text)),
            const SizedBox(height: 7),
            Text(body,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 12, height: 1.55, color: AppColors.dim)),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: [
                FilledButton(onPressed: onPrimary, child: Text(primaryLabel)),
                if (secondaryLabel != null && onSecondary != null)
                  OutlinedButton(
                      onPressed: onSecondary, child: Text(secondaryLabel!)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(text,
          style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: AppColors.dim)),
    );
  }
}

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _date(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final d = DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}
