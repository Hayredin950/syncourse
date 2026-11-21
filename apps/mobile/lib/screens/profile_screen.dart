import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

const _webApp = 'https://syncourse.pages.dev';
const _supportEmail = 'support@syncourse.app';

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

String _date(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${d.day} ${_months[d.month - 1]} ${d.year}';
}

/// The Me surface, mirroring `apps/web/src/app/me/page.tsx`: the profile card,
/// the stat grid, then Library, Stats, Subscription and Settings tabs.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String _tab = 'library';
  UserProfile? _profile;
  bool _loading = true;
  String? _error;
  bool _signedIn = false;

  Map<String, dynamic>? _stats;
  bool _statsLoading = false;
  bool _statsFailed = false;

  List<Map<String, dynamic>>? _certs;
  List<Map<String, dynamic>>? _receipts;
  Map<String, dynamic>? _perks;

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
    final token = await Api.loadToken();
    _signedIn = token != null;
    if (!_signedIn) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final p = await Api.me();
      if (!mounted) return;
      setState(() {
        _profile = p;
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

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _selectTab(String tab) {
    setState(() => _tab = tab);
    if (tab == 'stats') _loadStats();
    if (tab == 'subscription') _loadSubscription();
  }

  Future<void> _loadStats() async {
    if (_stats != null || _statsLoading) return;
    setState(() {
      _statsLoading = true;
      _statsFailed = false;
    });
    try {
      final data = await Api.stats();
      if (!mounted) return;
      setState(() {
        _stats = data;
        _statsLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _statsFailed = true;
        _statsLoading = false;
      });
    }
  }

  Future<void> _loadSubscription() async {
    if (_certs == null) {
      Api.myCertificates().then((rows) {
        if (mounted) setState(() => _certs = rows);
      }).catchError((_) {
        if (mounted) setState(() => _certs = const []);
      });
    }
    if (_receipts == null) {
      Api.receipts().then((rows) {
        if (mounted) setState(() => _receipts = rows);
      }).catchError((_) {
        if (mounted) setState(() => _receipts = const []);
      });
    }
    if (_perks == null) {
      Api.perks().then((data) {
        if (mounted) setState(() => _perks = data);
      }).catchError((_) {
        if (mounted) setState(() => _perks = null);
      });
    }
  }

  Future<void> _signIn() async {
    await Navigator.pushNamed(context, '/auth');
    if (mounted) _load();
  }

  Future<void> _signOut() async {
    await Api.logout();
    if (!mounted) return;
    setState(() {
      _profile = null;
      _signedIn = false;
      _stats = null;
      _certs = null;
      _receipts = null;
      _perks = null;
      _tab = 'library';
    });
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) _toast('Could not open $url');
  }

  Future<void> _share() async {
    final p = _profile;
    if (p == null) return;
    final url = 'https://syncourse.pages.dev/@${p.username}';
    await Clipboard.setData(ClipboardData(text: url));
    _toast('Profile link copied');
  }

  Future<void> _editProfile() async {
    final p = _profile;
    if (p == null) return;
    final name = TextEditingController(text: p.name);
    final username = TextEditingController(text: p.username);
    final avatar = TextEditingController(text: p.avatarUrl ?? '');
    var gender = p.gender ?? '';
    var saving = false;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(
              20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Edit profile',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              const Text('Your name and handle are what other members see.',
                  style: TextStyle(fontSize: 11.5, color: AppColors.dim)),
              const SizedBox(height: 16),
              const _FieldLabel('Display name'),
              TextField(
                  controller: name, textInputAction: TextInputAction.next),
              const SizedBox(height: 12),
              const _FieldLabel('Username'),
              TextField(
                controller: username,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9_@]')),
                ],
              ),
              const SizedBox(height: 12),
              const _FieldLabel('Profile image URL'),
              TextField(
                controller: avatar,
                keyboardType: TextInputType.url,
                decoration:
                    const InputDecoration(hintText: 'https://… (optional)'),
              ),
              const SizedBox(height: 14),
              const _FieldLabel('Gender'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final g in const ['', 'Male', 'Female', 'Non-binary'])
                    ChoiceChip(
                      label: Text(g.isEmpty ? 'Prefer not to say' : g),
                      selected: gender == g,
                      onSelected: (_) => setSheet(() => gender = g),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: saving
                      ? null
                      : () async {
                          setSheet(() => saving = true);
                          try {
                            await Api.updateProfile({
                              'name': name.text.trim().isEmpty
                                  ? null
                                  : name.text.trim(),
                              'username': username.text
                                      .trim()
                                      .replaceFirst(RegExp(r'^@'), '')
                                      .isEmpty
                                  ? null
                                  : username.text
                                      .trim()
                                      .replaceFirst(RegExp(r'^@'), ''),
                              'avatarUrl': avatar.text.trim().isEmpty
                                  ? null
                                  : avatar.text.trim(),
                              'gender': gender.isEmpty ? null : gender,
                            });
                            if (context.mounted) {
                              Navigator.pop(context, true);
                            }
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context)
                                  .showSnackBar(SnackBar(content: Text('$e')));
                              setSheet(() => saving = false);
                            }
                          }
                        },
                  child: Text(saving ? 'Saving…' : 'Save profile'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    name.dispose();
    username.dispose();
    avatar.dispose();
    if (ok == true) {
      _toast('Profile updated');
      _load();
    }
  }

  Future<void> _changePassword() async {
    final p = _profile;
    if (p == null) return;
    final current = TextEditingController();
    final next = TextEditingController();
    var busy = false;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) {
          return Padding(
            padding: EdgeInsets.fromLTRB(
                20, 20, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.hasPassword ? 'Change password' : 'Set a password',
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(
                  p.hasPassword
                      ? 'You stay signed in on this device.'
                      : 'You signed in with Google. A password lets you in without it.',
                  style: const TextStyle(fontSize: 11.5, color: AppColors.dim),
                ),
                const SizedBox(height: 16),
                if (p.hasPassword) ...[
                  const _FieldLabel('Current password'),
                  TextField(controller: current, obscureText: true),
                  const SizedBox(height: 12),
                ],
                const _FieldLabel('New password'),
                TextField(
                  controller: next,
                  obscureText: true,
                  decoration:
                      const InputDecoration(hintText: 'Min 8 characters'),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: busy
                        ? null
                        : () async {
                            setSheet(() => busy = true);
                            try {
                              await Api.changePassword(current.text, next.text);
                              if (context.mounted) {
                                Navigator.pop(context, true);
                              }
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(content: Text('$e')));
                                setSheet(() => busy = false);
                              }
                            }
                          },
                    child: Text(busy ? 'Saving…' : 'Save password'),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
    current.dispose();
    next.dispose();
    if (ok == true) {
      _toast('Password updated');
      _load();
    }
  }

  Future<void> _saveSettings(Map<String, dynamic> body) async {
    try {
      await Api.updateProfile(body);
      _toast('Saved');
      _load();
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _unlinkGoogle() async {
    try {
      await Api.unlinkGoogle();
      _toast('Google unlinked');
      _load();
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _linkTelegram() async {
    final p = _profile;
    if (p == null) return;
    final controller = TextEditingController(text: p.telegramUsername ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
            p.telegramUsername == null ? 'Link Telegram' : 'Update Telegram'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: '@username or t.me link'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save')),
        ],
      ),
    );
    if (ok == true && controller.text.trim().isNotEmpty) {
      try {
        await Api.linkTelegram(controller.text.trim());
        _toast('Telegram linked — bot downloads sync here');
        _load();
      } catch (e) {
        _toast('$e');
      }
    }
    controller.dispose();
  }

  Future<void> _redeem(String code) async {
    try {
      final r = await Api.redeem(code);
      _toast(r['already'] == true
          ? 'That code is already on this account'
          : 'Gift code applied — Premium extended');
      setState(() => _perks = null);
      _load();
      _loadSubscription();
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _downloadReceipt(Map<String, dynamic> receipt) async {
    final id = receipt['id'] as String?;
    final number = receipt['number'] as String? ?? 'receipt';
    if (id == null) return;
    try {
      final bytes = await Api.downloadBytes('/payments/receipts/$id/pdf');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$number.pdf');
      await file.writeAsBytes(bytes, flush: true);
      final opened = await launchUrl(Uri.file(file.path),
          mode: LaunchMode.externalApplication);
      if (!opened) _toast('Receipt saved to ${file.path}');
    } catch (e) {
      _toast('Could not build the receipt: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: SafeArea(
          bottom: false,
          child: Center(child: CircularProgressIndicator()),
        ),
      );
    }
    if (!_signedIn) {
      return Scaffold(
        body: SafeArea(
          bottom: false,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 126),
            children: [
              const SyncourseHeader(title: 'Me'),
              const SizedBox(height: 30),
              _SignedOut(onSignIn: _signIn),
            ],
          ),
        ),
      );
    }
    final p = _profile;
    if (p == null) {
      return Scaffold(
        body: SafeArea(
          bottom: false,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 126),
            children: [
              const SyncourseHeader(title: 'Me'),
              LoadError(
                message: _error ?? 'The connection dropped on the way in.',
                onRetry: _load,
              ),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          color: AppColors.accent,
          backgroundColor: AppColors.surface,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 126),
            children: [
              const SyncourseHeader(title: 'Me'),
              _ProfileCard(
                profile: p,
                onEdit: _editProfile,
                onShare: _share,
                onSignOut: _signOut,
                onAdmin: p.isStaff ? () => _open('$_webApp/admin') : null,
              ),
              _StatGrid(profile: p),
              _Tabs(value: _tab, onChanged: _selectTab),
              const SizedBox(height: 4),
              if (_tab == 'library') _library(p),
              if (_tab == 'stats') _statsTab(),
              if (_tab == 'subscription') _subscriptionTab(p),
              if (_tab == 'settings') _settingsTab(p),
            ],
          ),
        ),
      ),
    );
  }

  Widget _library(UserProfile p) {
    final stats = p.stats;
    final paths = (_stats?['pathProgress'] as List?) ?? const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHead(title: 'Your library'),
        _PanelRows(children: [
          _Row(
            icon: Icons.menu_book_outlined,
            title: 'My Library',
            subtitle: 'Everything you\'ve saved and downloaded',
            onTap: () => Navigator.pushNamed(context, '/my-learning'),
          ),
          _Row(
            icon: Icons.workspace_premium_outlined,
            title: 'Certificates',
            subtitle: 'View, download or verify a certificate',
            onTap: () => Navigator.pushNamed(context, '/certificates'),
          ),
          _Row(
            icon: Icons.download_for_offline_outlined,
            title: 'Offline library',
            subtitle: 'App-hosted lessons stored on this phone',
            onTap: () => Navigator.pushNamed(context, '/offline'),
          ),
          _Row(
            icon: Icons.credit_card,
            title: 'Premium plans',
            subtitle: p.isPremium
                ? 'Active — manage your plan'
                : 'Unlock every premium course and resource',
            onTap: () => Navigator.pushNamed(context, '/premium'),
          ),
        ]),
        const SectionHead(title: 'Activity'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: StatTile(
                  icon: Icons.bookmark_border,
                  value: '${stats['saved'] ?? 0}',
                  label: 'SAVED',
                  onTap: () => Navigator.pushNamed(context, '/my-learning',
                      arguments: {'tab': 0}),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatTile(
                  icon: Icons.download_outlined,
                  value: '${stats['downloaded'] ?? 0}',
                  label: 'DOWNLOADED',
                  onTap: () => Navigator.pushNamed(context, '/my-learning',
                      arguments: {'tab': 2}),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: StatTile(
                  icon: Icons.favorite_border,
                  value: '${stats['liked'] ?? 0}',
                  label: 'LIKED',
                  onTap: () => Navigator.pushNamed(context, '/my-learning',
                      arguments: {'tab': 1}),
                ),
              ),
            ],
          ),
        ),
        const SectionHead(title: 'Created'),
        _PanelRows(children: [
          _Row(
            icon: Icons.layers_outlined,
            title: 'My lists',
            subtitle:
                '${stats['lists'] ?? 0} list${(stats['lists'] ?? 0) == 1 ? '' : 's'} built',
            onTap: () => Navigator.pushNamed(context, '/lists'),
          ),
          _Row(
            icon: Icons.groups_outlined,
            title: 'Study circles',
            subtitle: 'Walls, members and what your circles are learning',
            onTap: () => Navigator.pushNamed(context, '/circles'),
          ),
        ]),
        const SectionHead(title: 'Explore'),
        _PanelRows(children: [
          _Row(
            icon: Icons.auto_awesome,
            title: 'For you',
            subtitle: 'A shelf built from what you save, rate and download',
            onTap: () => Navigator.pushNamed(context, '/recommendations'),
          ),
          _Row(
            icon: Icons.alt_route,
            title: 'Learning paths',
            subtitle: 'Curated multi-course tracks in a sensible order',
            onTap: () => Navigator.pushNamed(context, '/paths'),
          ),
          _Row(
            icon: Icons.person_search_outlined,
            title: 'Lecturers',
            subtitle: 'The instructors behind the catalogue',
            onTap: () => Navigator.pushNamed(context, '/lecturers'),
          ),
          _Row(
            icon: Icons.account_balance_outlined,
            title: 'Channels & schools',
            subtitle: 'Publishers, universities and companies',
            onTap: () => Navigator.pushNamed(context, '/organizations'),
          ),
        ]),
        const SectionHead(title: 'Get the app'),
        _PanelRows(children: [
          _Row(
            icon: Icons.smartphone,
            title: 'Syncourse for your device',
            subtitle: 'Android APK · Windows · Linux · macOS',
            onTap: () => Navigator.pushNamed(context, '/download'),
          ),
        ]),
        const SectionHead(title: 'Saved learning paths'),
        if (paths.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                border: Border.all(color: AppColors.border),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Text(
                'Paths you save will show up here — curated multi-course tracks that take you from zero to job-ready.',
                style: TextStyle(fontSize: 12, color: AppColors.dim),
              ),
            ),
          )
        else
          _PanelRows(children: [
            for (final p in paths)
              _Row(
                icon: Icons.alt_route,
                title: (p as Map)['title'] as String? ?? '',
                subtitle:
                    '${p['downloaded'] ?? 0}/${p['total'] ?? 0} courses · ${p['pct'] ?? 0}%',
                onTap: () => Navigator.pushNamed(context, '/paths'),
              ),
          ]),
      ],
    );
  }

  Widget _statsTab() {
    if (_statsFailed) {
      return LoadError(
        message: 'The catalogue is still there — try again.',
        onRetry: () {
          setState(() => _stats = null);
          _loadStats();
        },
      );
    }
    if (_statsLoading || _stats == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 50),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final s = _stats!;
    List<Map<String, dynamic>> rows(String key) =>
        ((s[key] as List?) ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
    final paths = rows('pathProgress');
    final ratings = rows('ratingDistribution');
    final categories = rows('categoryCounts');
    final instructors = rows('instructorCounts');
    final languages = rows('languageCounts');
    final topInstructors = rows('topInstructors');
    final types = rows('contentTypeBreakdown');
    final difficulty = rows('difficultyBreakdown');
    final week = rows('yourWeek');
    final growth = rows('watchlistGrowth');
    final tags = rows('topTags');
    final months = rows('monthlyDownloads');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHead(title: 'Curated path completion'),
        if (paths.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Progress against curated learning paths fills in as you download the courses inside them.',
              style: TextStyle(fontSize: 12, color: AppColors.dim),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                for (final p in paths)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _BarRow(
                      label: p['title'] as String? ?? '',
                      pct: (p['pct'] as num?)?.toInt() ?? 0,
                    ),
                  ),
              ],
            ),
          ),
        _StatPanel(
          title: 'Your ratings',
          child: _BarList(
            rows: [
              for (final r in ratings)
                (
                  label: '${r['stars']}★',
                  count: (r['count'] as num?)?.toInt() ?? 0
                )
            ],
          ),
        ),
        _StatPanel(
          title: 'Your learning rhythm',
          subtitle: 'Courses downloaded per month',
          child: _ColumnBars(
            data: [
              for (final m in months)
                (
                  label: m['month'] as String? ?? '',
                  count: (m['count'] as num?)?.toInt() ?? 0
                )
            ],
          ),
        ),
        _StatPanel(
            title: 'Categories',
            child: _BarList(rows: [
              for (final r in categories)
                (
                  label: r['label'] as String? ?? '',
                  count: (r['count'] as num?)?.toInt() ?? 0
                )
            ])),
        _StatPanel(
            title: 'Instructors',
            child: _BarList(rows: [
              for (final r in instructors)
                (
                  label: r['label'] as String? ?? '',
                  count: (r['count'] as num?)?.toInt() ?? 0
                )
            ])),
        _StatPanel(
            title: 'Languages',
            child: _BarList(rows: [
              for (final r in languages)
                (
                  label: r['label'] as String? ?? '',
                  count: (r['count'] as num?)?.toInt() ?? 0
                )
            ])),
        _StatPanel(
          title: 'Instructors you learn from most',
          child: topInstructors.isEmpty
              ? const Text('Fills in as you learn.',
                  style: TextStyle(fontSize: 12, color: AppColors.dim))
              : Wrap(
                  spacing: 14,
                  runSpacing: 12,
                  children: [
                    for (final i in topInstructors)
                      SizedBox(
                        width: 68,
                        child: Column(
                          children: [
                            CoverPlate(
                              seed: i['name'] as String? ?? '',
                              imageUrl: i['photoUrl'] as String?,
                              width: 48,
                              height: 48,
                              radius: 24,
                              glyph: '👤',
                            ),
                            const SizedBox(height: 5),
                            Text(
                              i['name'] as String? ?? '',
                              maxLines: 2,
                              textAlign: TextAlign.center,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 10, color: AppColors.ink4),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        _StatPanel(
          title: 'What you learn (by type)',
          child: _PctBars(
            rows: [
              for (final r in types)
                (
                  label: r['label'] as String? ?? '',
                  pct: (r['pct'] as num?)?.toInt() ?? 0
                )
            ],
          ),
        ),
        _StatPanel(
          title: 'By difficulty',
          child: _PctBars(
            rows: [
              for (final r in difficulty)
                (
                  label: r['label'] as String? ?? '',
                  pct: (r['pct'] as num?)?.toInt() ?? 0
                )
            ],
          ),
        ),
        _StatPanel(
          title: 'Your week',
          subtitle: 'Activity by weekday',
          child: _ColumnBars(
            data: [
              for (final d in week)
                (
                  label: d['day'] as String? ?? '',
                  count: (d['count'] as num?)?.toInt() ?? 0
                )
            ],
          ),
        ),
        _StatPanel(
          title: 'Watchlist growth',
          subtitle: 'Courses saved per month',
          child: _ColumnBars(
            data: [
              for (final m in growth)
                (
                  label: m['month'] as String? ?? '',
                  count: (m['count'] as num?)?.toInt() ?? 0
                )
            ],
          ),
        ),
        _StatPanel(
            title: 'Top tags',
            child: _BarList(rows: [
              for (final r in tags)
                (
                  label: r['label'] as String? ?? '',
                  count: (r['count'] as num?)?.toInt() ?? 0
                )
            ])),
      ],
    );
  }

  Widget _subscriptionTab(UserProfile p) {
    final perks = (_perks?['perks'] as List?) ?? const [];
    final room = _perks?['telegramRoomUrl'] as String?;
    final support = _perks?['supportEmail'] as String? ?? _supportEmail;
    final aiQuota = (_perks?['aiQuota'] as Map?) ?? const {};
    final certs = _certs;
    final receipts = _receipts;
    final pending = p.pendingPayment;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHead(title: 'Subscription'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(15),
            decoration: _panelDecoration,
            child: Text(
              p.isPremium
                  ? 'You\'re on Premium'
                      '${p.planExpiresAt != null ? ' until ${_date(p.planExpiresAt)}.' : '.'} '
                      'Every premium course, resource and download is open on this account.'
                  : 'Browsing, lists and tracking are yours. Premium courses, resources and their files need a pass.',
              style: const TextStyle(fontSize: 13, height: 1.55),
            ),
          ),
        ),
        if (pending != null) ...[
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                border:
                    Border.all(color: AppColors.accent.withValues(alpha: .4)),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Payment pending — ${pending['planName'] ?? 'plan'} via ${pending['paymentMethod'] ?? 'bank'}',
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'We\'re confirming your payment of ${pending['amount'] ?? ''} ETB. It usually takes a few minutes.',
                    style:
                        const TextStyle(fontSize: 11.5, color: AppColors.ink4),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: () => Navigator.pushNamed(context, '/premium'),
                    child: const Text('Finish your payment'),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SectionHead(title: 'What Premium unlocks'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              for (final perk in perks.isEmpty
                  ? const [
                      {
                        'id': 'offline',
                        'label': 'Offline library',
                        'detail': 'Save app-hosted lessons for offline study.'
                      },
                      {
                        'id': 'certificates',
                        'label': 'Certificates',
                        'detail': 'A numbered certificate per finished course.'
                      },
                      {
                        'id': 'ai',
                        'label': 'Bigger AI quota',
                        'detail': 'A much larger daily assistant allowance.'
                      },
                      {
                        'id': 'early',
                        'label': 'Early access',
                        'detail': 'New lesson drops reach you first.'
                      },
                    ]
                  : perks)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(13),
                  decoration: _panelDecoration,
                  child: Row(
                    children: [
                      const Icon(Icons.bolt, size: 17, color: AppColors.accent),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${(perk as Map)['label'] ?? ''}',
                                style: const TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 2),
                            Text('${perk['detail'] ?? ''}',
                                style: const TextStyle(
                                    fontSize: 11, color: AppColors.dim)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        if (room != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: OutlinedButton.icon(
              onPressed: () => _open(room),
              icon: const Icon(Icons.chat_bubble_outline, size: 15),
              label: const Text('Open the Premium members\' room'),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
          child: Text(
            'Priority support: $support · assistant allowance: ${aiQuota['premium'] ?? 1000} questions/day on Premium.',
            style: const TextStyle(fontSize: 11, color: AppColors.dim),
          ),
        ),
        if (!p.isPremium)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pushNamed(context, '/premium'),
                child: const Text('Go Premium'),
              ),
            ),
          ),
        const SectionHead(
          title: 'Certificates',
          onSeeAll: null,
        ),
        if (certs == null)
          const _MutedPanel('Loading your certificates…')
        else if (certs.isEmpty)
          const _MutedPanel(
            'No certificates yet. Open a course, mark every lesson or module complete, then issue the certificate from the course page.',
          )
        else
          _PanelRows(children: [
            for (final c in certs)
              _Row(
                icon: Icons.workspace_premium_outlined,
                title: c['courseTitle'] as String? ?? '',
                subtitle: c['serial'] as String? ?? '',
                trailingLabel: 'View',
                onTap: () => Navigator.pushNamed(context, '/certificates'),
              ),
          ]),
        const SectionHead(title: 'Payment receipts'),
        if (receipts == null)
          const _MutedPanel('Loading your receipts…')
        else if (receipts.isEmpty)
          const _MutedPanel(
              'Receipts appear here after a payment is approved by the bank.')
        else
          _PanelRows(children: [
            for (final r in receipts)
              _Row(
                icon: Icons.receipt_long_outlined,
                title: '${r['number'] ?? ''} · ${r['planName'] ?? ''}',
                subtitle:
                    '${r['amount'] ?? ''} ${r['currency'] ?? 'ETB'} · ${_date(r['createdAt'] as String?)}',
                trailingLabel: 'PDF',
                onTap: () => _downloadReceipt(r),
              ),
          ]),
        const SectionHead(title: 'Gift code'),
        _GiftPanel(onRedeem: _redeem),
        const SectionHead(title: 'Certificate and receipt details'),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Certificates record that you marked every lesson or module complete. They are not exams or accreditation. Receipts are issued for approved payments only and carry the bank reference.',
            style: TextStyle(fontSize: 11, height: 1.7, color: AppColors.dim),
          ),
        ),
      ],
    );
  }

  Widget _settingsTab(UserProfile p) {
    final settings = p.settings ?? const <String, dynamic>{};
    final privacy = p.privacy ?? const <String, dynamic>{};
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHead(title: 'Support'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            padding: const EdgeInsets.all(15),
            decoration: _panelDecoration,
            child: Row(
              children: [
                const Icon(Icons.chat_bubble_outline,
                    size: 19, color: AppColors.accent),
                const SizedBox(width: 12),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Contact support',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w800)),
                      SizedBox(height: 2),
                      Text(
                        'Questions about billing, accounts or a course? We reply within a day.',
                        style: TextStyle(fontSize: 11, color: AppColors.dim),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => _open('mailto:$_supportEmail'),
                  child: const Text('Message'),
                ),
              ],
            ),
          ),
        ),
        const SectionHead(title: 'Account'),
        _PanelRows(children: [
          _PlainRow(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.mail_outline,
                        size: 14, color: AppColors.dim),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(p.email,
                          style: const TextStyle(
                              fontSize: 12.5, color: AppColors.ink2)),
                    ),
                    Text(p.isVerified ? '✓ Verified' : 'Unverified',
                        style: TextStyle(
                            fontSize: 10.5,
                            color: p.isVerified
                                ? AppColors.success
                                : AppColors.dim)),
                  ],
                ),
                const SizedBox(height: 4),
                Text('Member since ${_date(p.memberSince.toIso8601String())}',
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.dim)),
              ],
            ),
          ),
          _PlainRow(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Sign-in provider',
                    style: TextStyle(fontSize: 12.5)),
                const SizedBox(height: 2),
                Text(
                  p.hasGoogle && p.hasPassword
                      ? 'Google · Password — both linked'
                      : p.hasGoogle
                          ? 'Google — Google only'
                          : 'Password — Password only',
                  style: const TextStyle(fontSize: 10.5, color: AppColors.dim),
                ),
              ],
            ),
          ),
        ]),
        const SectionHead(title: 'Sign-in methods'),
        _PanelRows(children: [
          _PlainRow(
            child: Row(
              children: [
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Google', style: TextStyle(fontSize: 12.5)),
                      SizedBox(height: 2),
                      Text('Linked or not',
                          style:
                              TextStyle(fontSize: 10.5, color: AppColors.dim)),
                    ],
                  ),
                ),
                if (p.hasGoogle)
                  OutlinedButton(
                    onPressed: _unlinkGoogle,
                    style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 7),
                        textStyle: const TextStyle(fontSize: 11)),
                    child: const Text('Unlink'),
                  ),
              ],
            ),
          ),
          _PlainRow(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Password', style: TextStyle(fontSize: 12.5)),
                      const SizedBox(height: 2),
                      Text(
                        p.hasPassword
                            ? 'Set'
                            : 'Not set — add one to sign in without Google',
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: _changePassword,
                  child: Text(p.hasPassword ? 'Change' : 'Set password'),
                ),
              ],
            ),
          ),
        ]),
        const SectionHead(title: 'Telegram delivery'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(15),
            decoration: _panelDecoration,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Link your Telegram to track your bot downloads here.',
                  style: TextStyle(fontSize: 12, color: AppColors.dim),
                ),
                const SizedBox(height: 10),
                FilledButton(
                  onPressed: _linkTelegram,
                  child: Text(p.telegramUsername == null
                      ? 'Link Telegram'
                      : 'Update @${p.telegramUsername}'),
                ),
                if (p.telegramUsername != null) ...[
                  const SizedBox(height: 8),
                  Text('✓ Linked to @${p.telegramUsername}',
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.success)),
                ],
              ],
            ),
          ),
        ),
        const SectionHead(title: 'Playback'),
        _PanelRows(children: [
          _SwitchRow(
            title: 'Autoplay next lesson',
            subtitle: 'Automatically start the next lesson when one finishes',
            value: settings['autoplayNext'] == true,
            onChanged: (v) => _saveSettings({
              'settings': {...settings, 'autoplayNext': v},
            }),
          ),
          _SwitchRow(
            title: 'Autoplay previews',
            subtitle: 'Play course trailers when browsing',
            value: settings['previewAutoplay'] == true,
            onChanged: (v) => _saveSettings({
              'settings': {...settings, 'previewAutoplay': v},
            }),
          ),
        ]),
        const SectionHead(title: 'What can others see'),
        _PanelRows(children: [
          for (final p in const [
            (
              key: 'downloadHistory',
              label: 'Download history',
              desc: 'Courses you\'ve downloaded'
            ),
            (
              key: 'reviews',
              label: 'Reviews',
              desc: 'Your ratings and written reviews'
            ),
            (
              key: 'watchlist',
              label: 'Saved',
              desc: 'Courses you\'ve saved for later'
            ),
            (key: 'likes', label: 'Likes', desc: 'Courses you\'ve liked'),
          ])
            _PrivacyRow(
              label: p.label,
              description: p.desc,
              value: (privacy[p.key] as String?) ?? 'everyone',
              onChanged: (v) => _saveSettings({
                'privacy': {...privacy, p.key: v},
              }),
            ),
        ]),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextButton.icon(
            onPressed: _signOut,
            icon: const Icon(Icons.logout, size: 16, color: AppColors.danger),
            label: const Text('Sign out',
                style: TextStyle(color: AppColors.danger)),
          ),
        ),
      ],
    );
  }
}

