import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class MyLearningScreen extends StatefulWidget {
  const MyLearningScreen({super.key});

  @override
  State<MyLearningScreen> createState() => _MyLearningScreenState();
}

class _MyLearningScreenState extends State<MyLearningScreen> {
  late Future<MyLearning> _learning;
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    _learning = Api.myLearning();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Learning')),
      body: FutureBuilder<MyLearning>(
        future: _learning,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.lock_outline, size: 44, color: AppColors.muted),
                  const SizedBox(height: 10),
                  const Text('Sign in to see your learning'),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => Navigator.pushNamed(context, '/auth'),
                    child: const Text('Sign in'),
                  ),
                ],
              ),
            );
          }
          final data = snapshot.data!;
          final lists = [
            ('Saved', data.saved),
            ('Liked', data.liked),
            ('Downloaded', data.downloaded),
          ];
          final items = lists[_tab].$2;
          return Column(
            children: [
              SizedBox(
                height: 46,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: lists.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final (label, list) = lists[i];
                    return ChoiceChip(
                      label: Text('$label (${list.length})'),
                      selected: _tab == i,
                      onSelected: (_) => setState(() => _tab = i),
                    );
                  },
                ),
              ),
              Expanded(
                child: items.isEmpty
                    ? const Center(child: Text('Nothing here yet', style: TextStyle(color: AppColors.muted)))
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 12),
                        itemBuilder: (context, i) => _ItemCard(item: items[i]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item});

  final MyLearningItem item;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.surface,
      elevation: 0,
      child: ListTile(
        leading: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: item.thumbnailUrl == null
              ? Container(width: 48, height: 48, color: Colors.black26, child: const Icon(Icons.play_circle_outline, color: AppColors.muted))
              : Image.network(item.thumbnailUrl!, width: 48, height: 48, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(width: 48, height: 48, color: Colors.black26)),
        ),
        title: Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          [
            if (item.isPremium) 'Premium',
            if (item.downloadedAt != null) 'Downloaded ${_date(item.downloadedAt!)}',
            if (item.savedAt != null) 'Saved ${_date(item.savedAt!)}',
            if (item.likedAt != null) 'Liked ${_date(item.likedAt!)}',
          ].join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 11, color: AppColors.muted),
        ),
        onTap: () => Navigator.pushNamed(context, '/courses/${item.slug}'),
      ),
    );
  }

  static String _date(DateTime d) => '${d.day}/${d.month}/${d.year}';
}
