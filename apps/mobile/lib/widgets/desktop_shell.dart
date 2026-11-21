import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';

/// The web's `TopNav`, rebuilt for the desktop builds. It is the persistent
/// chrome around every route: wordmark, search, category links and the same
/// right-hand pills (Ask, Browse, Circles, Collections, Premium, Me) the web
/// shows above its 1240px page. The phone header and floating tab bar are for
/// widths below [kDesktopBreakpoint], so the two never appear together.
class DesktopTopBar extends StatelessWidget {
  const DesktopTopBar({
    super.key,
    required this.tab,
    required this.user,
    required this.onTab,
    required this.onCircles,
    required this.onPremium,
    required this.onSignIn,
    required this.onDownload,
    required this.onSearch,
    required this.onBrowseType,
    required this.onResources,
  });

  final int tab;
  final UserProfile? user;
  final ValueChanged<int> onTab;
  final VoidCallback onCircles, onPremium, onSignIn, onDownload, onResources;
  final ValueChanged<String> onSearch;
  final ValueChanged<String> onBrowseType;

  @override
  Widget build(BuildContext context) {
    final premium = user?.isPremium == true;
    // Narrow desktop windows trade the pill labels for icons before the row
    // starts squeezing the search box.
    final compact = MediaQuery.sizeOf(context).width < 1150;
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xF512110F),
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.fromLTRB(24, 10, 24, 0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              _Brand(onTap: () => onTab(0)),
              const SizedBox(width: 26),
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 430),
                    child: _DesktopSearch(onSubmitted: onSearch),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              _NavPill(
                icon: Icons.auto_awesome_outlined,
                label: 'Ask',
                active: tab == 2,
                compact: compact,
                onTap: () => onTab(2),
              ),
              _NavPill(
                icon: Icons.grid_view_outlined,
                label: 'Browse',
                active: tab == 1,
                compact: compact,
                onTap: () => onTab(1),
              ),
              _NavPill(
                icon: Icons.groups_outlined,
                label: 'Circles',
                compact: compact,
                onTap: onCircles,
              ),
              _NavPill(
                icon: Icons.bookmark_border,
                label: 'Collections',
                active: tab == 4,
                compact: compact,
                onTap: () => onTab(4),
              ),
              if (premium)
                _PremiumBadge(compact: compact)
              else
                _NavPill(
                  icon: Icons.workspace_premium_outlined,
                  label: 'Go Premium',
                  cta: true,
                  compact: compact,
                  onTap: onPremium,
                ),
              if (user != null)
                _NavPill(
                  icon: Icons.account_circle_outlined,
                  label: 'Me',
                  active: tab == 5,
                  compact: compact,
                  onTap: () => onTab(5),
                )
              else
                _NavPill(
                  icon: Icons.login,
                  label: 'Sign in',
                  compact: compact,
                  onTap: onSignIn,
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _CategoryLink(
                label: 'All Courses',
                icon: Icons.grid_view_rounded,
                active: tab == 1,
                onTap: () => onTab(1),
              ),
              _CategoryLink(
                label: 'Mini-courses',
                icon: Icons.bolt,
                onTap: () => onBrowseType('mini-course'),
              ),
              _CategoryLink(
                label: 'Resources',
                icon: Icons.description_outlined,
                onTap: onResources,
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: onDownload,
                icon: const Icon(Icons.download, size: 15),
                label: const Text('Download app'),
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.ink3,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  textStyle: const TextStyle(fontSize: 11.5),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
        child: RichText(
          text: const TextSpan(
            style: TextStyle(
              fontSize: 21,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.7,
              color: AppColors.text,
            ),
            children: [
              TextSpan(text: 'Syncourse'),
              TextSpan(
                text: '.',
                style: TextStyle(color: AppColors.accent),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DesktopSearch extends StatefulWidget {
  const _DesktopSearch({required this.onSubmitted});
  final ValueChanged<String> onSubmitted;

  @override
  State<_DesktopSearch> createState() => _DesktopSearchState();
}

class _DesktopSearchState extends State<_DesktopSearch> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit(String value) {
    widget.onSubmitted(value.trim());
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: TextField(
        controller: _controller,
        textInputAction: TextInputAction.search,
        onSubmitted: _submit,
        style: const TextStyle(fontSize: 13, color: AppColors.text),
        decoration: InputDecoration(
          hintText: 'Search everything',
          prefixIcon: const Icon(Icons.search, size: 18, color: AppColors.dim),
          suffixIcon: _controller.text.isEmpty
              ? null
              : IconButton(
                  icon: const Icon(Icons.close, size: 15),
                  onPressed: () => setState(_controller.clear),
                ),
          filled: true,
          fillColor: AppColors.surfaceSunk,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: const BorderSide(color: AppColors.hairline),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: const BorderSide(color: AppColors.hairline),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(999),
            borderSide: const BorderSide(color: AppColors.accent),
          ),
        ),
      ),
    );
  }
}

class _NavPill extends StatelessWidget {
  const _NavPill({
    required this.icon,
    required this.label,
    required this.onTap,
    this.active = false,
    this.cta = false,
    this.compact = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool active;
  final bool cta;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final color = active
        ? AppColors.accent
        : cta
            ? AppColors.accent
            : AppColors.ink4;
    return Tooltip(
      message: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          margin: const EdgeInsets.only(left: 4),
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
          decoration: BoxDecoration(
            color: active ? AppColors.accentSoft : Colors.transparent,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: cta
                  ? AppColors.accent.withValues(alpha: .5)
                  : active
                      ? AppColors.accent.withValues(alpha: .35)
                      : Colors.transparent,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: color),
              if (!compact) ...[
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight:
                        active || cta ? FontWeight.w800 : FontWeight.w500,
                    color: color,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PremiumBadge extends StatelessWidget {
  const _PremiumBadge({this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(left: 4),
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppColors.accent.withValues(alpha: .4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.workspace_premium,
              size: 15, color: AppColors.accent),
          if (!compact) ...[
            const SizedBox(width: 6),
            const Text(
              'Premium',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.accent,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CategoryLink extends StatelessWidget {
  const _CategoryLink({
    required this.label,
    required this.icon,
    required this.onTap,
    this.active = false,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = active ? AppColors.accent : AppColors.dim;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: active ? FontWeight.w800 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The web footer is desktop-only. Inside the app it is a slim docked strip:
/// content scrolls above it, and the two groups the web shows — where to get
/// the app and the legal/support links — stay one click away.
class DesktopFooter extends StatelessWidget {
  const DesktopFooter({
    super.key,
    required this.onDownload,
    required this.onOpenWeb,
    required this.onLegal,
  });

  final VoidCallback onDownload, onOpenWeb;
  final ValueChanged<String> onLegal;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          const Text(
            'Practical skills for people who build.',
            style: TextStyle(fontSize: 10.5, color: AppColors.dim),
          ),
          const Spacer(),
          _FooterLink(label: 'Download', onTap: onDownload),
          _FooterLink(label: 'Web app', onTap: onOpenWeb),
          _FooterLink(label: 'Terms', onTap: () => onLegal('terms')),
          _FooterLink(label: 'Privacy', onTap: () => onLegal('privacy')),
          _FooterLink(label: 'Refunds', onTap: () => onLegal('refund')),
          const SizedBox(width: 4),
          const Text(
            '· Syncourse.',
            style: TextStyle(fontSize: 10.5, color: AppColors.ink5),
          ),
        ],
      ),
    );
  }
}

class _FooterLink extends StatelessWidget {
  const _FooterLink({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          label,
          style: const TextStyle(fontSize: 10.5, color: AppColors.ink4),
        ),
      ),
    );
  }
}
