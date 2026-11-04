
import 'package:flutter/material.dart';

class RecordActivityScreen extends StatefulWidget {
  const RecordActivityScreen({super.key});

  @override
  State<RecordActivityScreen> createState() =>
      _RecordActivityScreenState();
}

class _RecordActivityScreenState extends State<RecordActivityScreen> {
  static const Color background = Color(0xFF101812);
  static const Color cardColor = Color(0xFF18241C);
  static const Color primaryGreen = Color(0xFF2B7A50);
  static const Color borderColor = Color(0xFF3A4A3F);
  static const Color mutedText = Color(0xFFA9B8AE);

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

  String selectedCategory = 'Planting';
  String selectedType = 'Ghaf seedling';
  String selectedLink = 'None. Record on its own';

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
          label: Text(category),
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
        sectionLabel('Type'),
        DropdownButtonFormField<String>(
          initialValue: selectedType,
          dropdownColor: cardColor,
          decoration: fieldDecoration(),
          items: activityTypes[selectedCategory]!
              .map(
                (type) => DropdownMenuItem(
                  value: type,
                  child: Text(type),
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
    String label;

    switch (selectedCategory) {
      case 'Planting':
        label = 'Number planted';
        break;
      case 'Recycling':
        label = 'Weight in kg';
        break;
      case 'Clean-up':
        label = 'Bags collected';
        break;
      case 'Water':
        label = 'Litres saved';
        break;
      case 'Energy':
        label = 'kWh saved';
        break;
      case 'Transport':
        label = 'Trips';
        break;
      default:
        label = 'Description';
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
        showMessage('Photo marked as added (demo only)');
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
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Photo of planting',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    'Required',
                    style: TextStyle(color: mutedText),
                  ),
                ],
              ),
            ),
            Text(
              photoAdded ? 'Added ✓' : 'Add photo',
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
        sectionLabel('Location (required)'),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF1C3326),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Text(
            'Using your current location · Dubai. '
            'Location blocked?',
            style: TextStyle(fontSize: 13),
          ),
        ),
      ],
    );
  }

  Widget buildDateTime() {
    final dateText =
        '${selectedDate.month.toString().padLeft(2, '0')}/'
        '${selectedDate.day.toString().padLeft(2, '0')}/'
        '${selectedDate.year}  '
        '${TimeOfDay.fromDateTime(selectedDate).format(context)}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionLabel('Date and time'),
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
        sectionLabel('Link to (optional)'),
        DropdownButtonFormField<String>(
          initialValue: selectedLink,
          dropdownColor: cardColor,
          decoration: fieldDecoration(),
          items: [
            'None. Record on its own',
            'Team: Dubai Greens',
            'Challenge: Metro Month',
          ].map((item) {
            return DropdownMenuItem(
              value: item,
              child: Text(item),
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
              showMessage('Draft saved (demo only)');
            },
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 52),
              side: const BorderSide(color: primaryGreen),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text(
              'Save draft',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: ElevatedButton(
            onPressed: () {
              if (quantityController.text.trim().isEmpty) {
                showMessage('Please enter the activity quantity.');
                return;
              }

              if (!photoAdded) {
                showMessage('Please add the required photo.');
                return;
              }

              showMessage('Ready for review');
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: primaryGreen,
              foregroundColor: Colors.white,
              minimumSize: const Size(0, 52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('Review'),
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
        title: const Text(
          'Record an activity',
          style: TextStyle(
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
                  const Text(
                    'Each accepted activity counts once toward '
                    'its challenge and totals.',
                    style: TextStyle(
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
