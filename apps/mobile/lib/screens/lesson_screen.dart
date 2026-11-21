import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';
import 'offline_player_screen.dart';

const _webApp = 'https://syncourse.pages.dev';

class LessonScreen extends StatefulWidget {
  const LessonScreen({super.key, required this.lessonId});

  final String lessonId;

  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  LessonDetail? _lesson;
  bool _loading = true;
  bool _failed = false;
  bool _completed = false;
  bool _marking = false;
  bool _videoFailed = false;
  bool _videoReady = false;
  int _pct = 0;
  int _done = 0;
  int _total = 0;
  String _tab = 'watch';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final l = await Api.lessonDetail(widget.lessonId);
      if (!mounted) return;
      setState(() {
        _lesson = l;
        _completed = l.watched;
        _loading = false;
      });
      if (l.courseSlug.isNotEmpty) {
        try {
          final p = await Api.courseProgress(l.courseSlug);
          if (!mounted) return;
          setState(() {
            _pct = (p['pct'] as num?)?.toInt() ?? 0;
            _done = (p['completed'] as num?)?.toInt() ?? 0;
            _total = (p['total'] as num?)?.toInt() ?? 0;
            final lessons = (p['lessons'] as List?) ?? [];
            final mine = lessons
                .whereType<Map>()
                .where((e) => e['id'] == widget.lessonId);
            if (mine.isNotEmpty) {
              _completed = mine.first['completed'] == true;
            }
          });
        } catch (_) {}
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _failed = true;
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

  Future<bool> _requireAuth() async {
    if (await Api.loadToken() != null) return true;
    if (!mounted) return false;
    await Navigator.pushNamed(context, '/auth');
    return mounted && await Api.loadToken() != null;
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) _toast('Could not open $url');
  }

