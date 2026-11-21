import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// `/recommendations` — the full "For you" shelf, not just the home rail.
class RecommendationsScreen extends StatefulWidget {
  const RecommendationsScreen({super.key});

  @override
  State<RecommendationsScreen> createState() => _RecommendationsScreenState();
}

class _RecommendationsScreenState extends State<RecommendationsScreen> {
  List<CourseSummary> _courses = const [];
  String _source = 'popular';
  bool _signedIn = false;
  bool _loading = true;
  bool _failed = false;

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
    final token = await Api.loadToken();
    _signedIn = token != null;
    if (!_signedIn) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final data = await Api.forYou(limit: 24);
      final courses = ((data['courses'] as List?) ?? [])
          .map((e) =>
              CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
      if (!mounted) return;
      setState(() {
        _courses = courses;
        _source = data['source'] as String? ?? 'popular';
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _failed = true;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 40),
            children: [
              SyncourseHeader(
                title: 'For you',
                showBack: Navigator.canPop(context),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: const [
                        Icon(Icons.auto_awesome,
                            size: 13, color: AppColors.accent),
                        SizedBox(width: 5),
                        Text('PICKED FOR YOU',
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.1,
                                color: AppColors.accent)),
                      ],
                    ),
                    const SizedBox(height: 5),
                    const Text('For you',
                        style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1,
                            color: AppColors.text)),
                    const SizedBox(height: 7),
                    Text(
                      _source == 'personalised'
                          ? 'Built from what you have saved, downloaded and rated — the topics and lecturers you keep coming back to.'
                          : 'Popular right now. Save, download or rate a course and this shelf starts reading your taste.',
                      style: const TextStyle(
                          fontSize: 13, height: 1.55, color: AppColors.dim),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (!_signedIn)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _Panel(
                    icon: Icons.auto_awesome,
                    title: 'Sign in to get your shelf',
                    body:
                        'Recommendations come from your own activity — the courses you save, download and rate. Until then this is just the popular list.',
                    primaryLabel: 'Sign in',
                    onPrimary: () => Navigator.pushNamed(context, '/auth'),
                    secondaryLabel: 'Browse instead',
                    onSecondary: () => Navigator.pushNamed(context, '/browse'),
                  ),
                )
              else if (_failed)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _Panel(
                    icon: Icons.cloud_off_outlined,
                    title: 'Could not load your shelf',
                    body:
                        'The catalogue is still there — try again, or browse while it wakes up.',
                    primaryLabel: 'Try again',
                    onPrimary: _load,
                    secondaryLabel: 'Browse the catalogue',
                    onSecondary: () => Navigator.pushNamed(context, '/browse'),
                  ),
                )
              else if (_courses.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _Panel(
                    icon: Icons.auto_awesome,
                    title: 'Nothing to recommend yet',
                    body:
                        'Save or download a course and a shelf appears here on the next visit.',
                    primaryLabel: 'Find a first course',
                    onPrimary: () => Navigator.pushNamed(context, '/browse'),
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final columns = constraints.maxWidth > 520 ? 3 : 2;
                      return GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          mainAxisSpacing: 22,
                          crossAxisSpacing: 12,
                          childAspectRatio: .54,
                        ),
                        itemCount: _courses.length,
                        itemBuilder: (_, i) => CoursePoster(
                          course: _courses[i],
                          width: double.infinity,
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({
    required this.icon,
    required this.title,
    required this.body,
    required this.primaryLabel,
    required this.onPrimary,
    this.secondaryLabel,
    this.onSecondary,
  });

  final IconData icon;
  final String title, body, primaryLabel;
  final VoidCallback onPrimary;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, size: 28, color: AppColors.accent),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                  color: AppColors.text)),
          const SizedBox(height: 6),
          Text(body,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 12.5, height: 1.55, color: AppColors.dim)),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: [
              FilledButton(onPressed: onPrimary, child: Text(primaryLabel)),
              if (secondaryLabel != null && onSecondary != null)
                OutlinedButton(
                    onPressed: onSecondary, child: Text(secondaryLabel!)),
            ],
          ),
        ],
      ),
    );
  }
}
