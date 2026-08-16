import 'package:flutter/material.dart';

import '../theme.dart';

class PremiumScreen extends StatelessWidget {
  const PremiumScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Premium')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Text(
            'Every course.\nFull speed. No ads.',
            style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, height: 1.15, letterSpacing: -0.5),
          ),
          const SizedBox(height: 20),
          const _Benefit(icon: Icons.bolt, title: 'Stream instantly', desc: 'No queues, no limits on playback quality'),
          const _Benefit(icon: Icons.download_for_offline, title: 'Full-speed downloads', desc: 'Offline lessons with quality picker'),
          const _Benefit(icon: Icons.block, title: 'Zero ads', desc: 'An ad-free experience across web and app'),
          const SizedBox(height: 24),
          _PlanCard(months: 1, price: '150 ETB', weekly: '~35 ETB/week', best: false),
          _PlanCard(months: 3, price: '400 ETB', weekly: '~30 ETB/week', best: false),
          _PlanCard(months: 6, price: '750 ETB', weekly: '~29 ETB/week', best: true),
          const SizedBox(height: 12),
          const Text(
            'Payment methods: Telebirr · Card · Crypto (USDT/BTC/ETH/SOL) · Patreon',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.muted),
          ),
        ],
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
  const _PlanCard({required this.months, required this.price, required this.weekly, required this.best});

  final int months;
  final String price;
  final String weekly;
  final bool best;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: best ? Border.all(color: AppColors.accent, width: 2) : null,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text('$months ${months == 1 ? 'Month' : 'Months'}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    if (best) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(6)),
                        child: const Text('BEST VALUE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.black)),
                      ),
                    ],
                  ],
                ),
                Text(weekly, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),
          Text(price, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
