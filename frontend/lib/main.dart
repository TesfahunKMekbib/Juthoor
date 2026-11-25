import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'l10n/app_localizations.dart';
import 'services/activity_api.dart';
import 'services/device_services.dart';
import 'screens/home_screen.dart';

/// In-app language override. `null` follows the device locale (NFR-016).
final ValueNotifier<Locale?> appLocale = ValueNotifier<Locale?>(null);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: AppColors.bg,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
    ),
  );
  runApp(
    MultiProvider(
      providers: [
        // Base URL: --dart-define=API_BASE_URL (see defaultApiBaseUrl).
        Provider<ActivityApi>(create: (_) => HttpActivityApi()),
        Provider<LocationProvider>(
          create: (_) => const GeolocatorLocationProvider(),
        ),
        Provider<PhotoPicker>(create: (_) => ImagePickerPhotoPicker()),
      ],
      child: const JuthoorApp(),
    ),
  );
}

class JuthoorApp extends StatelessWidget {
  const JuthoorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Locale?>(
      valueListenable: appLocale,
      builder: (context, locale, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
        locale: locale,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        theme: ThemeData(
          brightness: Brightness.dark,
          colorScheme: ColorScheme.fromSeed(
            seedColor: AppColors.green,
            brightness: Brightness.dark,
          ),
          scaffoldBackgroundColor: AppColors.bg,
          useMaterial3: true,
        ),
        home: const HomeShell(),
      ),
    );
  }
}
