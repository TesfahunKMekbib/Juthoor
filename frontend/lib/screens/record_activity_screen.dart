import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../l10n/app_localizations.dart';

class RecordActivityScreen extends StatefulWidget {
  const RecordActivityScreen({super.key});

  @override
  State<RecordActivityScreen> createState() => _RecordActivityScreenState();
}

class _RecordActivityScreenState extends State<RecordActivityScreen> {
  static const Color background = Color(0xFF101812);
  static const Color cardColor = Color(0xFF18241C);
  static const Color primaryGreen = Color(0xFF2B7A50);
  static const Color borderColor = Color(0xFF3A4A3F);
  static const Color mutedText = Color(0xFFA9B8AE);

  // TODO(Q-A4): 'Transport' and 'Other' are not in the approved activity
  // categories (FR-007). Kept for now by owner decision; see
  // docs/open-questions.md Q-A4.
  final List<String> categories = [
    'Planting',
    'Recycling',
    'Clean-up',
    'Water',
    'Energy',
    'Transport',
    'Other',
  ];

  final Map<String, List<String>> activityTypes = {
    'Planting': ['Ghaf seedling', 'Tree sapling'],
    'Recycling': ['Smart RVM', 'Home recycling'],
    'Clean-up': ['Beach', 'Park'],
    'Water': ['Reduced usage', 'Leak repair'],
    'Energy': ['AC setpoint', 'LED switch'],
    'Transport': ['Metro', 'Bus', 'Cycling'],
    'Other': ['Approved activity'],
  };

  // Internal ids stay stable; display text comes from AppLocalizations.
  String categoryLabel(AppLocalizations l10n, String id) => switch (id) {
        'Planting' => l10n.categoryPlanting,
        'Recycling' => l10n.categoryRecycling,
        'Clean-up' => l10n.categoryCleanup,
        'Water' => l10n.categoryWater,
        'Energy' => l10n.categoryEnergy,
        'Transport' => l10n.categoryTransport,
        _ => l10n.categoryOther,
      };

  String typeText(AppLocalizations l10n, String id) => switch (id) {
        'Ghaf seedling' => l10n.typeGhafSeedling,
        'Tree sapling' => l10n.typeTreeSapling,
        'Smart RVM' => l10n.typeSmartRvm,
        'Home recycling' => l10n.typeHomeRecycling,
        'Beach' => l10n.typeBeach,
        'Park' => l10n.typePark,
        'Reduced usage' => l10n.typeReducedUsage,
        'Leak repair' => l10n.typeLeakRepair,
        'AC setpoint' => l10n.typeAcSetpoint,
        'LED switch' => l10n.typeLedSwitch,
        'Metro' => l10n.typeMetro,
        'Bus' => l10n.typeBus,
        'Cycling' => l10n.typeCycling,
        _ => l10n.typeApprovedActivity,
      };

  String linkText(AppLocalizations l10n, String id) => switch (id) {
        'team' => l10n.linkTeam,
        'challenge' => l10n.linkChallenge,
        _ => l10n.linkNone,
      };

  String selectedCategory = 'Planting';
  String selectedType = 'Ghaf seedling';
  String selectedLink = 'none';

  final quantityController = TextEditingController();
  DateTime selectedDate = DateTime.now();
  bool photoAdded = false;

  @override
  void dispose() {
    quantityController.dispose();
    super.dispose();
  }

  void changeCategory(String category) {
    setState(() {
      selectedCategory = category;
      selectedType = activityTypes[category]!.first;
      quantityController.clear();
      photoAdded = false;
    });
  }