const _panelDecoration = BoxDecoration(
  color: AppColors.surface,
  border: Border.fromBorderSide(BorderSide(color: AppColors.border)),
  borderRadius: BorderRadius.all(Radius.circular(14)),
);

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(text,
          style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: AppColors.dim)),
    );
  }
}

class _SignedOut extends StatelessWidget {
  const _SignedOut({required this.onSignIn});
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          children: [
            const Icon(Icons.account_circle_outlined,
                size: 44, color: AppColors.accent),
            const SizedBox(height: 12),
            const Text('Sign in to Syncourse',
                style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: AppColors.text)),
            const SizedBox(height: 6),
            const Text(
              'Your library, progress, lists and certificates live on your account across web, app and Telegram.',
              textAlign: TextAlign.center,
              style:
                  TextStyle(fontSize: 12.5, height: 1.55, color: AppColors.dim),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                  onPressed: onSignIn, child: const Text('Sign in')),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => Navigator.pushNamed(context, '/browse'),
                child: const Text('Browse instead'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({
    required this.profile,
    required this.onEdit,
    required this.onShare,
    required this.onSignOut,
    this.onAdmin,
  });

  final UserProfile profile;
  final VoidCallback onEdit, onShare, onSignOut;
  final VoidCallback? onAdmin;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Container(
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF4A3517), Color(0xFF1A1611)],
            ),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 10, 0),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('YOUR SYNCOURSE',
                          style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.1,
                              color: AppColors.accent)),
                    ),
                    IconButton(
                      tooltip: 'Edit profile',
                      onPressed: onEdit,
                      icon: const Icon(Icons.settings,
                          size: 16, color: AppColors.ink3),
                    ),
                    IconButton(
                      tooltip: 'Share profile',
                      onPressed: onShare,
                      icon: const Icon(Icons.share,
                          size: 16, color: AppColors.ink3),
                    ),
                    if (onAdmin != null)
                      IconButton(
                        tooltip: 'Admin console',
                        onPressed: onAdmin,
                        icon: const Icon(Icons.build_outlined,
                            size: 16, color: AppColors.ink3),
                      ),
                    IconButton(
                      tooltip: 'Sign out',
                      onPressed: onSignOut,
                      icon: const Icon(Icons.logout,
                          size: 16, color: AppColors.danger),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
                child: Row(
                  children: [
                    CoverPlate(
                      seed: profile.name,
                      imageUrl: profile.avatarUrl,
                      width: 66,
                      height: 66,
                      radius: 33,
                      glyph: profile.name.isEmpty
                          ? '?'
                          : profile.name[0].toUpperCase(),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(profile.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: -0.7,
                                        color: AppColors.text)),
                              ),
                              if (profile.isVerified)
                                const Padding(
                                  padding: EdgeInsets.only(left: 5),
                                  child: Icon(Icons.check_circle,
                                      size: 15, color: AppColors.accent),
                                ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '@${profile.username}'
                            ' · Member since ${_date(profile.memberSince.toIso8601String())}',
                            maxLines: 2,
                            style: const TextStyle(
                                fontSize: 11.5, color: AppColors.ink4),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.profile});
  final UserProfile profile;

  @override
  Widget build(BuildContext context) {
    final entries = [
      ('DOWNLOADED', profile.stats['downloaded'] ?? 0),
      ('SAVED', profile.stats['saved'] ?? 0),
      ('LIKED', profile.stats['liked'] ?? 0),
      ('LISTS', profile.stats['lists'] ?? 0),
      ('REVIEWS', profile.stats['reviews'] ?? 0),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: _panelDecoration,
        child: Row(
          children: [
            for (var i = 0; i < entries.length; i++) ...[
              if (i > 0)
                Container(width: 1, height: 26, color: AppColors.border),
              Expanded(
                child: Column(
                  children: [
                    Text('${entries[i].$2}',
                        style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text)),
                    const SizedBox(height: 2),
                    Text(entries[i].$1,
                        style: const TextStyle(
                            fontSize: 8,
                            letterSpacing: .6,
                            color: AppColors.dim)),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const tabs = [
      (value: 'library', label: 'Library', icon: Icons.local_library_outlined),
      (value: 'stats', label: 'Stats', icon: Icons.bar_chart),
      (value: 'subscription', label: 'Subscription', icon: Icons.credit_card),
      (value: 'settings', label: 'Settings', icon: Icons.settings_outlined),
    ];
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceSunk,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          for (final t in tabs)
            Expanded(
              child: GestureDetector(
                onTap: () => onChanged(t.value),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: value == t.value
                        ? AppColors.surfaceRaised
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Column(
                    children: [
                      Icon(t.icon,
                          size: 15,
                          color: value == t.value
                              ? AppColors.accent
                              : AppColors.dim),
                      const SizedBox(height: 3),
                      Text(t.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: value == t.value
                                  ? AppColors.ink1
                                  : AppColors.dim)),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _PanelRows extends StatelessWidget {
  const _PanelRows({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: _panelDecoration,
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const Divider(height: 1, color: AppColors.border),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
    this.trailingLabel,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final String? trailingLabel;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppColors.accentSoft,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(icon, size: 16, color: AppColors.accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink1)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!,
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim)),
                  ],
                ],
              ),
            ),
            if (trailingLabel != null)
              Text(trailingLabel!,
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppColors.accent)),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right, size: 18, color: AppColors.dim),
          ],
        ),
      ),
    );
  }
}

