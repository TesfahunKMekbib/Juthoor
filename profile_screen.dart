import 'package:flutter/material.dart';

void main() => runApp(const ProfileApp());

/// Colour tokens sampled from the design.
class AppColors {
  static const background = Color(0xFF0E1714);
  static const surface = Color(0xFF16211D);
  static const border = Color(0xFF2A3832);
  static const accent = Color(0xFF3FA977);
  static const accentBorder = Color(0xFF2F7A57);
  static const textPrimary = Color(0xFFF2F5F3);
  static const textSecondary = Color(0xFFA9B5AF);
  static const navInactive = Color(0xFFB9C3BE);
}

class ProfileApp extends StatelessWidget {
  const ProfileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'My profile',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Roboto',
        useMaterial3: true,
      ),
      home: const ProfileScreen(),
    );
  }
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  int _navIndex = 4; // Profile tab selected

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(14, 16, 14, 24),
          children: [
            const Padding(
              padding: EdgeInsets.only(left: 2, bottom: 12),
              child: Text(
                'My profile',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
              ),
            ),
            ProfileTile(
              title: 'Rashid Al Nuaimi',
              subtitle: 'UAE PASS verified · Dubai',
              trailing: TextButton(
                onPressed: () {},
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.accent,
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(40, 32),
                ),
                child: const Text('Edit', style: TextStyle(fontSize: 14)),
              ),
            ),
            ProfileTile(
              title: 'Level and badges',
              subtitle: 'Level 3 · 2 of 3 unlocked',
              onTap: () {},
            ),
            ProfileTile(
              title: 'Notifications',
              subtitle: 'Reminders and results',
              onTap: () {},
            ),
            ProfileTile(
              title: 'Privacy and recommendations',
              subtitle: 'Profile visible to: Everyone',
              onTap: () {},
            ),
            ProfileTile(
              title: 'Language',
              subtitle: 'English / العربية',
              onTap: () {},
            ),
            ProfileTile(
              title: 'Interests',
              subtitle: 'Transit, Planting',
              onTap: () {},
            ),
            ProfileTile(
              title: 'Points history',
              onTap: () {},
            ),
            const SizedBox(height: 2),
            SizedBox(
              height: 42,
              child: OutlinedButton(
                onPressed: () {},
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.textPrimary,
                  side: const BorderSide(color: AppColors.accentBorder, width: 1.5),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Sign out',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Center(
              child: GestureDetector(
                onTap: () {},
                child: const Text(
                  'Delete my account',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textPrimary,
                    decoration: TextDecoration.underline,
                    decorationColor: AppColors.textPrimary,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: BottomNav(
        currentIndex: _navIndex,
        onTap: (i) => setState(() => _navIndex = i),
      ),
    );
  }
}

/// A rounded, bordered row with a title, optional subtitle and a trailing
/// chevron (or custom trailing widget).
class ProfileTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;

  const ProfileTile({
    super.key,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppColors.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitle!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                trailing ??
                    const Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: AppColors.textSecondary,
                    ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Text-only bottom navigation with a green indicator above the active tab.
class BottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;

  const BottomNav({super.key, required this.currentIndex, required this.onTap});

  static const _labels = ['Home', 'Activities', 'Impact', 'Assistant', 'Profile'];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 52,
          child: Row(
            children: List.generate(_labels.length, (i) {
              final selected = i == currentIndex;
              return Expanded(
                child: InkWell(
                  onTap: () => onTap(i),
                  child: Column(
                    children: [
                      Container(
                        height: 3,
                        color: selected ? AppColors.accent : Colors.transparent,
                      ),
                      Expanded(
                        child: Center(
                          child: Text(
                            _labels[i],
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w400,
                              color: selected
                                  ? AppColors.textPrimary
                                  : AppColors.navInactive,
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
