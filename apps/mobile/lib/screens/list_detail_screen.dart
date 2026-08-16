import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class ListDetailScreen extends StatefulWidget {
  const ListDetailScreen({super.key, required this.listId});

  final String listId;

  @override
  State<ListDetailScreen> createState() => _ListDetailScreenState();
}

class _ListDetailScreenState extends State<ListDetailScreen> {
  late Future<CourseCollection> _list;

  @override
  void initState() {
    super.initState();
    _list = Api.instance.listDetail(widget.listId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('List')),
      body: FutureBuilder<CourseCollection>(
        future: _list,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final l = snapshot.data!;
          if (l.items.isEmpty) {
            return const Center(
              child: Text('Nothing here. This collection is empty.', style: TextStyle(color: AppColors.muted)),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: l.items.length,
            separatorBuilder: (_, __) => const Divider(height: 20),
            itemBuilder: (context, i) {
              final c = l.items[i];
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: c.thumbnailUrl == null
                      ? Container(width: 48, height: 48, color: AppColors.surface, child: const Icon(Icons.play_circle_outline, color: AppColors.muted))
                      : Image.network(c.thumbnailUrl!, width: 48, height: 48, fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(width: 48, height: 48, color: AppColors.surface)),
                ),
                title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('${c.progressPct}% · ${c.status}', style: const TextStyle(fontSize: 12)),
                onTap: () => Navigator.pushNamed(context, '/courses/${c.slug}'),
              );
            },
          );
        },
      ),
    );
  }
}
