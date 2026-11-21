import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// The resource library — cheat-sheets, roadmaps and notes, split from Browse
/// exactly as the web does. Filters stay on the sheet; results are a grid.
class ResourcesScreen extends StatefulWidget {
  const ResourcesScreen({super.key});

  @override
  State<ResourcesScreen> createState() => _ResourcesScreenState();
}

class _ResourcesScreenState extends State<ResourcesScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _type = '';
  String _sort = 'newest';
  String _query = '';
  ResourceList? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await Api.resources(
        type: _type.isEmpty ? null : _type,
        sort: _sort,
        query: _query.isEmpty ? null : _query,
        limit: 60,
      );
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
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            SyncourseHeader(
              title: 'Resources',
              showBack: Navigator.canPop(context),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('RESOURCE LIBRARY',
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                                color: AppColors.accent)),
                        SizedBox(height: 3),
                        Text('Cheat-sheets & notes',
                            style: TextStyle(
                                fontSize: 25,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.8,
                                color: AppColors.text)),
                        SizedBox(height: 3),
                        Text(
                          'Short things worth keeping in a second tab. Every one is published in full here.',
                          style: TextStyle(fontSize: 12, color: AppColors.dim),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: TextField(
                controller: _search,
                onChanged: (v) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 300), () {
                    _query = v.trim();
                    _load();
                  });
                },
                style: const TextStyle(fontSize: 13),
                decoration: const InputDecoration(
                  hintText: 'Search the library…',
                  prefixIcon:
                      Icon(Icons.search, size: 18, color: AppColors.dim),
                ),
              ),
            ),
            SizedBox(
              height: 46,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 9, 16, 4),
                children: [
                  for (final t in const [
                    (value: '', label: 'All'),
                    (value: 'cheat-sheet', label: 'Cheat-sheets'),
                    (value: 'roadmap', label: 'Roadmaps'),
                    (value: 'note', label: 'Notes'),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(right: 7),
                      child: GestureDetector(
                        onTap: () {
                          setState(() => _type = t.value);
                          _load();
                        },
                        child: _Chip(
                          label: '${t.label}'
                              '${t.value.isNotEmpty && (data?.counts[t.value] ?? 0) > 0 ? ' ${data!.counts[t.value]}' : ''}',
                          active: _type == t.value,
                        ),
                      ),
                    ),
                  const SizedBox(width: 2),
                  PopupMenuButton<String>(
                    color: AppColors.surfaceRaised,
                    onSelected: (v) {
                      setState(() => _sort = v);
                      _load();
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem(
                          value: 'newest',
                          child:
                              Text('Newest', style: TextStyle(fontSize: 12.5))),
                      PopupMenuItem(
                          value: 'popular',
                          child: Text('Most read',
                              style: TextStyle(fontSize: 12.5))),
                      PopupMenuItem(
                          value: 'a-z',
                          child: Text('A–Z', style: TextStyle(fontSize: 12.5))),
                    ],
                    child: _Chip(
                      label: _sort == 'popular'
                          ? 'Most read'
                          : _sort == 'a-z'
                              ? 'A–Z'
                              : 'Newest',
                      active: false,
                      icon: Icons.swap_vert,
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
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return LoadError(message: _error!, onRetry: _load);
    final data = _data;
    if (data == null || data.results.isEmpty) {
      return const StatusView(
        icon: Icons.description_outlined,
        title: 'Nothing in this shelf yet',
        message:
            'Cheat-sheets, roadmaps and notes appear here as they publish.',
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 520 ? 3 : 2;
        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 126),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            mainAxisExtent: 182,
          ),
          itemCount: data.results.length,
          itemBuilder: (_, i) => ResourceTile(resource: data.results[i]),
        );
      },
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.active, this.icon});
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
          Text(label,
              style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: active ? AppColors.accent : AppColors.ink4)),
        ],
      ),
    );
  }
}

/// One resource: the full published body, its attachments and the related shelf.
class ResourceDetailScreen extends StatefulWidget {
  const ResourceDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  State<ResourceDetailScreen> createState() => _ResourceDetailScreenState();
}

class _ResourceDetailScreenState extends State<ResourceDetailScreen> {
  late Future<ResourceDetail> _detail;