  Future<void> _toggleComplete() async {
    if (!await _requireAuth()) return;
    setState(() => _marking = true);
    try {
      final p = await Api.setLessonProgress(widget.lessonId, !_completed);
      if (!mounted) return;
      setState(() {
        _completed = !_completed;
        _pct = (p['pct'] as num?)?.toInt() ?? _pct;
        _done = (p['completed'] as num?)?.toInt() ?? _done;
        _total = (p['total'] as num?)?.toInt() ?? _total;
      });
      _toast(_completed ? 'Lesson complete ✓' : 'Marked as not complete');
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _marking = false);
    }
  }

  Future<void> _play(LessonDetail l) async {
    try {
      final url = await Api.videoUrl(widget.lessonId);
      if (!mounted) return;
      setState(() => _videoReady = true);
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              OfflinePlayerScreen(title: l.title, path: null, remoteUrl: url),
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _videoFailed = true);
        _toast(e.message);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _videoFailed = true);
        _toast('$e');
      }
    }
  }

  Future<void> _downloadAttachment(LessonAttachment a) async {
    if (!await _requireAuth()) return;
    try {
      final r = await Api.lessonFileUrl(widget.lessonId, a.id);
      final url = r['url'] as String?;
      if (url == null) {
        _toast('No download URL for this file');
        return;
      }
      await _openUrl(url);
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _sendToTelegram() async {
    if (!await _requireAuth()) return;
    try {
      final r = await Api.downloadToTelegram(widget.lessonId);
      final botUrl = r['botUrl'];
      if (botUrl is String && botUrl.isNotEmpty) {
        await _openUrl(botUrl);
      }
      _toast((r['message'] as String?) ?? 'Request sent');
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _copyLink() async {
    await Clipboard.setData(ClipboardData(
        text:
            '$_webApp/courses/${_lesson?.courseSlug}/lessons/${widget.lessonId}'));
    _toast('Lesson link copied');
  }

  void _explain(LessonDetail l) {
    Navigator.pushNamed(context, '/ask', arguments: {
      'course': l.courseSlug,
    });
    _toast('Ask the assistant about “${l.title}”');
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: SafeArea(
          bottom: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    final l = _lesson;
    if (_failed || l == null) {
      return Scaffold(
        body: SafeArea(
          bottom: false,
          child: Column(
            children: [
              const SyncourseHeader(title: 'Lesson', showBack: true),
              Expanded(
                child: StatusView(
                  icon: Icons.search_off,
                  title: 'This lesson did not load',
                  message:
                      'It may have moved, or the connection dropped on the way in.',
                  actionLabel: 'Try again',
                  onAction: _load,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            SyncourseHeader(
              showBack: true,
              title: l.courseTitle.isEmpty ? 'Lesson' : l.courseTitle,
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (l.sectionTitle == null
                                  ? ''
                                  : '${l.sectionTitle} — ') +
                              l.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 20,
                              height: 1.2,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -.4,
                              color: AppColors.text),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${l.durationText} · '
                          '${l.isPreview ? 'Preview' : (l.locked ? 'Premium' : 'Full lesson')}',
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.dim),
                        ),
                      ],
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pushNamed(
                        context, '/courses/${l.courseSlug}'),
                    child: const Text('Course'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: PillTabs(
                value: _tab,
                onChanged: (v) => setState(() => _tab = v),
                scrollable: false,
                items: [
                  (value: 'watch', label: 'Watch'),
                  (
                    value: 'notes',
                    label: 'Notes (${l.notes.length})',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _tab == 'watch' ? _watch(l) : _notes(l),
            ),
          ],
        ),
      ),
    );
  }

  Widget _watch(LessonDetail l) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
      children: [
        Container(
          height: 210,
          decoration: BoxDecoration(
            color: AppColors.surface,
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Center(
            child: l.locked && !l.isPreview
                ? _lockedPanel()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        iconSize: 58,
                        color: AppColors.accent,
                        icon: const Icon(Icons.play_circle_fill),
                        onPressed: () => _play(l),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _videoFailed
                            ? 'This lesson is locked'
                            : _videoReady
                                ? 'Stream from storage via a signed URL'
                                : 'Tap play to stream this lesson',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 11.5, color: AppColors.dim),
                      ),
                      if (_videoFailed)
                        TextButton(
                          onPressed: () => Navigator.pushNamed(
                              context, '/courses/${l.courseSlug}'),
                          child: const Text('Go to course'),
                        ),
                    ],
                  ),
          ),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.all(14),
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
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            _completed
                                ? 'Completed'
                                : 'Mark this lesson complete',
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text(
                          _total > 0
                              ? '$_done of $_total lessons · $_pct%'
                              : 'Sign in to keep your place across devices',
                          style: const TextStyle(
                              fontSize: 10.5, color: AppColors.dim),
                        ),
                      ],
                    ),
                  ),
                  FilledButton.tonal(
                    onPressed: _marking ? null : _toggleComplete,
                    child: Text(
                      _marking
                          ? 'Saving…'
                          : _completed
                              ? '✓ Complete'
                              : 'Mark complete',
                      style: const TextStyle(fontSize: 11.5),
                    ),
                  ),
                ],
              ),
              if (_total > 0) ...[
                const SizedBox(height: 9),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: _total == 0 ? 0 : _done / _total,
                    minHeight: 5,
                    backgroundColor: AppColors.surfaceRaised,
                    valueColor:
                        const AlwaysStoppedAnimation<Color>(AppColors.accent),
                  ),
                ),
              ],
              const SizedBox(height: 10),
              InkWell(
                onTap: () => _explain(l),
                child: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Icon(Icons.auto_awesome,
                          size: 13, color: AppColors.accent),
                      SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Explain this lesson with the study assistant',
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.accent),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        if (l.attachments.isNotEmpty) ...[
          const SectionHead(title: 'Download course files'),
          for (final a in l.attachments)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.inventory_2_outlined,
                      size: 18, color: AppColors.accent),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(a.fileName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 12.5, fontWeight: FontWeight.w600)),
                        Text(
                          '${a.fileType} · '
                          '${a.sizeMb > 0 ? '${a.sizeMb.toStringAsFixed(1)} MB' : 'size unknown'}',
                          style: const TextStyle(
                              fontSize: 10, color: AppColors.dim),
                        ),
                      ],
                    ),
                  ),
                  FilledButton.tonal(
                    onPressed: () => _downloadAttachment(a),
                    child:
                        const Text('Download', style: TextStyle(fontSize: 11)),
                  ),
                ],
              ),
            ),
        ],
        if (l.files.isNotEmpty) ...[
          const SectionHead(title: 'Available downloads'),
          for (final f in l.files)
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(f.label,
                          style: const TextStyle(
                              fontSize: 12.5, fontWeight: FontWeight.w700)),
                      if (f.isBest) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.accent,
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: const Text('BEST',
                              style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.black)),
                        ),
                      ],
                      const Spacer(),
                      Text(
                        '${f.sizeMb.toStringAsFixed(1)} MB · ${f.codec ?? f.format}',
                        style:
                            const TextStyle(fontSize: 10, color: AppColors.dim),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 6,
                    children: [
                      FilledButton.tonal(
                        onPressed: _sendToTelegram,
                        child: const Text('Send to Telegram',
                            style: TextStyle(fontSize: 11)),
                      ),
                      OutlinedButton(
                        onPressed: _copyLink,
                        child: const Text('Copy lesson link',
                            style: TextStyle(fontSize: 11)),
                      ),
                      OutlinedButton(
                        onPressed: () => _openUrl(
                            'https://t.me/share/url?url=${Uri.encodeQueryComponent('$_webApp/courses/${l.courseSlug}/lessons/${widget.lessonId}')}'),
                        child: const Text('Share on Telegram',
                            style: TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
        ],
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () => Navigator.pushNamed(context, '/offline'),
          icon: const Icon(Icons.download_done_outlined, size: 16),
          label: const Text('Offline library'),
        ),
      ],
    );
  }

  Widget _lockedPanel() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🔒', style: TextStyle(fontSize: 26)),
          const SizedBox(height: 6),
          const Text('This lesson is part of Premium',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            'The outline is free; the video, notes and files need an active plan.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: AppColors.dim),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: () => Navigator.pushNamed(context, '/premium'),
            child: const Text('Go Premium'),
          ),
        ],
      ),
    );
  }

  Widget _notes(LessonDetail l) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 40),
      children: [
        if (l.notes.isEmpty)
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text(
              l.locked
                  ? 'These notes are part of Premium. The lesson outline is free; the notes and downloadable files need an active plan.'
                  : 'No notes for this lesson yet.',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 12, height: 1.55, color: AppColors.dim),
            ),
          ),
        for (final n in l.notes)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: AppColors.surface,
              border: Border.all(color: AppColors.border),
              borderRadius: BorderRadius.circular(14),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(n.title,
                            style: const TextStyle(
                                fontSize: 13.5, fontWeight: FontWeight.w700)),
                      ),
                      if (n.isCheatsheet)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: AppColors.accentSoft,
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: const Text('CHEAT-SHEET',
                              style: TextStyle(
                                  fontSize: 8,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.accent)),
                        ),
                    ],
                  ),
                ),
                if (n.richText.isNotEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                    decoration: const BoxDecoration(
                      border: Border(top: BorderSide(color: AppColors.border)),
                    ),
                    child: Text(
                      _plain(n.richText),
                      style: const TextStyle(
                          fontSize: 12.5, height: 1.65, color: AppColors.ink3),
                    ),
                  ),
                for (final url in n.imageUrls)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.network(url,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              const SizedBox.shrink()),
                    ),
                  ),
              ],
            ),
          ),
        if (l.locked)
          FilledButton(
            onPressed: () => Navigator.pushNamed(context, '/premium'),
            child: const Text('Go Premium'),
          ),
        const SizedBox(height: 8),
        Text(
          'Notes are written by the instructor. Downloadable files live on the Watch tab.',
          style: const TextStyle(
              fontSize: 10.5, height: 1.6, color: AppColors.dim),
        ),
      ],
    );
  }

  /// The seeded notes carry light markdown. Strip the syntax rather than show
  /// asterisks; the app has no markdown renderer and a wall of `**` is worse
  /// than plain, readable prose.
  String _plain(String md) {
    var text = md;
    text = text.replaceAllMapped(
        RegExp(r'^#{1,6}\s*', multiLine: true), (_) => '');
    text = text.replaceAllMapped(
        RegExp(r'^\s*[-*]\s+', multiLine: true), (_) => '• ');
    text = text.replaceAll('**', '');
    text = text.replaceAll('__', '');
    text = text.replaceAllMapped(RegExp(r'`([^`]*)`'), (m) => m[1] ?? '');
    text = text.replaceAll(RegExp(r'\n{3,}'), '\n\n');
    return text.trim();
  }
}
