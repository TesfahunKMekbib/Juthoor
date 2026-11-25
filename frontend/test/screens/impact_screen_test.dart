import 'dart:convert';
import 'dart:io';
import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:juthoor/l10n/app_localizations.dart';
import 'package:juthoor/l10n/app_localizations_ar.dart';
import 'package:juthoor/l10n/app_localizations_en.dart';
import 'package:juthoor/screens/home_screen.dart';
import 'package:juthoor/screens/impact_screen.dart';

import '../helpers/pump_app.dart';

AppLocalizations _l10n(String code) =>
    code == 'ar' ? AppLocalizationsAr() : AppLocalizationsEn();

/// Selection state read from the option's semantics `selected` flag.
bool _selected(WidgetTester tester, String label) {
  final semantics = find.ancestor(
    of: find.text(label),
    matching: find.byWidgetPredicate(
      (w) => w is Semantics && w.properties.button == true,
    ),
  );
  final node = tester.getSemantics(semantics.first);
  return node.getSemanticsData().flagsCollection.isSelected == Tristate.isTrue;
}

/// Tall surface so the lazily-built ListView renders every section.
Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  String code = 'en',
}) async {
  await pumpApp(tester, child, locale: Locale(code));
  tester.view.physicalSize = const Size(360, 1800);
  await tester.pumpAndSettle();
}

Finder _option(String label) => find.widgetWithText(InkWell, label);

const _screen = Scaffold(body: ImpactScreen());

