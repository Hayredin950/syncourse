import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// Premium, with the real checkout attached.
///
/// The screen used to be a price list with no way to buy: tapping a plan did
/// nothing. This opens a Tikur Pay session on the server (which fixes the
/// amount), then either sends the customer to the hosted page or lets them
/// paste the bank receipt here. The server verifies the transfer against the
/// bank ledger and unlocks the plan; the app only reports what it decided.
class PremiumScreen extends StatefulWidget {
  const PremiumScreen({super.key});

  @override
  State<PremiumScreen> createState() => _PremiumScreenState();
}

class _PremiumScreenState extends State<PremiumScreen> {
  String? _busy;
  /// Prices come from `/payments/plans`; nothing on this screen is baked in.
  List<Plan>? _plans;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _failed = false;
      _plans = null;
    });
    try {
      final plans = await Api.plans();
      if (mounted) setState(() => _plans = plans);
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _start(Plan plan) async {
    final token = await Api.loadToken();
    if (token == null) {
      if (mounted) Navigator.pushNamed(context, '/auth');
      return;
    }
    setState(() => _busy = plan.id);
    try {
      final data = await Api.post('/payments/tikur/checkout', {'planId': plan.id});
      if (!mounted) return;
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: AppColors.surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        builder: (_) => _PaySheet(session: Map<String, dynamic>.from(data as Map)),
      );
    } on ApiException catch (e) {
      _say(e.message);
    } catch (_) {
      _say('Could not reach the payment service. Check your connection and try again.');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Premium')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Every course.\nEvery file.',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, height: 1.15, letterSpacing: -0.5),
          ),
          const SizedBox(height: 20),
          const _Benefit(icon: Icons.play_circle_outline, title: 'Premium courses', desc: 'Every lesson, note and attachment'),
          const _Benefit(icon: Icons.menu_book_outlined, title: 'Premium resources', desc: 'Full guides and files, not a preview'),
          const _Benefit(icon: Icons.send_outlined, title: 'Telegram delivery', desc: 'Send course files straight to your chat'),
          const SizedBox(height: 24),
          if (_failed)
            Column(
              children: [
                const Text(
                  "We couldn't load the plans. Nothing was charged — try again.",
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: AppColors.muted, height: 1.5),
                ),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: _load, child: const Text('Retry')),
              ],
            )
          else if (_plans == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 28),
              child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            for (final plan in _plans!)
              _PlanCard(
                plan: plan,
                busy: _busy == plan.id,
                onTap: _busy == null ? () => _start(plan) : null,
              ),
          const SizedBox(height: 12),
          const Text(
            'Pay with any Ethiopian bank or wallet through Tikur Pay. The transfer is '
            'verified against the bank ledger and unlocks Premium automatically.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.muted, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _PaySheet extends StatefulWidget {
  const _PaySheet({required this.session});
  final Map<String, dynamic> session;

  @override
  State<_PaySheet> createState() => _PaySheetState();
}

class _PaySheetState extends State<_PaySheet> {
  bool _verifying = false;
  bool _done = false;
  String? _error;

  Map<String, dynamic> get _rails {
    final methods = widget.session['methods'];
    return methods is Map ? Map<String, dynamic>.from(methods) : const {};
  }

  Future<void> _openHosted() async {
    final url = widget.session['checkoutUrl'];
    if (url is! String || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      if (mounted) setState(() => _error = 'Could not open the checkout page. Copy the link instead.');
    }
  }

  /// The receipt is pasted on Tikur's hosted page, where the session lives.
  /// This screen only asks the gateway for the authoritative state, so there is
  /// no second place to submit the same receipt.
  Future<void> _checkStatus() async {
    final paymentNumber = widget.session['paymentNumber'];
    if (paymentNumber is! String || paymentNumber.isEmpty) {
      setState(() => _error = 'Start a checkout first.');
      return;
    }
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final res = await Api.get('/payments/tikur/status/$paymentNumber');
      final map = Map<String, dynamic>.from(res as Map);
      if (!mounted) return;
      if (map['status'] == 'completed') {
        setState(() => _done = true);
      } else if (map['status'] == 'review') {
        setState(() => _error = 'The amount needs a person to check it. Nothing is charged twice.');
      } else {
        setState(() => _error = 'Not confirmed yet. Finish the transfer on the secure page, then check again.');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not reach the payment service. Try again.');
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final amount = widget.session['amount'];
    return Padding(
      padding: EdgeInsets.only(
        left: 22,
        right: 22,
        top: 20,
        bottom: 22 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        child: _done
            ? Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.verified, color: AppColors.success, size: 46),
                  const SizedBox(height: 12),
                  const Text('Payment verified — Premium is on.', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  const Text(
                    'Your plan is active on every device you sign in to.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.muted),
                  ),
                  const SizedBox(height: 18),
                  FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
                ],
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Pay ${amount is num ? amount.toStringAsFixed(0) : amount} ETB',
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  const Text(
                    'Open the secure page, transfer the exact amount and paste the receipt there. '
                    'Tikur Pay checks it against the bank ledger — reused or fake references are refused.',
                    style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.5),
                  ),
                  if (_rails.isNotEmpty) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.bg,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Column(
                        children: [
                          for (final entry in _rails.entries)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: Row(
                                children: [
                                  Text(entry.key.toUpperCase(),
                                      style: const TextStyle(fontSize: 11, color: AppColors.dim, fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      ((entry.value as Map)['accountNumber'] ??
                                              (entry.value as Map)['phoneNumber'] ??
                                              '')
                                          .toString(),
                                      textAlign: TextAlign.right,
                                      style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: _openHosted,
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: const Text('Open the secure checkout page'),
                  ),
                  const SizedBox(height: 18),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!, style: const TextStyle(color: AppColors.danger, fontSize: 12.5)),
                  ],
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _verifying ? null : _checkStatus,
                      child: _verifying
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('I have paid — check now'),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.title, required this.desc});

  final IconData icon;
  final String title;
  final String desc;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: AppColors.accent),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                Text(desc, style: const TextStyle(fontSize: 13, color: AppColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.plan, required this.busy, required this.onTap});

  final Plan plan;
  final bool busy;
  final VoidCallback? onTap;

  static String _etb(double value) {
    final whole = value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toStringAsFixed(2);
    final parts = whole.split('.');
    final digits = parts[0];
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
      buf.write(digits[i]);
    }
    return parts.length > 1 ? '${buf.toString()}.${parts[1]}' : buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    final monthly = plan.durationDays > 0 && plan.durationDays % 30 == 0
        ? plan.durationDays ~/ 30
        : null;
    final headline = monthly != null
        ? '$monthly ${monthly == 1 ? 'Month' : 'Months'}'
        : plan.name;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: plan.isBestValue ? Border.all(color: AppColors.accent, width: 2) : null,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(headline, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      if (plan.isBestValue) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(6)),
                          child: const Text('BEST VALUE',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.black)),
                        ),
                      ],
                    ],
                  ),
                  Text(
                    '${plan.durationDays} days · access on every device · no renewal',
                    style: const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
                  if (plan.weeklyEtb > 0)
                    Text('≈ ${plan.weeklyEtb} ETB / week',
                        style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                ],
              ),
            ),
            if (busy)
              const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            else ...[
              Text('${_etb(plan.priceEtb)} ETB', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_right, color: AppColors.dim, size: 18),
            ],
          ],
        ),
      ),
    );
  }
}
