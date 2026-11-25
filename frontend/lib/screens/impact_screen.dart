import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/app_localizations.dart';

enum _Audience { me, community }

enum _Period { month, year, lifetime }

class ImpactScreen extends StatefulWidget {
  const ImpactScreen({super.key});

  @override
  State<ImpactScreen> createState() => _ImpactScreenState();
}

class _ImpactScreenState extends State<ImpactScreen> {
  static const _bg = Color(0xFF0D1912);
  static const _green = Color(0xFF32865B);
  static const _text = Color(0xFFF4F7F4);

  _Audience _audience = _Audience.me;
  _Period _period = _Period.month;

  bool get _hasSampleData =>
      _audience == _Audience.me && _period == _Period.month;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return ColoredBox(
      color: _bg,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 28),
            children: [
              Text(
                l10n.impactScreenTitle,
                style: const TextStyle(
                  color: _text,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 20),
              _FieldLabel(l10n.impactViewFor),
              const SizedBox(height: 8),
              _SegmentedChoices<_Audience>(
                options: [
                  (_Audience.me, l10n.impactAudienceMe),
                  (_Audience.community, l10n.impactAudienceCommunity),
                ],
                selected: _audience,
                onSelected: (value) => setState(() => _audience = value),
              ),
              const SizedBox(height: 20),
              _FieldLabel(l10n.impactTimePeriod),
              const SizedBox(height: 8),
              _SegmentedChoices<_Period>(
                options: [
                  (_Period.month, l10n.impactPeriodMonth),
                  (_Period.year, l10n.impactPeriodYear),
                  (_Period.lifetime, l10n.impactPeriodLifetime),
                ],
                selected: _period,
                onSelected: (value) => setState(() => _period = value),
              ),
              const SizedBox(height: 20),
              if (_hasSampleData) ...[
                const _SummaryCard(),
                const SizedBox(height: 24),
                _SectionTitle(l10n.impactByCategory),
                const SizedBox(height: 14),
                _CategoryProgress(
                  label: l10n.impactCategoryTransit,
                  percentage: 60,
                ),
                const SizedBox(height: 16),
                _CategoryProgress(
                  label: l10n.impactCategoryRecycling,
                  percentage: 25,
                ),
                const SizedBox(height: 16),
                _CategoryProgress(
                  label: l10n.impactCategoryPlanting,
                  percentage: 15,
                ),
                const SizedBox(height: 24),
                const _PrivacyCard(),
                const SizedBox(height: 20),
                SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: _copyImpact,
                    icon: const Icon(Icons.copy_outlined, size: 19),
                    label: Text(l10n.impactCopyButton),
                    style: FilledButton.styleFrom(
                      backgroundColor: _green,
                      foregroundColor: Colors.white,
                      textStyle: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ] else
                const _EmptyImpactState(),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _copyImpact() async {
    final l10n = AppLocalizations.of(context);
    final summary = l10n.impactCopySummary;
    final copiedMessage = l10n.impactCopied;
    await Clipboard.setData(ClipboardData(text: summary));
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(copiedMessage)),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Text(
        label,
        style: const TextStyle(
          color: Color(0xFFCCD8CF),
          fontSize: 13,
          fontWeight: FontWeight.w600,
        ),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Text(
        title,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 17,
          fontWeight: FontWeight.w700,
        ),
      );
}

class _SegmentedChoices<T> extends StatelessWidget {
  const _SegmentedChoices({
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  /// Stable id paired with its localized label.
  final List<(T, String)> options;
  final T selected;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _OptionButton(
              label: options[i].$2,
              selected: options[i].$1 == selected,
              onTap: () => onSelected(options[i].$1),
            ),
          ),
        ],
      ],
    );
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: selected ? const Color(0xFF32865B) : const Color(0xFF17281E),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: selected ? const Color(0xFF32865B) : const Color(0xFF304538),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Center(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
                child: Text(
                  label,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF287A52),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.impactThisMonth,
            style: const TextStyle(
              color: Color(0xFFE0F0E5),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.impactDistanceValue,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 40,
              fontWeight: FontWeight.w800,
              height: 1.08,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            l10n.impactDrivingDescription,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            l10n.impactEmissionsAvoided,
            style: const TextStyle(color: Color(0xFFE0F0E5), fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _CategoryProgress extends StatelessWidget {
  const _CategoryProgress({required this.label, required this.percentage});
  final String label;
  final int percentage;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Semantics(
      label: l10n.impactCategorySemantics(label, percentage),
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  label,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                ),
                Text(
                  '$percentage%',
                  style: const TextStyle(
                    color: Color(0xFFCCD8CF),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(
                value: percentage / 100,
                minHeight: 10,
                backgroundColor: const Color(0xFF304538),
                valueColor: const AlwaysStoppedAnimation(Color(0xFF45AA76)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrivacyCard extends StatelessWidget {
  const _PrivacyCard();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF17281E),
        border: Border.all(color: const Color(0xFF304538)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.shield_outlined,
                size: 20,
                color: Color(0xFFB3E3C6),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  l10n.impactPrivacyTitle,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            l10n.impactPrivacyBody,
            style: const TextStyle(
              color: Color(0xFFCCD8CF),
              fontSize: 13,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 14),
          const _IllustrativeHeatmap(),
          const SizedBox(height: 7),
        ],
      ),
    );
  }
}

class _IllustrativeHeatmap extends StatelessWidget {
  const _IllustrativeHeatmap();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: AppLocalizations.of(context).impactHeatmapSemantics,
      image: true,
      child: ExcludeSemantics(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 100,
            color: const Color(0xFF0D1912),
            child: const Row(
              children: [
                Expanded(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        colors: [Color(0xAA32865B), Color(0x002F8057)],
                        radius: 0.85,
                      ),
                    ),
                  ),
                ),
                Expanded(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        colors: [Color(0xBB82C99C), Color(0x002F8057)],
                        radius: 0.85,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyImpactState extends StatelessWidget {
  const _EmptyImpactState();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF17281E),
        border: Border.all(
          color: const Color(0xFF304538),
        ),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          const Icon(
            Icons.insights_outlined,
            color: Color(0xFFB3E3C6),
            size: 36,
          ),
          const SizedBox(height: 12),
          Text(
            l10n.impactEmptyTitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            l10n.impactEmptyBody,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFFCCD8CF),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
