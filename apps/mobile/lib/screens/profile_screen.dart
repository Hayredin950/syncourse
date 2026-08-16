import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late Future<Profile?> _profile;

  @override
  void initState() {
    super.initState();
    _profile = Api.instance.me();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Me')),
      body: FutureBuilder<Profile?>(
        future: _profile,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final profile = snapshot.data;
          if (profile == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.account_circle, size: 64, color: AppColors.muted),
                  const SizedBox(height: 12),
                  const Text('Sign in to sync your learning across devices'),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => Navigator.pushNamed(context, '/auth'),
                    child: const Text('Sign in / Create account'),
                  ),
                ],
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(
                children: [
                  CircleAvatar(radius: 32, child: Text(profile.name.characters.first)),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(profile.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                        Text('@${profile.username} · member since ${profile.memberSince.year}',
                            style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                children: [
                  _StatTile(icon: Icons.school, value: '${profile.stats['enrolled'] ?? 0}', label: 'Enrolled'),
                  _StatTile(icon: Icons.check_circle, value: '${profile.stats['completed'] ?? 0}', label: 'Completed'),
                  _StatTile(icon: Icons.bookmark, value: '${profile.stats['saved'] ?? 0}', label: 'Saved'),
                  _StatTile(icon: Icons.favorite, value: '${profile.stats['liked'] ?? 0}', label: 'Liked'),
                  _StatTile(icon: Icons.list, value: '${profile.stats['lists'] ?? 0}', label: 'Lists'),
                  _StatTile(icon: Icons.rate_review, value: '${profile.stats['reviews'] ?? 0}', label: 'Reviews'),
                ],
              ),
              const SizedBox(height: 20),
              _MenuTile(icon: Icons.list_alt, title: 'My lists', onTap: () => Navigator.pushNamed(context, '/lists')),
              _MenuTile(icon: Icons.workspace_premium, title: 'Subscription', onTap: () => Navigator.pushNamed(context, '/premium')),
              _MenuTile(icon: Icons.groups, title: 'Circles', onTap: () => Navigator.pushNamed(context, '/circles')),
              _MenuTile(icon: Icons.settings, title: 'Settings', onTap: () => _showSettings()),
              _MenuTile(
                icon: Icons.logout,
                title: 'Sign out',
                onTap: () async {
                  await Api.instance.logout();
                  if (mounted) setState(() => _profile = Api.instance.me());
                },
              ),
            ],
          );
        },
      ),
    );
  }

  void _showSettings() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      builder: (context) => const SafeArea(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              SizedBox(height: 8),
              ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.link), title: Text('Link Telegram for bot downloads')),
              ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.help_outline), title: Text('Support & FAQ')),
              ListTile(contentPadding: EdgeInsets.zero, leading: Icon(Icons.description_outlined), title: Text('Terms, Privacy & Refunds')),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.icon, required this.value, required this.label});

  final IconData icon;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 20, color: AppColors.accent),
          const SizedBox(height: 6),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.title, required this.onTap});

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon),
      title: Text(title, style: const TextStyle(fontSize: 14)),
      trailing: const Icon(Icons.chevron_right, color: AppColors.muted),
      onTap: onTap,
    );
  }
}
