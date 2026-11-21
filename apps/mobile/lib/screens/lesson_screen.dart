import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import 'offline_player_screen.dart';

const webBase = String.fromEnvironment('WEB_URL',
    defaultValue: 'https://syncourse-web.vercel.app');

class LessonScreen extends StatefulWidget {
  const LessonScreen({super.key, required this.lessonId});

  final String lessonId;

  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  late Future<LessonDetail> _lesson;
  bool _saved = false;
  bool _completed = false;
  bool _marking = false;
  int _pct = 0;
  int _done = 0;
  int _total = 0;

  @override
  void initState() {
    super.initState();
    _lesson = Api.lessonDetail(widget.lessonId).then((l) {
      if (l.courseSlug.isNotEmpty) {
        Api.courseProgress(l.courseSlug).then((p) {
          if (!mounted) return;
          setState(() {
            _pct = (p['pct'] as num?)?.toInt() ?? 0;
            _done = (p['completed'] as num?)?.toInt() ?? 0;
            _total = (p['total'] as num?)?.toInt() ?? 0;
            final lessons = (p['lessons'] as List?) ?? [];
            _completed = lessons.any((e) =>
                (e as Map)['id'] == widget.lessonId &&
                (e['completed'] as bool? ?? false));
          });
        }).catchError((Object _) {});
      }
      return l;
    });
  }

  Future<void> _toggleComplete() async {
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                _completed ? 'Lesson complete ✓' : 'Marked as not complete')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _marking = false);
    }
  }

  Future<void> _play(LessonDetail l) async {
    try {
      final url = await Api.videoUrl(widget.lessonId);
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) =>
              OfflinePlayerScreen(title: l.title, path: null, remoteUrl: url),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _explain(LessonDetail l) async {
    final uri = Uri.parse(
      '$webBase/assistant?course=${Uri.encodeQueryComponent(l.courseSlug)}'
      '&q=${Uri.encodeQueryComponent('Explain this lesson: ${l.title}')}',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Lesson'),
        actions: [
          IconButton(
            tooltip: 'Offline library',
            icon: const Icon(Icons.download_done_outlined),
            onPressed: () => Navigator.pushNamed(context, '/offline'),
          ),
        ],
      ),
      body: FutureBuilder<LessonDetail>(
        future: _lesson,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final l = snapshot.data!;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(l.title,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                [
                  if (l.courseTitle.isNotEmpty) l.courseTitle,
                  if (l.sectionTitle != null) l.sectionTitle!,
                  if (l.durationText.isNotEmpty) l.durationText,
                ].join(' · '),
                style: const TextStyle(color: AppColors.muted, fontSize: 13),
              ),
              const SizedBox(height: 16),
              Container(
                height: 200,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        iconSize: 56,
                        icon: const Icon(Icons.play_circle_fill),
                        onPressed: () => _play(l),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Stream from R2 via signed URL\n(preview lessons play without sign-in)',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppColors.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.circular(12)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _total > 0
                                ? '$_done of $_total lessons · $_pct%'
                                : 'Course progress',
                            style: const TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ),
                        FilledButton.tonalIcon(
                          onPressed: _marking ? null : _toggleComplete,
                          icon: Icon(
                              _completed
                                  ? Icons.check_circle
                                  : Icons.radio_button_unchecked,
                              size: 18),
                          label: Text(_marking
                              ? 'Saving…'
                              : _completed
                                  ? 'Complete'
                                  : 'Mark complete'),
                        ),
                      ],
                    ),
                    if (_total > 0) ...[
                      const SizedBox(height: 8),
                      LinearProgressIndicator(
                        value: _total == 0 ? 0 : _done / _total,
                        minHeight: 5,
                        backgroundColor:
                            AppColors.surface.withValues(alpha: 0.6),
                      ),
                    ],
                    TextButton.icon(
                      style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          alignment: Alignment.centerLeft),
                      onPressed: () => _explain(l),
                      icon: const Icon(Icons.auto_awesome, size: 16),
                      label: const Text(
                          'Explain this lesson with the study assistant'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        // There is no lesson progress: courses are delivered as
                        // Telegram archives. The useful action here is saving the
                        // course to the reader's library, which is a real endpoint.
                        if (l.courseSlug.isEmpty) return;
                        try {
                          await Api.toggleSave(l.courseSlug);
                          if (!mounted) return;
                          setState(() => _saved = !_saved);
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                                content: Text(_saved
                                    ? 'Saved to your library ✓'
                                    : 'Removed from your library')),
                          );
                        } catch (e) {
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('$e')),
                          );
                        }
                      },
                      icon:
                          Icon(_saved ? Icons.bookmark : Icons.bookmark_border),
                      label: Text(_saved ? 'Saved' : 'Save course'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        try {
                          final r =
                              await Api.downloadToTelegram(widget.lessonId);
                          final botUrl = r['botUrl'];
                          if (botUrl is String && mounted) {
                            final uri = Uri.tryParse(botUrl);
                            if (uri != null) {
                              await launchUrl(uri,
                                  mode: LaunchMode.externalApplication);
                            }
                          }
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                                content: Text((r['message'] as String?) ??
                                    'Request sent')),
                          );
                        } catch (e) {
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('$e')),
                          );
                        }
                      },
                      icon: const Icon(Icons.send_outlined),
                      label: const Text('Get files'),
                    ),
                  ),
                ],
              ),
              if (l.files.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Available files',
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                for (final f in l.files)
                  Card(
                    color: AppColors.surface,
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      dense: true,
                      leading: const Icon(Icons.insert_drive_file_outlined),
                      title:
                          Text(f.label, style: const TextStyle(fontSize: 13)),
                      subtitle: Text(
                        '${f.format} · ${f.sizeMb.toStringAsFixed(1)} MB${f.codec != null ? ' · ${f.codec}' : ''}',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.muted),
                      ),
                      trailing: f.isBest
                          ? Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.accent.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text('BEST',
                                  style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.accent)),
                            )
                          : null,
                    ),
                  ),
              ],
              const SizedBox(height: 20),
              const Text('Notes',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (l.notes.isEmpty)
                const Text('No notes for this lesson yet.',
                    style: TextStyle(color: AppColors.muted, fontSize: 13)),
              for (final n in l.notes)
                Card(
                  color: AppColors.surface,
                  elevation: 0,
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(n.title,
                            style: const TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700)),
                        if (n.isCheatsheet)
                          Container(
                            margin: const EdgeInsets.only(top: 4, bottom: 4),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('CHEAT-SHEET',
                                style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.accent)),
                          ),
                        if (n.richText.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(n.richText,
                              style: const TextStyle(
                                  fontSize: 13,
                                  height: 1.4,
                                  color: Colors.white70)),
                        ],
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text(
                          'Add a note (timestamp-linked) — coming in the notes editor')),
                ),
                icon: const Icon(Icons.add),
                label: const Text('Add a note'),
              ),
            ],
          );
        },
      ),
    );
  }
}
