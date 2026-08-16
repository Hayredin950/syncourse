import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class CirclesScreen extends StatefulWidget {
  const CirclesScreen({super.key});

  @override
  State<CirclesScreen> createState() => _CirclesScreenState();
}

class _CirclesScreenState extends State<CirclesScreen> {
  late Future<List<ActivityItem>> _activity;

  @override
  void initState() {
    super.initState();
    _activity = Api.instance.circlesActivity();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Circles')),
      body: FutureBuilder<List<ActivityItem>>(
        future: _activity,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final items = snapshot.data!;
          if (items.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.groups, size: 56, color: AppColors.muted),
                    SizedBox(height: 12),
                    Text('Follow people to see what they are learning', textAlign: TextAlign.center),
                  ],
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final a = items[i];
              return Card(
                color: AppColors.surface,
                elevation: 0,
                child: ListTile(
                  leading: CircleAvatar(child: Text(a.userName.characters.first)),
                  title: Text('${a.userName} ${a.verb} ${a.targetTitle}', maxLines: 2, overflow: TextOverflow.ellipsis),
                  subtitle: Text(a.createdAt, style: const TextStyle(fontSize: 12)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