  Future<void> selectDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
    );

    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(selectedDate),
    );

    if (time == null) return;

    setState(() {
      selectedDate = DateTime(
        date.year,
        date.month,
        date.day,
        time.hour,
        time.minute,
      );
    });
  }

  void showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Widget sectionLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
    );
  }

  InputDecoration fieldDecoration() {
    return InputDecoration(
      filled: true,
      fillColor: cardColor,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 14,
        vertical: 15,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: borderColor),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primaryGreen),
      ),
    );
  }

  Widget buildCategories() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: categories.map((category) {
        final selected = selectedCategory == category;

        return ChoiceChip(
          label: Text(categoryLabel(AppLocalizations.of(context), category)),
          selected: selected,
          showCheckmark: false,
          onSelected: (_) => changeCategory(category),
          selectedColor: primaryGreen,
          backgroundColor: cardColor,
          side: BorderSide(
            color: selected ? primaryGreen : borderColor,
          ),
          labelStyle: TextStyle(
            color: selected ? Colors.white : mutedText,
            fontWeight: FontWeight.w600,
          ),
        );
      }).toList(),
    );
  }

  Widget buildActivityType() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(AppLocalizations.of(context).typeLabel),
        DropdownButtonFormField<String>(
          initialValue: selectedType,
          dropdownColor: cardColor,
          decoration: fieldDecoration(),
          items: activityTypes[selectedCategory]!
              .map(
                (type) => DropdownMenuItem(
                  value: type,
                  child: Text(typeText(AppLocalizations.of(context), type)),
                ),
              )
              .toList(),
          onChanged: (value) {
            if (value != null) {
              setState(() => selectedType = value);
            }
          },
        ),
      ],
    );
  }

  Widget buildQuantityField() {
    final l10n = AppLocalizations.of(context);
    String label;

    switch (selectedCategory) {
      case 'Planting':
        label = l10n.quantityPlanting;
        break;
      case 'Recycling':
        label = l10n.quantityRecycling;
        break;
      case 'Clean-up':
        label = l10n.quantityCleanup;
        break;
      case 'Water':
        label = l10n.quantityWater;
        break;
      case 'Energy':
        label = l10n.quantityEnergy;
        break;
      case 'Transport':
        label = l10n.quantityTransport;
        break;
      default:
        label = l10n.quantityOther;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(label),
        TextField(
          controller: quantityController,
          keyboardType: selectedCategory == 'Other'
              ? TextInputType.text
              : const TextInputType.numberWithOptions(
                  decimal: true,
                ),
          decoration: fieldDecoration(),
        ),
      ],
    );
  }

  Widget buildPhotoUpload() {
    return InkWell(
      onTap: () {
        // Placeholder until image_picker is integrated.
        setState(() => photoAdded = true);
        showMessage(AppLocalizations.of(context).photoDemoMessage);
      },
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cardColor,
          border: Border.all(color: borderColor),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    AppLocalizations.of(context).photoOfPlanting,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    AppLocalizations.of(context).required,
                    style: const TextStyle(color: mutedText),
                  ),
                ],
              ),
            ),
            Text(
              photoAdded
                  ? AppLocalizations.of(context).photoAddedLabel
                  : AppLocalizations.of(context).addPhoto,
              style: const TextStyle(
                color: primaryGreen,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget buildLocation() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(AppLocalizations.of(context).locationRequiredLabel),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1C3326),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            AppLocalizations.of(context).locationNotice,
            style: const TextStyle(fontSize: 13),
          ),
        ),
      ],
    );
  }

  Widget buildDateTime() {
    final localeName = Localizations.localeOf(context).toString();
    final dateText =
        '${DateFormat('MM/dd/yyyy', localeName).format(selectedDate)}  '
        '${TimeOfDay.fromDateTime(selectedDate).format(context)}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(AppLocalizations.of(context).dateAndTime),
        InkWell(
          onTap: selectDateTime,
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: cardColor,
              border: Border.all(color: borderColor),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Expanded(child: Text(dateText)),
                const Icon(
                  Icons.calendar_today_outlined,
                  size: 18,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget buildLinkField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel(AppLocalizations.of(context).linkToOptional),
        DropdownButtonFormField<String>(
          initialValue: selectedLink,
          isExpanded: true,
          dropdownColor: cardColor,
          decoration: fieldDecoration(),
          items: [
            'none',
            'team',
            'challenge',
          ].map((item) {
            return DropdownMenuItem(
              value: item,
              child: Text(
                linkText(AppLocalizations.of(context), item),
                overflow: TextOverflow.ellipsis,
              ),
            );
          }).toList(),
          onChanged: (value) {
            if (value != null) {
              setState(() => selectedLink = value);
            }
          },
        ),
      ],
    );
  }

  Widget buildActions() {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: () {
              showMessage(AppLocalizations.of(context).draftSavedDemo);
            },
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 52),
              side: const BorderSide(color: primaryGreen),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              AppLocalizations.of(context).saveDraft,
              style: const TextStyle(color: Colors.white),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ElevatedButton(
            onPressed: () {
              if (quantityController.text.trim().isEmpty) {
                showMessage(AppLocalizations.of(context).enterQuantityMessage);
                return;
              }

              if (!photoAdded) {
                showMessage(
                    AppLocalizations.of(context).addRequiredPhotoMessage);
                return;
              }

              showMessage(AppLocalizations.of(context).readyForReview);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: primaryGreen,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(AppLocalizations.of(context).review),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: background,
      appBar: AppBar(
        backgroundColor: background,
        foregroundColor: Colors.white,
        title: Text(
          AppLocalizations.of(context).recordActivityTitle,
          style: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 390),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildCategories(),
                  const SizedBox(height: 18),
                  buildActivityType(),
                  const SizedBox(height: 14),
                  buildQuantityField(),
                  const SizedBox(height: 14),
                  buildPhotoUpload(),
                  const SizedBox(height: 14),
                  buildLocation(),
                  const SizedBox(height: 14),
                  buildDateTime(),
                  const SizedBox(height: 14),
                  buildLinkField(),
                  const SizedBox(height: 12),
                  Text(
                    AppLocalizations.of(context).acceptedOnceNote,
                    style: const TextStyle(
                      color: mutedText,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 12),
                  buildActions(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
