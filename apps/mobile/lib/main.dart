import 'package:flutter/material.dart';

import 'screens/auth_screen.dart';
import 'screens/browse_screen.dart';
import 'screens/circles_screen.dart';
import 'screens/course_detail_screen.dart';
import 'screens/home_screen.dart';
import 'screens/lesson_screen.dart';
import 'screens/list_detail_screen.dart';
import 'screens/lists_screen.dart';
import 'screens/my_learning_screen.dart';
import 'screens/premium_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/search_screen.dart';
import 'theme.dart';

void main() {
  runApp(const SynCourseApp());
}

class SynCourseApp extends StatelessWidget {
  const SynCourseApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SynCourse',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      initialRoute: '/',
      routes: {
        '/': (_) => const Shell(),
        '/auth': (_) => const AuthScreen(),
        '/browse': (_) => const BrowseScreen(),
        '/search': (_) => const SearchScreen(),
        '/my-learning': (_) => const MyLearningScreen(),
        '/lists': (_) => const ListsScreen(),
        '/premium': (_) => const PremiumScreen(),
        '/circles': (_) => const CirclesScreen(),
      },
      onGenerateRoute: (settings) {
        final name = settings.name ?? '';
        if (name.startsWith('/courses/')) {
          final parts = name.split('/');
          if (parts.length == 4) {
            return MaterialPageRoute(
              builder: (_) => CourseDetailScreen(slug: parts[2]),
              settings: settings,
            );
          }
          if (parts.length == 6 && parts[4] == 'lessons') {
            return MaterialPageRoute(
              builder: (_) => LessonScreen(lessonId: parts[5]),
              settings: settings,
            );
          }
        }
        if (name.startsWith('/lists/')) {
          return MaterialPageRoute(
            builder: (_) => ListDetailScreen(listId: name.substring('/lists/'.length)),
            settings: settings,
          );
        }
        return null;
      },
    );
  }
}

class Shell extends StatefulWidget {
  const Shell({super.key});

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int _index = 0;

  static const _pages = [
    HomeScreen(),
    BrowseScreen(),
    SearchScreen(),
    MyLearningScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.grid_view_outlined), selectedIcon: Icon(Icons.grid_view), label: 'Browse'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(icon: Icon(Icons.school_outlined), selectedIcon: Icon(Icons.school), label: 'Learning'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Me'),
        ],
      ),
    );
  }
}
