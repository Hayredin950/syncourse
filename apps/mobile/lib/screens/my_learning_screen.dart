import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// `/my-learning` — saved, liked and downloaded courses in one place.
class MyLearningScreen extends StatefulWidget {
  const MyLearningScreen({super.key});

  @override
  State<MyLearningScreen> createState() => _MyLearningScreenState();
}

class _MyLearningScreenState extends State<MyLearningScreen> {
  late Future<MyLearning> _learning;
  int _tab = 0;
  bool _initialised = false;

  @override
  void initState() {
    super.initState();
    _learning = Api.myLearning();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map) {
      final tab = args['tab'];
      if (tab is int && tab >= 0 && tab <= 2) _tab = tab;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: FutureBuilder<MyLearning>(
          future: _learning,
          builder: (context, snapshot) {
            if (snapshot.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final needsAuth = snapshot.error is ApiException &&
                  (snapshot.error as ApiException).status == 401;
              return Column(
                children: [
                  SyncourseHeader(showBack: true, title: 'My library'),
                  Expanded(
                    child: StatusView(
                      icon: needsAuth
                          ? Icons.lock_outline
                          : Icons.cloud_off_outlined,
                      title: needsAuth
                          ? 'Sign in to see your learning'
                          : 'We couldn\'t load your library',
                      message: needsAuth
                          ? 'Saved, liked and downloaded courses follow your account.'
                          : '${snapshot.error}',
                      actionLabel: needsAuth ? 'Sign in' : 'Try again',
                      onAction: needsAuth
                          ? () async {
                              await Navigator.pushNamed(context, '/auth');
                              if (mounted) {
                                setState(() {
                                  _learning = Api.myLearning();
                                });
                              }
                            }
                          : () => setState(() {
                                _learning = Api.myLearning();
                              }),
                    ),
                  ),
                ],
              );
            }
            final data = snapshot.data!;
            final lists = [
              (label: 'Saved', icon: Icons.bookmark_border, items: data.saved),
              (label: 'Liked', icon: Icons.favorite_border, items: data.liked),
              (
                label: 'Downloaded',
                icon: Icons.download_outlined,
                items: data.downloaded
              ),
            ];
            final items = lists[_tab].items;
            return Column(
              children: [
                SyncourseHeader(showBack: true, title: 'My library'),
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, 0),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('YOUR LIBRARY',
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                                color: AppColors.accent)),
                        SizedBox(height: 4),
                        Text('Everything you keep',
                            style: TextStyle(
                                fontSize: 27,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.9,
                                color: AppColors.text)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      for (var i = 0; i < lists.length; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: GestureDetector(
                            onTap: () => setState(() => _tab = i),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 9),
                              decoration: BoxDecoration(
                                color: _tab == i
                                    ? AppColors.accentSoft
                                    : AppColors.surfaceSunk,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(
                                    color: _tab == i
                                        ? AppColors.accent.withValues(alpha: .5)
                                        : AppColors.border),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(lists[i].icon,
                                      size: 14,
                                      color: _tab == i
                                          ? AppColors.accent
                                          : AppColors.dim),
                                  const SizedBox(width: 5),
                                  Text(
                                    '${lists[i].label} ${lists[i].items.length}',
                                    style: TextStyle(
                                        fontSize: 11.5,
                                        fontWeight: FontWeight.w700,
                                        color: _tab == i
                                            ? AppColors.accent
                                            : AppColors.ink4),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: items.isEmpty
                      ? StatusView(
                          icon: lists[_tab].icon,
                          title:
                              'Nothing ${lists[_tab].label.toLowerCase()} yet',
                          message: _tab == 0
                              ? 'Save a course with the bookmark on any card and it lands here.'
                              : _tab == 1
                                  ? 'Like a course from its page and it shows up here.'
                                  : 'Downloads through the bot or the app are listed here.',
                          actionLabel: 'Browse courses',
                          onAction: () =>
                              Navigator.pushNamed(context, '/browse'),
                        )
                      : RefreshIndicator(
                          onRefresh: () async {
                            setState(() {
                              _learning = Api.myLearning();
                            });
                            await _learning;
                          },
                          color: AppColors.accent,
                          backgroundColor: AppColors.surface,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 126),
                            itemCount: items.length,
                            separatorBuilder: (_, __) =>
                                const DividerLine(indent: 0, endIndent: 0),
                            itemBuilder: (_, i) => _ItemRow(item: items[i]),
                          ),
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});
  final MyLearningItem item;

  @override
  Widget build(BuildContext context) {
    final bits = [
      if (item.isPremium) 'Premium',
      if (item.downloadedAt != null) 'Downloaded ${_date(item.downloadedAt!)}',
      if (item.savedAt != null) 'Saved ${_date(item.savedAt!)}',
      if (item.likedAt != null) 'Liked ${_date(item.likedAt!)}',
    ];
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/courses/${item.slug}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          children: [
            CoverPlate(
              seed: item.slug,
              imageUrl: item.thumbnailUrl,
              width: 82,
              height: 58,
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
                    bits.isEmpty
                        ? [
                            if (item.level != null) item.level!,
                            if (item.lessonCount > 0)
                              '${item.lessonCount} lessons',
                          ].join(' · ')
                        : bits.join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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

  static String _date(DateTime d) =>
      '${d.day} ${_months[d.month - 1]} ${d.year}';
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
