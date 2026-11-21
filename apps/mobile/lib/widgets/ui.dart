import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';

/// The phone header from the web's `MobileHeader`: the wordmark (or a page
/// title), then Ask, Search, Download and Me. Pushed screens get a back arrow
/// in front of the title so the floating tab bar never has to do double duty.
class SyncourseHeader extends StatelessWidget {
  const SyncourseHeader({
    super.key,
    this.title,
    this.showBack = false,
    this.showActions = true,
  });

  final String? title;
  final bool showBack;
  final bool showActions;

  @override
  Widget build(BuildContext context) {
    // The desktop shell has its own persistent top bar. A tab page therefore
    // hides the phone header at desktop widths; pushed pages keep theirs so the
    // back affordance and page title do not disappear.
    if (!showBack && MediaQuery.sizeOf(context).width >= kDesktopBreakpoint) {
      return const SizedBox.shrink();
    }
    final label = title ?? 'Syncourse';
    final isBrand = title == null || title == 'Syncourse';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 18),
      child: Row(
        children: [
          if (showBack)
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 34, minHeight: 34),
              icon: const Icon(Icons.arrow_back_ios_new,
                  size: 17, color: AppColors.ink2),
              onPressed: () => Navigator.maybePop(context),
            ),
          Expanded(
            child: GestureDetector(
              onTap: isBrand
                  ? () => Navigator.popUntil(context, (r) => r.isFirst)
                  : null,
              behavior: HitTestBehavior.opaque,
              child: isBrand
                  ? RichText(
                      text: const TextSpan(
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1.2,
                          color: AppColors.text,
                        ),
                        children: [
                          TextSpan(text: 'Sync'),
                          TextSpan(
                              text: 'ourse',
                              style: TextStyle(color: AppColors.accent)),
                        ],
                      ),
                    )
                  : Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 23,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.7,
                        color: AppColors.text,
                      ),
                    ),
            ),
          ),
          if (showActions) ...[
            _HeaderIcon(
              icon: Icons.auto_awesome_outlined,
              label: 'Ask the study assistant',
              onTap: () => Navigator.pushNamed(context, '/ask'),
            ),
            _HeaderIcon(
              icon: Icons.search,
              label: 'Search',
              onTap: () => Navigator.pushNamed(context, '/search'),
            ),
            _HeaderIcon(
              icon: Icons.smartphone_outlined,
              label: 'Download the app',
              onTap: () => Navigator.pushNamed(context, '/download'),
            ),
            _HeaderIcon(
              icon: Icons.account_circle_outlined,
              label: 'Your profile',
              onTap: () => Navigator.pushNamed(context, '/me'),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeaderIcon extends StatelessWidget {
  const _HeaderIcon({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: label,
      iconSize: 20,
      color: AppColors.ink3,
      splashRadius: 22,
      onPressed: onTap,
      icon: Icon(icon),
    );
  }
}

/// A section head with the web's small chevron: title, optional subtitle and a
/// "See all" affordance on the right.
class SectionHead extends StatelessWidget {
  const SectionHead({
    super.key,
    required this.title,
    this.subtitle,
    this.onSeeAll,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(16, 30, 16, 12),
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onSeeAll;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: onSeeAll,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.4,
                            color: AppColors.text,
                          ),
                        ),
                      ),
                      if (onSeeAll != null)
                        const Icon(Icons.chevron_right,
                            size: 20, color: AppColors.ink4),
                    ],
                  ),
                ),
                if (subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!,
                    style: const TextStyle(
                        fontSize: 12.5, height: 1.45, color: AppColors.dim),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[
            const SizedBox(width: 10),
            trailing!,
          ] else if (onSeeAll != null)
            TextButton(
              onPressed: onSeeAll,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.accent,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('See all',
                  style:
                      TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }
}

/// The warm branded plate behind every cover. A real image lies over it, so a
/// slow or blocked thumbnail never leaves a hole in the rail.
class CoverPlate extends StatelessWidget {
  const CoverPlate({
    super.key,
    required this.seed,
    required this.imageUrl,
    this.width,
    this.height,
    this.radius = 10,
    this.glyph = '🎓',
    this.fit = BoxFit.cover,
  });

  final String seed;
  final String? imageUrl;
  final double? width;
  final double? height;
  final double radius;
  final String glyph;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final hue = hueFromString(seed);
    final colorA = HSLColor.fromAHSL(1, hue.toDouble(), 0.42, 0.18).toColor();
    final colorB =
        HSLColor.fromAHSL(1, ((hue + 55) % 360).toDouble(), 0.50, 0.09)
            .toColor();
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        width: width,
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [colorA, colorB],
                ),
              ),
              child: Center(
                child: Text(glyph, style: const TextStyle(fontSize: 30)),
              ),
            ),
            if (imageUrl != null && imageUrl!.isNotEmpty)
              Image.network(
                imageUrl!,
                fit: fit,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                loadingBuilder: (context, child, progress) =>
                    progress == null ? child : const SizedBox.shrink(),
              ),
          ],
        ),
      ),
    );
  }
}

