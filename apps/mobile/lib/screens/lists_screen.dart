import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class ListsScreen extends StatefulWidget {
  const ListsScreen({super.key});

  @override
  State<ListsScreen> createState() => _ListsScreenState();
}

class _ListsScreenState extends State<ListsScreen> {
  late Future<List<CourseCollection>> _lists;

  @override
  void initState() {
    super.initState();
    _lists = Api.instance.myLists();
  }

  Future<void> _createList() async {
    final name = await showDialog<String>(
      context: context,
      builder: (context) {
        final controller = TextEditingController();
        return AlertDialog(
          title: const Text('New list'),
          content: TextField(
            controller: controller,
            decoration: const InputDecoration(labelText: 'List name'),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, controller.text), child: const Text('Create')),
          ],
        );
      },
    );
    if (name != null && name.trim().isNotEmpty) {
      await Api.instance.createList(name.trim());
      if (mounted) setState(() => _lists = Api.instance.myLists());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My lists'),
        actions: [
          IconButton(icon: const Icon(Icons.add), onPressed: _createList),
        ],
      ),
      body: FutureBuilder<List<CourseCollection>>(
        future: _lists,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final lists = snapshot.data!;
          if (lists.isEmpty) {
            return const Center(
              child: Text('No lists yet — tap + to create one', style: TextStyle(color: AppColors.muted)),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: lists.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final l = lists[i];
              return Card(
                color: AppColors.surface,
                elevation: 0,
                child: ListTile(
                  leading: Icon(l.visibility == 'public' ? Icons.public : Icons.lock_outline, color: AppColors.accent),
                  title: Text(l.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('${l.itemCount} courses · ${l.visibility}'),
                  onTap: () => Navigator.pushNamed(context, '/lists/${l.id}'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