class _PlainRow extends StatelessWidget {
  const _PlainRow({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(14),
      child: child,
    );
  }
}

class _MutedPanel extends StatelessWidget {
  const _MutedPanel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(15),
        decoration: _panelDecoration,
        child: Text(text,
            style: const TextStyle(
                fontSize: 12, height: 1.55, color: AppColors.dim)),
      ),
    );
  }
}

class _StatPanel extends StatelessWidget {
  const _StatPanel({required this.title, required this.child, this.subtitle});
  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(15),
        decoration: _panelDecoration,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w800)),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(subtitle!,
                  style: const TextStyle(fontSize: 10.5, color: AppColors.dim)),
            ],
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _BarRow extends StatelessWidget {
  const _BarRow({required this.label, required this.pct, this.count});
  final String label;
  final int pct;
  final int? count;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 82,
          child: Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: AppColors.ink3)),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (pct.clamp(0, 100)) / 100,
              minHeight: 6,
              backgroundColor: AppColors.surfaceRaised,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.accent),
            ),
          ),
        ),
        const SizedBox(width: 8),
        SizedBox(
          width: 34,
          child: Text('${count ?? pct}${count == null ? '%' : ''}',
              textAlign: TextAlign.right,
              style: const TextStyle(fontSize: 10.5, color: AppColors.ink4)),
        ),
      ],
    );
  }
}

