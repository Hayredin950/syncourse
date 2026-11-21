import 'dart:async';
import 'dart:io';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/assistant_screen.dart';
import 'screens/auth_screen.dart';
import 'screens/browse_screen.dart';
import 'screens/certificates_screen.dart';
import 'screens/circles_screen.dart';
import 'screens/course_detail_screen.dart';
import 'screens/download_screen.dart';
import 'screens/entity_screens.dart';
import 'screens/home_screen.dart';
import 'screens/lesson_screen.dart';
import 'screens/list_detail_screen.dart';
import 'screens/lists_screen.dart';
import 'screens/my_learning_screen.dart';
import 'screens/offline_screen.dart';
import 'screens/path_screens.dart';
import 'screens/premium_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/recommendations_screen.dart';
import 'screens/resource_screens.dart';
import 'screens/search_screen.dart';
import 'theme.dart';

void main() {
  runApp(const SynCourseApp());
}

class SynCourseApp extends StatefulWidget {
  const SynCourseApp({super.key});

  @override
  State<SynCourseApp> createState() => _SynCourseAppState();
}

class _SynCourseAppState extends State<SynCourseApp> {
  final _navigator = GlobalKey<NavigatorState>();
  final _messenger = GlobalKey<ScaffoldMessengerState>();
  StreamSubscription<Uri>? _links;

  @override
  void initState() {
    super.initState();
    // Google's callback can only redirect to the API, which then bounces to
    // `syncourse://auth?token=…`. Catch that link, store the session and return
    // to the shell. Only Android and iOS have a registered handler today.
    if (Platform.isAndroid || Platform.isIOS) _listenForLinks();
  }

  Future<void> _listenForLinks() async {
    final links = AppLinks();
    try {
      final initial = await links.getInitialLink();
      if (initial != null) await _handleLink(initial);
    } catch (_) {
      // A cold start without a link is the normal case.
    }
    _links = links.uriLinkStream.listen(
      _handleLink,
      onError: (_) {},
    );
  }

  Future<void> _handleLink(Uri uri) async {
    if (uri.scheme != 'syncourse' || uri.host != 'auth') return;
    final token = uri.queryParameters['token'];
    if (token == null || token.isEmpty) return;
    await Api.setToken(token);
    if (!mounted) return;
    _navigator.currentState?.pushNamedAndRemoveUntil('/', (route) => false);
    _messenger.currentState?.showSnackBar(
      const SnackBar(content: Text('Signed in with Google')),
    );
  }

  @override
  void dispose() {
    _links?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Syncourse',
      navigatorKey: _navigator,
      scaffoldMessengerKey: _messenger,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      initialRoute: '/',
      routes: {
        '/': (_) => const Shell(),
        '/auth': (_) => const AuthScreen(),
        '/browse': (_) => const BrowseScreen(),
        '/ask': (_) => const AssistantScreen(),
        '/search': (_) => const SearchScreen(),
        '/my-learning': (_) => const MyLearningScreen(),
        '/offline': (_) => const OfflineScreen(),
        '/certificates': (_) => const CertificatesScreen(),
        '/lists': (_) => const ListsScreen(),
        '/me': (_) => const ProfileScreen(),
        '/premium': (_) => const PremiumScreen(),
        '/circles': (_) => const CirclesScreen(),
        '/resources': (_) => const ResourcesScreen(),
        '/paths': (_) => const PathsScreen(),
        '/recommendations': (_) => const RecommendationsScreen(),
        '/lecturers': (_) => const LecturersScreen(),
        '/organizations': (_) => const OrganizationsScreen(),
        '/download': (_) => const DownloadScreen(),
      },
      onGenerateRoute: (settings) {
        final name = settings.name ?? '';
        if (name.startsWith('/courses/')) {
          final parts = name.split('/');
          if (parts.length == 3) {
            return MaterialPageRoute(
              builder: (_) => CourseDetailScreen(slug: parts[2]),
              settings: settings,
            );
          }
          if (parts.length == 5 && parts[3] == 'lessons') {
            return MaterialPageRoute(
              builder: (_) => LessonScreen(lessonId: parts[4]),
              settings: settings,
            );
          }
        }
        if (name.startsWith('/lists/')) {
          return MaterialPageRoute(
            builder: (_) =>
                ListDetailScreen(listId: name.substring('/lists/'.length)),
            settings: settings,
          );
        }
        if (name.startsWith('/resources/')) {
          return MaterialPageRoute(
            builder: (_) => ResourceDetailScreen(
                slug: name.substring('/resources/'.length)),
            settings: settings,
          );
        }
        if (name.startsWith('/paths/')) {
          return MaterialPageRoute(
            builder: (_) =>
                PathDetailScreen(id: name.substring('/paths/'.length)),
            settings: settings,
          );
        }
        if (name.startsWith('/lecturers/')) {
          return MaterialPageRoute(
            builder: (_) => LecturerDetailScreen(
                slug: name.substring('/lecturers/'.length)),
            settings: settings,
          );
        }
        if (name.startsWith('/organizations/')) {
          return MaterialPageRoute(
            builder: (_) => OrganizationDetailScreen(
                slug: name.substring('/organizations/'.length)),
            settings: settings,
          );
        }
        return null;
      },
    );
  }
}

/// Six tabs, matching the web's `BottomNav`: Home, Browse, Ask, Search,
/// Collections, Me. The bar floats over the page with a blurred glass fill.
class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => ShellState();
}

class ShellState extends State<Shell> {
  int _index = 0;

  static const _pages = [
    HomeScreen(),
    BrowseScreen(),
    AssistantScreen(),
    SearchScreen(),
    ListsScreen(),
    ProfileScreen(),
  ];

  static const _tabs = [
    (icon: Icons.home_outlined, active: Icons.home, label: 'Home'),
    (icon: Icons.grid_view_outlined, active: Icons.grid_view, label: 'Browse'),
    (
      icon: Icons.auto_awesome_outlined,
      active: Icons.auto_awesome,
      label: 'Ask'
    ),
    (icon: Icons.search, active: Icons.search, label: 'Search'),
    (icon: Icons.bookmark_border, active: Icons.bookmark, label: 'Collections'),
    (
      icon: Icons.account_circle_outlined,
      active: Icons.account_circle,
      label: 'Me'
    ),
  ];

  void _select(int index) => setState(() => _index = index);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xE8171512),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppColors.hairline),
            boxShadow: const [
              BoxShadow(
                color: Color(0x99000000),
                blurRadius: 22,
                offset: Offset(0, 10),
              ),
            ],
          ),
          child: Row(
            children: [
              for (var i = 0; i < _tabs.length; i++)
                Expanded(
                  child: _NavTab(
                    icon: _index == i ? _tabs[i].active : _tabs[i].icon,
                    label: _tabs[i].label,
                    active: _index == i,
                    onTap: () => _select(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 5),
        decoration: BoxDecoration(
          color: active ? AppColors.accentSoft : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon,
                size: 20, color: active ? AppColors.accent : AppColors.ink5),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 8.5,
                fontWeight: FontWeight.w700,
                color: active ? AppColors.accent : AppColors.ink5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
