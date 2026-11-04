import 'package:flutter/material.dart';
import 'screens/home_screen.dart';

void main() => runApp(const JuthoorApp());

class JuthoorApp extends StatelessWidget {
  const JuthoorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Juthoor',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.bg,
        useMaterial3: true,
      ),
      home: const HomeShell(),
    );
  }
}