/// Poster card used by every horizontal rail. Width is fixed at the web's
/// phone breakpoint (142px) so the row scrolls with a consistent rhythm.
class CoursePoster extends StatelessWidget {
  const CoursePoster({
    super.key,
    required this.course,
    this.width = 142,
    this.showRank = false,
  });

  final CourseSummary course;
  final double width;
  final bool showRank;

  @override
  Widget build(BuildContext context) {
    final glyph = course.isMini ? '⚡' : '🎓';
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/courses/${course.slug}'),
      child: SizedBox(
        width: width,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                CoverPlate(
                  seed: course.slug,
                  imageUrl: course.thumbnailUrl,
                  width: width,
                  height: width * 1.32,
                  radius: 10,
                  glyph: glyph,
                ),
                if (course.isNew)
                  const Positioned(
                    left: 6,
                    top: 6,
                    child: _Badge(text: 'Added', tone: AppColors.premium),
                  ),
                if (course.isPremium)
                  Positioned(
                    right: 6,
                    top: 6,
                    child: _Badge(text: 'Premium', tone: AppColors.accent),
                  ),
                if (showRank && course.rank != null)
                  Positioned(
                    left: 7,
                    bottom: 6,
                    child: Text(
                      '${course.rank}',
                      style: const TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                        shadows: [
                          Shadow(blurRadius: 10, color: Colors.black54),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              course.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12.5,
                height: 1.25,
                fontWeight: FontWeight.w700,
                color: AppColors.ink1,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              [course.level, course.durationText]
                  .where((e) => e.isNotEmpty)
                  .join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10.5, color: AppColors.dim),
            ),
            if (course.ratingCount > 0) ...[
              const SizedBox(height: 3),
              Row(
                children: [
                  const Icon(Icons.star, size: 11, color: AppColors.accent),
                  const SizedBox(width: 3),
                  Text(
                    '${course.ratingAvg.toStringAsFixed(1)} (${course.ratingCount})',
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.ink4),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The compact landscape row from Browse and Search.
class CourseRowTile extends StatelessWidget {
  const CourseRowTile(
      {super.key, required this.course, this.showChevron = true});

  final CourseSummary course;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/courses/${course.slug}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 11),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            CoverPlate(
              seed: course.slug,
              imageUrl: course.thumbnailUrl,
              width: 74,
              height: 52,
              radius: 8,
              glyph: course.isMini ? '⚡' : '🎓',
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    course.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14.5,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [course.level, course.durationText]
                        .where((e) => e.isNotEmpty)
                        .join(' · '),
                    style:
                        const TextStyle(fontSize: 11.5, color: AppColors.dim),
                  ),
                  if (course.ratingCount > 0) ...[
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(Icons.star,
                            size: 12, color: AppColors.accent),
                        const SizedBox(width: 3),
                        Text(
                          '${course.ratingAvg.toStringAsFixed(1)} (${course.ratingCount})',
                          style: const TextStyle(
                              fontSize: 11.5, color: AppColors.ink4),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            if (showChevron)
              const Icon(Icons.chevron_right, color: AppColors.dim, size: 20),
          ],
        ),
      ),
    );
  }
}

class ResourceTile extends StatelessWidget {
  const ResourceTile({super.key, required this.resource});

  final ResourceSummary resource;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => Navigator.pushNamed(context, '/resources/${resource.slug}'),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(14),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                CoverPlate(
                  seed: resource.slug,
                  imageUrl: resource.coverUrl,
                  width: double.infinity,
                  height: 96,
                  radius: 0,
                  glyph: resource.type == 'roadmap'
                      ? '🗺️'
                      : resource.type == 'cheat-sheet'
                          ? '📄'
                          : '📝',
                ),
                Positioned(
                  left: 8,
                  top: 8,
                  child: _Badge(text: resource.typeLabel, tone: Colors.black54),
                ),
                if (resource.isPremium)
                  const Positioned(
                    right: 8,
                    top: 8,
                    child: _Badge(text: 'Premium', tone: AppColors.accent),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(11, 10, 11, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    resource.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.25,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink1,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    '${resource.readMinutes} min read'
                    '${resource.mediaCount > 0 ? ' · ${resource.mediaCount} file${resource.mediaCount == 1 ? '' : 's'}' : ''}',
                    style:
                        const TextStyle(fontSize: 10.5, color: AppColors.dim),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.tone});
  final String text;
  final Color tone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 8.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.3,
          color: Colors.white,
        ),
      ),
    );
  }
}

