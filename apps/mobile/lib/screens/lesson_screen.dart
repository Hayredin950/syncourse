import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class LessonScreen extends StatefulWidget {
  const LessonScreen({super.key, required this.lessonId});

  final String lessonId;

  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  late Future<LessonDetail> _lesson;
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    _lesson = Api.instance.lessonDetail(widget.lessonId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lesson')),
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
              Text(l.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
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
                        onPressed: () async {
                          try {
                            final url = await Api.instance.videoUrl(widget.lessonId);
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Signed video URL ready (${url.substring(0, 40)}…) — attach to a player')),
                            );
                          } catch (e) {
                            if (!mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('$e')),
                            );
                          }
                        },
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
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        try {
                          await Api.instance.markComplete(widget.lessonId);
                          if (!mounted) return;
                          setState(() => _completed = true);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text('Marked as complete ✓')),
                          );
                        } catch (e) {
                          if (!mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('$e')),
                          );
                        }
                      },
                      icon: Icon(_completed ? Icons.check_circle : Icons.check_circle_outline),
                      label: const Text('Mark complete'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Download queued (quality picker + signed URL)')),
                      ),
                      icon: const Icon(Icons.download_outlined),
                      label: const Text('Download'),
                    ),
                  ),
                ],
              ),
              if (l.files.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('Available files', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                for (final f in l.files)
                  Card(
                    color: AppColors.surface,
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      dense: true,
                      leading: const Icon(Icons.insert_drive_file_outlined),
                      title: Text(f.label, style: const TextStyle(fontSize: 13)),
                      subtitle: Text(
                        '${f.format} · ${f.sizeMb.toStringAsFixed(1)} MB${f.codec != null ? ' · ${f.codec}' : ''}',
                        style: const TextStyle(fontSize: 11, color: AppColors.muted),
                      ),
                      trailing: f.isBest
                          ? Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.accent.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: const Text('BEST', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.accent)),
                            )
                          : null,
                    ),
                  ),
              ],
              const SizedBox(height: 20),
              const Text('Notes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              if (l.notes.isEmpty)
                const Text('No notes for this lesson yet.', style: TextStyle(color: AppColors.muted, fontSize: 13)),
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
                        Text(n.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                        if (n.isCheatsheet)
                          Container(
                            margin: const EdgeInsets.only(top: 4, bottom: 4),
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.accent.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('CHEAT-SHEET', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: AppColors.accent)),
                          ),
                        if (n.richText.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(n.richText, style: const TextStyle(fontSize: 13, height: 1.4, color: Colors.white70)),
                        ],
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Add a note (timestamp-linked) — coming in the notes editor')),
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
