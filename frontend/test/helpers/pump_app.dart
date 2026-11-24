import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/l10n/app_localizations.dart';

/// Phone-sized logical surface (360x800 at 1.0 pixel ratio).
void usePhoneSurface(WidgetTester tester) {
  tester.view.physicalSize = const Size(360, 800);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

/// Pumps [child] inside a MaterialApp with the l10n delegates and [locale].
/// [wrapApp] wraps the MaterialApp itself (e.g. providers visible to every
/// route).
Future<void> pumpApp(
  WidgetTester tester,
  Widget child, {
  Locale locale = const Locale('en'),
  Widget Function(Widget app)? wrapApp,
}) async {
  usePhoneSurface(tester);
  final app = MaterialApp(
    locale: locale,
    supportedLocales: AppLocalizations.supportedLocales,
    localizationsDelegates: const [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: child,
  );
  await tester.pumpWidget(wrapApp == null ? app : wrapApp(app));
  await tester.pumpAndSettle();
}
