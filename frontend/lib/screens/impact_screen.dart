import 'package:flutter/material.dart';
import 'package:flutter/services.dart';


class ImpactScreen extends StatefulWidget {
  const ImpactScreen({super.key});

  @override
  State<ImpactScreen> createState() => _ImpactScreenState();
}

class _ImpactScreenState extends State<ImpactScreen> {
  static const _bg = Color(0xFF0D1912);
  static const _green = Color(0xFF32865B);
  static const _text = Color(0xFFF4F7F4);

  String _audience = 'Me';
  String _period = 'Month';

  bool get _hasSampleData => _audience == 'Me' && _period == 'Month';

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: _bg,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 28),
            children: [
              const Text(
                'Your impact',
                style: TextStyle(
                  color: _text,
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 20),
              const _FieldLabel('View impact for'),
              const SizedBox(height: 8),
              _SegmentedChoices(
                options: const ['Me', 'Community'],
                selected: _audience,
                onSelected: (value) => setState(() => _audience = value),
              ),
              const SizedBox(height: 20),
              const _FieldLabel('Time period'),
              const SizedBox(height: 8),
              _SegmentedChoices(
                options: const ['Month', 'Year', 'Lifetime'],
                selected: _period,
                onSelected: (value) => setState(() => _period = value),
              ),
              const SizedBox(height: 20),
              if (_hasSampleData) ...[
                const _SummaryCard(),
                const SizedBox(height: 24),
                const _SectionTitle('By category'),
                const SizedBox(height: 14),
                const _CategoryProgress(label: 'Transit', percentage: 60),
                const SizedBox(height: 16),
                const _CategoryProgress(label: 'Recycling', percentage: 25),
                const SizedBox(height: 16),
                const _CategoryProgress(label: 'Planting', percentage: 15),
                const SizedBox(height: 24),
                const _PrivacyCard(),
                const SizedBox(height: 20),
                SizedBox(
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: _copyImpact,
                    icon: const Icon(Icons.copy_outlined, size: 19),
                    label: const Text('Copy impact summary'),
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
    const summary = 'My Juthoor impact this month: 260 km less driving '
        'and an estimated 64.2 kg CO₂. '
        'Category breakdown: Transit 60%, Recycling 25%, Planting 15%.';
    await Clipboard.setData(const ClipboardData(text: summary));
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      const SnackBar(content: Text('Impact summary copied to clipboard')),
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

class _SegmentedChoices extends StatelessWidget {
  const _SegmentedChoices({
    required this.options,
    required this.selected,
    required this.onSelected,
  });

  final List<String> options;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          Expanded(
            child: _OptionButton(
              label: options[i],
              selected: options[i] == selected,
              onTap: () => onSelected(options[i]),
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
            color: selected
                ? const Color(0xFF32865B)
                : const Color(0xFF304538),
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
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
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF287A52),
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'THIS MONTH',
            style: TextStyle(
              color: Color(0xFFE0F0E5),
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
            ),
          ),
          SizedBox(height: 8),
          Text(
            '260 km',
            style: TextStyle(
              color: Colors.white,
              fontSize: 40,
              fontWeight: FontWeight.w800,
              height: 1.08,
            ),
          ),
          SizedBox(height: 10),
          Text(
            'Less driving on Sheikh Zayed Road',
            style: TextStyle(color: Colors.white, fontSize: 14, height: 1.4),
          ),
          SizedBox(height: 4),
          Text(
            'Estimated emissions avoided: 64.2 kg CO₂',
            style: TextStyle(color: Color(0xFFE0F0E5), fontSize: 13),
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
    return Semantics(
      label: '$label, $percentage percent',
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
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF17281E),
        border: Border.all(color: const Color(0xFF304538)),
        borderRadius: BorderRadius.circular(16),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.shield_outlined, size: 20, color: Color(0xFFB3E3C6)),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Privacy-safe map',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          SizedBox(height: 8),
          Text(
            'Activity is shown by neighbourhood, never by exact location.',
            style: TextStyle(
              color: Color(0xFFCCD8CF),
              fontSize: 13,
              height: 1.45,
            ),
          ),
          SizedBox(height: 14),
          _IllustrativeHeatmap(),
          SizedBox(height: 7),
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
      label: 'Illustrative heatmap with two broad green activity areas',
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
      child: const Column(
        children: [
          Icon(
            Icons.insights_outlined,
            color: Color(0xFFB3E3C6),
            size: 36,
          ),
          SizedBox(height: 12),
          Text(
            'No impact data available',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Impact statistics for this selection '
            'are not available yet.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Color(0xFFCCD8CF),
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}