void main() {
  for (final code in ['en', 'ar']) {
    final l = _l10n(code);

    testWidgets(
        'Impact [$code] renders title, options, defaults Me+Month (NFR-016)',
        (tester) async {
      final handle = tester.ensureSemantics();
      await _pump(tester, _screen, code: code);
      expect(tester.takeException(), isNull);
      for (final s in [
        l.impactScreenTitle,
        l.impactViewFor,
        l.impactTimePeriod,
        l.impactAudienceMe,
        l.impactAudienceCommunity,
        l.impactPeriodMonth,
        l.impactPeriodYear,
        l.impactPeriodLifetime,
        l.impactThisMonth,
        l.impactByCategory,
        l.impactCopyButton,
      ]) {
        expect(find.text(s), findsOneWidget, reason: s);
      }
      expect(_selected(tester, l.impactAudienceMe), isTrue);
      expect(_selected(tester, l.impactPeriodMonth), isTrue);
      expect(_selected(tester, l.impactAudienceCommunity), isFalse);
      expect(_selected(tester, l.impactPeriodYear), isFalse);
      expect(_selected(tester, l.impactPeriodLifetime), isFalse);
      handle.dispose();
    });

    testWidgets('Impact [$code] option switching selects by id (NFR-016)',
        (tester) async {
      final handle = tester.ensureSemantics();
      await _pump(tester, _screen, code: code);

      await tester.tap(_option(l.impactAudienceCommunity));
      await tester.pumpAndSettle();
      expect(_selected(tester, l.impactAudienceCommunity), isTrue);
      expect(_selected(tester, l.impactAudienceMe), isFalse);
      expect(find.text(l.impactEmptyTitle), findsOneWidget);

      await tester.tap(_option(l.impactAudienceMe));
      await tester.pumpAndSettle();
      expect(find.text(l.impactEmptyTitle), findsNothing);

      await tester.tap(_option(l.impactPeriodYear));
      await tester.pumpAndSettle();
      expect(_selected(tester, l.impactPeriodYear), isTrue);
      expect(_selected(tester, l.impactPeriodMonth), isFalse);
      expect(find.text(l.impactEmptyTitle), findsOneWidget);

      await tester.tap(_option(l.impactPeriodLifetime));
      await tester.pumpAndSettle();
      expect(_selected(tester, l.impactPeriodLifetime), isTrue);
      expect(_selected(tester, l.impactPeriodYear), isFalse);

      await tester.tap(_option(l.impactPeriodMonth));
      await tester.pumpAndSettle();
      expect(find.text(l.impactEmptyTitle), findsNothing);
      expect(find.text(l.impactThisMonth), findsOneWidget);
      expect(tester.takeException(), isNull);
      handle.dispose();
    });

    testWidgets(
        'Impact [$code] copy writes l10n summary and shows snackbar '
        '(NFR-016, NFR-017)', (tester) async {
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String?;
          }
          return null;
        },
      );
      addTearDown(() => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null));

      await _pump(tester, _screen, code: code);
      final button = find.text(l.impactCopyButton);
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(copied, l.impactCopySummary);
      expect(find.text(l.impactCopied), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets(
        'Impact [$code] category semantics use label + percentage (NFR-016)',
        (tester) async {
      final handle = tester.ensureSemantics();
      await _pump(tester, _screen, code: code);
      for (final (label, pct) in [
        (l.impactCategoryTransit, 60),
        (l.impactCategoryRecycling, 25),
        (l.impactCategoryPlanting, 15),
      ]) {
        final text = l.impactCategorySemantics(label, pct);
        await tester.ensureVisible(find.text(label));
        expect(find.bySemanticsLabel(text), findsOneWidget, reason: text);
      }
      handle.dispose();
    });

    testWidgets('HomeShell Impact tab shows ImpactScreen [$code] (NFR-016)',
        (tester) async {
      await _pump(tester, const HomeShell(), code: code);
      expect(find.byType(ImpactScreen), findsNothing);
      expect(find.text(l.impactTitle), findsWidgets); // Home card title
      await tester.tap(find.text(l.tabImpact).last);
      await tester.pumpAndSettle();
      expect(find.byType(ImpactScreen), findsOneWidget);
      expect(find.text(l.impactAudienceMe), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Impact is RTL in Arabic and LTR in English (NFR-017)',
      (tester) async {
    final ar = AppLocalizationsAr();
    await pumpApp(tester, _screen, locale: const Locale('ar'));
    expect(Directionality.of(tester.element(find.byType(ImpactScreen))),
        TextDirection.rtl);
    // First option (Me) sits to the right of Community in RTL.
    expect(
      tester.getCenter(find.text(ar.impactAudienceMe)).dx,
      greaterThan(tester.getCenter(find.text(ar.impactAudienceCommunity)).dx),
    );
    await pumpApp(tester, _screen);
    expect(Directionality.of(tester.element(find.byType(ImpactScreen))),
        TextDirection.ltr);
  });

  group('impact ARB keys (NFR-016)', () {
    Map<String, dynamic> load(String name) =>
        jsonDecode(File('lib/l10n/$name').readAsStringSync())
            as Map<String, dynamic>;

    // Raw text scan: jsonDecode silently hides duplicate keys.
    List<String> topLevelKeys(String name) =>
        RegExp(r'^  "([^"]+)":', multiLine: true)
            .allMatches(File('lib/l10n/$name').readAsStringSync())
            .map((m) => m.group(1)!)
            .toList();

    final en = load('app_en.arb');
    final ar = load('app_ar.arb');
    // Screen keys carry an `@key` metadata entry; impactSubtitle is a
    // pre-existing Home-card key without one.
    final impactKeys = en.keys
        .where((k) => k.startsWith('impact') && en.containsKey('@$k'))
        .toList();

    test('impact* keys exist in both ARBs', () {
      expect(impactKeys.length, greaterThanOrEqualTo(25));
      for (final k in impactKeys) {
        expect(ar[k], isA<String>(), reason: 'ar missing $k');
        expect((ar[k] as String).trim(), isNotEmpty);
      }
    });

    test('impact* en keys carry the Arabic-draft review description', () {
      for (final k in impactKeys) {
        final meta = en['@$k'] as Map<String, dynamic>?;
        expect(meta?['description'],
            contains('Arabic draft — needs native-speaker review'),
            reason: '@$k');
      }
    });

    test('no duplicate keys in either ARB', () {
      for (final f in ['app_en.arb', 'app_ar.arb']) {
        final keys = topLevelKeys(f);
        final dups = keys.where((k) => keys.where((x) => x == k).length > 1);
        expect(dups.toSet(), isEmpty, reason: f);
      }
    });
  });
}