/// The pill tab strip used above filters and search results.
class PillTabs extends StatelessWidget {
  const PillTabs({
    super.key,
    required this.items,
    required this.value,
    required this.onChanged,
    this.scrollable = true,
  });

  final List<({String value, String label})> items;
  final String value;
  final ValueChanged<String> onChanged;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    final row = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => onChanged(item.value),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                decoration: BoxDecoration(
                  color: item.value == value
                      ? AppColors.accentSoft
                      : AppColors.surfaceSunk,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: item.value == value
                        ? AppColors.accent.withValues(alpha: 0.5)
                        : AppColors.border,
                  ),
                ),
                child: Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color:
                        item.value == value ? AppColors.accent : AppColors.ink4,
                  ),
                ),
              ),
            ),
          ),
      ],
    );
    return scrollable
        ? SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: row,
          )
        : row;
  }
}

/// Amber label above a number, the small building block of Me's panels.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.icon,
    required this.value,
    required this.label,
    this.onTap,
  });

  final IconData icon;
  final String value;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
        decoration: BoxDecoration(
          color: AppColors.surface,
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 19, color: AppColors.accent),
            const SizedBox(height: 6),
            Text(
              value,
              style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 9.5, letterSpacing: 0.4, color: AppColors.dim),
            ),
          ],
        ),
      ),
    );
  }
}

/// The empty/error state shape shared by every screen.
class StatusView extends StatelessWidget {
  const StatusView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.onAction,
    this.compose = false,
  });

  final IconData icon;
  final String title;
  final String? message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool compose;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 34, vertical: 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 46, color: AppColors.ink5),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink1),
            ),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 12.5, height: 1.5, color: AppColors.dim),
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 16),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

class LoadError extends StatelessWidget {
  const LoadError({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return StatusView(
      icon: Icons.cloud_off_outlined,
      title: 'We couldn\'t load this',
      message: message,
      actionLabel: onRetry == null ? null : 'Try again',
      onAction: onRetry,
    );
  }
}

class DividerLine extends StatelessWidget {
  const DividerLine({super.key, this.indent = 16, this.endIndent = 16});
  final double indent, endIndent;

  @override
  Widget build(BuildContext context) => Divider(
        height: 1,
        thickness: 1,
        indent: indent,
        endIndent: endIndent,
        color: AppColors.border,
      );
}
