import 'package:flutter/material.dart';

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
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  static const _tabs = ['Home', 'Activities', 'Impact', 'Assistant', 'Profile'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _index == 0
            ? const HomePage()
            : Center(
                child: Text(_tabs[_index],
                    style: const TextStyle(
                        color: AppColors.textSecondary, fontSize: 18)),
              ),
      ),
      bottomNavigationBar: _BottomNav(
        tabs: _tabs,
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
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
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
              );
            }),
          ),
        ),
      ),
    );
  }
}

/// ---------- Home page ----------
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      children: [
        const _Header(name: 'Rashid', subtitle: 'Dubai · Level 3: Eco-Guardian'),
        const SizedBox(height: 14),
        const _PointsCard(
          points: 1585,
          streakDays: 5,
          ptsToNext: 180,
          nextLevel: 4,
          badges: 2,
          totalBadges: 3,
          progress: 0.72,
        ),
        const SizedBox(height: 10),
        _RecordButton(onPressed: () {}),
        const SizedBox(height: 10),
        _ListCard(
          title: '5 submissions need attention',
          subtitle: 'Fix, retry or review',
          trailing: const Icon(Icons.chevron_right,
              color: AppColors.textSecondary, size: 20),
          onTap: () {},
        ),
        const _SectionTitle('Active challenge'),
        _ListCard(
          title: 'Metro Month Challenge',
          subtitle: 'Team Dubai Greens · 12 of 20 trips',
          trailing: const _GreenValue('60%'),
          onTap: () {},
        ),
        const _SectionTitle('Recommended for you', tag: 'AI-GENERATED'),
        _ListCard(
          title: 'Smart RVM at City Walk',
          subtitle: 'Recycling · Dubai · 0.8 km',
          trailing: const _GreenValue('+30'),
          onTap: () {},
        ),
        const SizedBox(height: 10),
        _ListCard(
          title: 'Ghaf planting, Al Safa Park',
          subtitle: 'Planting · Dubai · 2.4 km',
          trailing: const _GreenValue('+200'),
          onTap: () {},
        ),
        const SizedBox(height: 10),
        _ListCard(
          title: 'Your impact this month',
          subtitle: '64.2 kg CO2 avoided · 8 Ghaf trees',
          trailing: const Icon(Icons.chevron_right,
              color: AppColors.textSecondary, size: 20),
          onTap: () {},
        ),
      ],
    );
  }
}

/// ---------- Widgets ----------
class _Header extends StatelessWidget {
  final String name;
  final String subtitle;
  const _Header({required this.name, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Marhaba, $name',
                  style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary)),
              const SizedBox(height: 2),
              Text(subtitle,
                  style: const TextStyle(
                      fontSize: 12.5, color: AppColors.textSecondary)),
            ],
          ),
        ),
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.card,
            border: Border.all(color: AppColors.border),
          ),
          child: IconButton(
            padding: EdgeInsets.zero,
            icon: const Icon(Icons.notifications,
                color: Colors.white, size: 20),
            onPressed: () {},
          ),
        ),
      ],
    );
  }
}

class _PointsCard extends StatelessWidget {
  final int points, streakDays, ptsToNext, nextLevel, badges, totalBadges;
  final double progress;

  const _PointsCard({
    required this.points,
    required this.streakDays,
    required this.ptsToNext,
    required this.nextLevel,
    required this.badges,
    required this.totalBadges,
    required this.progress,
  });

  String _fmt(int n) => n.toString().replaceAllMapped(
      RegExp(r'(\d)(?=(\d{3})+$)'), (m) => '${m[1]},');

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: AppColors.green,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('YOUR POINTS',
              style: TextStyle(
                  fontSize: 11.5,
                  letterSpacing: 0.4,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFFDDEBE2))),
          const SizedBox(height: 2),
          Text(_fmt(points),
              style: const TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.1)),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.water_drop, size: 13, color: Colors.white),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  '$streakDays-day streak · $ptsToNext pts to Level $nextLevel · '
                  '$badges of $totalBadges badges',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, color: Colors.white),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: AppColors.progressTrack,
              valueColor:
                  const AlwaysStoppedAnimation(AppColors.progressFill),
            ),
          ),
        ],
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
        child: const Text('+  Record an activity',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  final String? tag;
  const _SectionTitle(this.text, {this.tag});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(text,
              style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          if (tag != null) ...[
            const SizedBox(width: 6),
            Text(tag!,
                style: const TextStyle(
                    fontSize: 11,
                    letterSpacing: 0.5,
                    fontWeight: FontWeight.w500,
                    color: AppColors.greenBright)),
          ],
        ],
      ),
    );
  }
}

class _ListCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final Widget trailing;
  final VoidCallback? onTap;

  const _ListCard({
    required this.title,
    required this.subtitle,
    required this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Expanded(
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
              ),
              const SizedBox(width: 8),
              trailing,
            ],
          ),
        ),
      ),
    );
  }
}

class _GreenValue extends StatelessWidget {
  final String value;
  const _GreenValue(this.value);

  @override
  Widget build(BuildContext context) => Text(value,
      style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: AppColors.greenBright));
}
