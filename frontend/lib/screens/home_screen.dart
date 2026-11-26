import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/activity_models.dart';
import '../services/activity_api.dart';
import '../services/api_exception.dart';
import '../services/error_messages.dart';
import 'activity_status_screen.dart';
import 'my_activities_screen.dart';
import 'record_activity_screen.dart';

/// ---------- Theme colors ----------
class AppColors {
  static const bg = Color(0xFF0E1712);
  static const card = Color(0xFF15211A);
  static const border = Color(0xFF2A3A31);
  static const green = Color(0xFF3E8C5E);
  static const greenBright = Color(0xFF4FB27A);
  static const progressTrack = Color(0xFF5E9C78);
  static const progressFill = Color(0xFFEADBA8);
  static const textPrimary = Colors.white;
  static const textSecondary = Color(0xFF9BA8A0);
}

/// ---------- Shell with bottom navigation ----------
/// Only implemented destinations are shown (Home, Activities).
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final tabs = [l10n.tabHome, l10n.tabActivities];
    return Scaffold(
      body: SafeArea(
        child: _index == 0
            ? HomePage(onViewAll: () => setState(() => _index = 1))
            : const MyActivitiesScreen(),
      ),
      bottomNavigationBar: _BottomNav(
        tabs: tabs,
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  final List<String> tabs;
  final int currentIndex;
  final ValueChanged<int> onTap;

  const _BottomNav(
      {required this.tabs, required this.currentIndex, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 56,
          child: Row(
            children: List.generate(tabs.length, (i) {
              final selected = i == currentIndex;
              return Expanded(
                child: Semantics(
                  button: true,
                  selected: selected,
                  excludeSemantics: true,
                  label: tabs[i],
                  onTap: () => onTap(i),
                  child: InkWell(
                    onTap: () => onTap(i),
                    child: Column(
                      children: [
                        Container(
                          height: 3,
                          color: selected
                              ? AppColors.greenBright
                              : Colors.transparent,
                        ),
                        Expanded(
                          child: Center(
                            child: Text(
                              tabs[i],
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: selected
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: selected
                                    ? AppColors.textPrimary
                                    : AppColors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

/// ---------- Home page ----------
/// Real data only: the participant's own activities from the backend list
/// call (FR-017). No points, levels, challenges or impact figures are shown
/// until those features exist.
class HomePage extends StatefulWidget {
  final VoidCallback? onViewAll;
  const HomePage({super.key, this.onViewAll});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  static const _recentCount = 3;

  List<ActivityView>? items;
  String? errorCode;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => load());
  }

  Future<void> load() async {
    final api = context.read<ActivityApi>();
    setState(() => errorCode = null);
    try {
      final r = await api.listActivities();
      if (mounted) setState(() => items = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => errorCode = e.code);
    }
  }

  Future<void> _push(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    if (mounted) load(); // reflect new or updated activities
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 16, 16, 24),
      children: [
        _Header(title: l10n.appTitle, subtitle: l10n.homeSubtitle),
        const SizedBox(height: 14),
        _RecordButton(onPressed: () => _push(const RecordActivityScreen())),
        ..._content(context, l10n),
      ],
    );
  }

  List<Widget> _content(BuildContext context, AppLocalizations l10n) {
    if (errorCode != null) {
      return [
        const SizedBox(height: 24),
        Text(messageForCode(l10n, errorCode!),
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textSecondary)),
        const SizedBox(height: 12),
        Center(
          child: ElevatedButton(onPressed: load, child: Text(l10n.retry)),
        ),
      ];
    }
    final list = items;
    if (list == null) {
      return const [
        SizedBox(height: 32),
        Center(child: CircularProgressIndicator()),
      ];
    }
    if (list.isEmpty) {
      return [
        const SizedBox(height: 24),
        _InfoCard(title: l10n.homeEmptyTitle, subtitle: l10n.homeEmptyBody),
      ];
    }
    final locale = Localizations.localeOf(context);
    final counts = <ActivityStatus, int>{};
    for (final a in list) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return [
      const SizedBox(height: 16),
      Text(l10n.homeTotalActivities(list.length),
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final e in counts.entries)
            Semantics(
              label: l10n.homeStatusCountSemantics(
                  statusLabel(l10n, e.key), e.value),
              excludeSemantics: true,
              child: _CountChip(status: e.key, count: e.value),
            ),
        ],
      ),
      _SectionTitle(l10n.recentActivitiesTitle,
          actionLabel: l10n.viewAllActivities, onAction: widget.onViewAll),
      for (final a in list.take(_recentCount)) ...[
        _ActivityRow(
          activity: a,
          locale: locale,
          onTap: () =>
              _push(ActivityStatusScreen(activityId: a.id, initial: a)),
        ),
        const SizedBox(height: 10),
      ],
    ];
  }
}

/// ---------- Widgets ----------
class _Header extends StatelessWidget {
  final String title;
  final String subtitle;
  const _Header({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary)),
        const SizedBox(height: 2),
        Text(subtitle,
            style: const TextStyle(
                fontSize: 12.5, color: AppColors.textSecondary)),
      ],
    );
  }
}

class _CountChip extends StatelessWidget {
  final ActivityStatus status;
  final int count;
  const _CountChip({required this.status, required this.count});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding:
          const EdgeInsetsDirectional.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(statusIcon(status), size: 16, color: statusColor(status)),
          const SizedBox(width: 6),
          Text('${statusLabel(l10n, status)} · $count',
              style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary)),
        ],
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final ActivityView activity;
  final Locale locale;
  final VoidCallback onTap;
  const _ActivityRow(
      {required this.activity, required this.locale, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final name = activity.activityType.name.of(locale);
    final status = statusLabel(l10n, activity.status);
    final date = activity.submittedAt == null
        ? ''
        : DateFormat.yMd(locale.toString())
            .format(activity.submittedAt!.toLocal());
    return Semantics(
      button: true,
      label: '$name, $status, $date',
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        color: AppColors.card,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: 64),
            padding: const EdgeInsetsDirectional.symmetric(
                horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Icon(statusIcon(activity.status),
                    color: statusColor(activity.status)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textPrimary)),
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          StatusChip(status: activity.status),
                          if (date.isNotEmpty)
                            Text(date,
                                style: const TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const _ChevronIcon(),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RecordButton extends StatelessWidget {
  final VoidCallback onPressed;
  const _RecordButton({required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.green,
          foregroundColor: Colors.white,
          elevation: 0,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
        onPressed: onPressed,
        child: Text(AppLocalizations.of(context).recordActivityButton,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;
  const _SectionTitle(this.text, {this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsetsDirectional.only(top: 18, bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(text,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary)),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              style: TextButton.styleFrom(
                minimumSize: const Size(48, 48),
                foregroundColor: AppColors.greenBright,
              ),
              onPressed: onAction,
              child: Text(actionLabel!),
            ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String title;
  final String subtitle;
  const _InfoCard({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding:
          const EdgeInsetsDirectional.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 3),
          Text(subtitle,
              style: const TextStyle(
                  fontSize: 12, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

/// Chevron that points in the reading direction (mirrors in RTL).
class _ChevronIcon extends StatelessWidget {
  const _ChevronIcon();

  @override
  Widget build(BuildContext context) {
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return Icon(rtl ? Icons.chevron_left : Icons.chevron_right,
        color: AppColors.textSecondary, size: 20);
  }
}