class _BarList extends StatelessWidget {
  const _BarList({required this.rows});
  final List<({String label, int count})> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Text('Nothing here yet.',
          style: TextStyle(fontSize: 12, color: AppColors.dim));
    }
    final max = rows.map((r) => r.count).fold<int>(1, (a, b) => b > a ? b : a);
    return Column(
      children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: _BarRow(
              label: r.label,
              pct: ((r.count / max) * 100).round(),
              count: r.count,
            ),
          ),
      ],
    );
  }
}

class _PctBars extends StatelessWidget {
  const _PctBars({required this.rows});
  final List<({String label, int pct})> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return const Text('Nothing here yet.',
          style: TextStyle(fontSize: 12, color: AppColors.dim));
    }
    return Column(
      children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 7),
            child: _BarRow(label: r.label, pct: r.pct, count: r.pct),
          ),
      ],
    );
  }
}

class _ColumnBars extends StatelessWidget {
  const _ColumnBars({required this.data});
  final List<({String label, int count})> data;

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) {
      return const Text('Nothing here yet.',
          style: TextStyle(fontSize: 12, color: AppColors.dim));
    }
    final max = data.map((d) => d.count).fold<int>(1, (a, b) => b > a ? b : a);
    return SizedBox(
      height: 92,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final d in data)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text('${d.count}',
                        style: const TextStyle(
                            fontSize: 8.5, color: AppColors.dim)),
                    const SizedBox(height: 3),
                    Container(
                      height: 6 + (54 * (d.count / max)),
                      decoration: BoxDecoration(
                        color: d.count == 0
                            ? AppColors.surfaceRaised
                            : AppColors.accent,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(d.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            const TextStyle(fontSize: 8, color: AppColors.dim)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title, subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return _PlainRow(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 12.5)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.dim)),
              ],
            ),
          ),
          Switch(
            value: value,
            activeThumbColor: AppColors.accent,
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _PrivacyRow extends StatelessWidget {
  const _PrivacyRow({
    required this.label,
    required this.description,
    required this.value,
    required this.onChanged,
  });

  final String label, description, value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return _PlainRow(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 12.5)),
                const SizedBox(height: 2),
                Text(description,
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.dim)),
              ],
            ),
          ),
          DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              dropdownColor: AppColors.surfaceRaised,
              style: const TextStyle(fontSize: 11.5, color: AppColors.ink2),
              items: const [
                DropdownMenuItem(value: 'everyone', child: Text('Everyone')),
                DropdownMenuItem(value: 'friends', child: Text('Friends')),
                DropdownMenuItem(value: 'nobody', child: Text('Only me')),
              ],
              onChanged: (v) {
                if (v != null) onChanged(v);
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _GiftPanel extends StatefulWidget {
  const _GiftPanel({required this.onRedeem});
  final Future<void> Function(String code) onRedeem;

  @override
  State<_GiftPanel> createState() => _GiftPanelState();
}

class _GiftPanelState extends State<_GiftPanel> {
  final _controller = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: _panelDecoration,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Got a pass from a friend or a promotion? Redeeming it extends Premium on this account.',
              style: TextStyle(fontSize: 12, color: AppColors.dim),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(hintText: 'SYN-XXXXXXXX'),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _busy || _controller.text.trim().length < 3
                      ? null
                      : () async {
                          setState(() => _busy = true);
                          await widget.onRedeem(_controller.text.trim());
                          _controller.clear();
                          if (mounted) setState(() => _busy = false);
                        },
                  child: Text(_busy ? 'Checking…' : 'Redeem'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