  @override
  void initState() {
    super.initState();
    _detail = Api.resourceDetail(widget.slug);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<ResourceDetail>(
          future: _detail,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError || !snapshot.hasData) {
              return Column(
                children: [
                  SyncourseHeader(showBack: true),
                  Expanded(
                    child: LoadError(
                      message: '${snapshot.error ?? 'Resource unavailable'}',
                      onRetry: () => setState(() {
                        _detail = Api.resourceDetail(widget.slug);
                      }),
                    ),
                  ),
                ],
              );
            }
            final d = snapshot.data!;
            final r = d.summary;
            return ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                SyncourseHeader(showBack: true, title: r.typeLabel),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: CoverPlate(
                    seed: r.slug,
                    imageUrl: r.coverUrl,
                    height: 190,
                    radius: 14,
                    glyph: '📄',
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(r.typeLabel.toUpperCase(),
                              style: const TextStyle(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 1,
                                  color: AppColors.accent)),
                          const SizedBox(width: 8),
                          Text('${r.readMinutes} min read',
                              style: const TextStyle(
                                  fontSize: 10.5, color: AppColors.dim)),
                          if (r.isPremium) ...[
                            const SizedBox(width: 8),
                            const Text('PREMIUM',
                                style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.accent)),
                          ],
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(r.title,
                          style: const TextStyle(
                              fontSize: 27,
                              height: 1.15,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.9,
                              color: AppColors.text)),
                      if (r.summary != null && r.summary!.isNotEmpty) ...[
                        const SizedBox(height: 9),
                        Text(r.summary!,
                            style: const TextStyle(
                                fontSize: 14,
                                height: 1.55,
                                color: AppColors.ink4)),
                      ],
                      if (r.categoryName.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(r.categoryName,
                            style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.accent)),
                      ],
                    ],
                  ),
                ),
                if (d.locked)
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        border: Border.all(
                            color: AppColors.accent.withValues(alpha: .4)),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Premium resource',
                              style: TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          const Text(
                              'Upgrade to read the full body and download the attached files.',
                              style: TextStyle(
                                  fontSize: 12.5,
                                  height: 1.5,
                                  color: AppColors.dim)),
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed: () =>
                                Navigator.pushNamed(context, '/premium'),
                            child: const Text('Go Premium'),
                          ),
                        ],
                      ),
                    ),
                  )
                else ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
                    child: _Body(bodyMd: d.bodyMd),
                  ),
                  if (d.media.isNotEmpty) ...[
                    const SectionHead(title: 'Files'),
                    for (final m in d.media)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        child: _MediaRow(media: m),
                      ),
                  ],
                  if (d.sourceUrl != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final uri = Uri.tryParse(d.sourceUrl!);
                          if (uri != null) {
                            await launchUrl(uri,
                                mode: LaunchMode.externalApplication);
                          }
                        },
                        icon: const Icon(Icons.open_in_new, size: 15),
                        label: const Text('Open the original post'),
                      ),
                    ),
                ],
                if (d.related.isNotEmpty) ...[
                  const SectionHead(title: 'More like this'),
                  for (final rel in d.related)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: SizedBox(
                          height: 190, child: ResourceTile(resource: rel)),
                    ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.bodyMd});
  final String bodyMd;

  @override
  Widget build(BuildContext context) {
    if (bodyMd.trim().isEmpty) {
      return const Text(
          'The full text for this resource has not been added yet.',
          style: TextStyle(fontSize: 13, color: AppColors.dim));
    }
    final lines = bodyMd.split('\n');
    final blocks = <Widget>[];
    for (final raw in lines) {
      final line = raw.trimRight();
      if (line.trim().isEmpty) {
        blocks.add(const SizedBox(height: 10));
        continue;
      }
      if (line.startsWith('### ')) {
        blocks.add(_H(line.substring(4), 15));
      } else if (line.startsWith('## ')) {
        blocks.add(_H(line.substring(3), 18));
      } else if (line.startsWith('# ')) {
        blocks.add(_H(line.substring(2), 21));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.add(Padding(
          padding: const EdgeInsets.only(left: 6, bottom: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('• ',
                  style: TextStyle(fontSize: 14, color: AppColors.accent)),
              Expanded(
                child: Text(_inline(line.substring(2)),
                    style: const TextStyle(
                        fontSize: 13.5, height: 1.55, color: AppColors.ink3)),
              ),
            ],
          ),
        ));
      } else if (RegExp(r'^\d+\.\s').hasMatch(line)) {
        blocks.add(Padding(
          padding: const EdgeInsets.only(left: 6, bottom: 4),
          child: Text(_inline(line),
              style: const TextStyle(
                  fontSize: 13.5, height: 1.55, color: AppColors.ink3)),
        ));
      } else if (line.startsWith('> ')) {
        blocks.add(Container(
          margin: const EdgeInsets.symmetric(vertical: 5),
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          decoration: const BoxDecoration(
            border: Border(left: BorderSide(color: AppColors.accent, width: 3)),
          ),
          child: Text(_inline(line.substring(2)),
              style: const TextStyle(
                  fontSize: 13, height: 1.5, color: AppColors.ink4)),
        ));
      } else if (line.startsWith('```')) {
        // Code fences are rare in these bodies; skip the marker, keep the text.
      } else {
        blocks.add(Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text(_inline(line),
              style: const TextStyle(
                  fontSize: 13.5, height: 1.6, color: AppColors.ink3)),
        ));
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: blocks,
    );
  }

  static String _inline(String text) {
    // Drop the common markdown emphasis markers; the paragraph stays readable
    // without pretending to be a full renderer.
    return text
        .replaceAllMapped(RegExp(r'\*\*(.+?)\*\*'), (m) => m.group(1)!)
        .replaceAllMapped(RegExp(r'`(.+?)`'), (m) => m.group(1)!)
        .replaceAllMapped(RegExp(r'\[(.+?)\]\((.+?)\)'), (m) => m.group(1)!);
  }
}

class _H extends StatelessWidget {
  const _H(this.text, this.size);
  final String text;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 6),
      child: Text(_Body._inline(text),
          style: TextStyle(
              fontSize: size,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
              color: AppColors.text)),
    );
  }
}

class _MediaRow extends StatelessWidget {
  const _MediaRow({required this.media});
  final Map<String, dynamic> media;

  @override
  Widget build(BuildContext context) {
    final kind = media['kind'] as String? ?? 'file';
    final name = media['fileName'] as String? ?? kind;
    final url = media['url'] as String? ?? media['telegramUrl'] as String?;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: url == null
            ? null
            : () async {
                final uri = Uri.tryParse(url);
                if (uri != null) {
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              },
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              Icon(
                kind == 'video'
                    ? Icons.play_circle_outline
                    : kind == 'pdf'
                        ? Icons.picture_as_pdf_outlined
                        : Icons.attach_file,
                size: 18,
                color: AppColors.accent,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        const TextStyle(fontSize: 12.5, color: AppColors.ink2)),
              ),
              const Icon(Icons.open_in_new, size: 14, color: AppColors.dim),
            ],
          ),
        ),
      ),
    );
  }
}
