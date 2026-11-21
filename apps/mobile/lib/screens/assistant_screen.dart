import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../widgets/ui.dart';

/// The study assistant, ported from `/assistant`. Retains the live quota,
/// suggested questions, a thread with cited sources and the courses to open.
class AssistantScreen extends StatefulWidget {
  const AssistantScreen({super.key});

  @override
  State<AssistantScreen> createState() => _AssistantScreenState();
}

class _AssistantScreenState extends State<AssistantScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  final _turns = <_Turn>[];
  AssistantStatus? _status;
  bool _pending = false;
  String? _error;
  String? _failed;
  String? _courseSlug;

  static const _suggestions = [
    'Where should I start with AI agents?',
    'Which course teaches Flutter from scratch?',
    'How do I automate my business with n8n?',
    'What does the RAG course actually cover?',
  ];

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  bool _argsRead = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_argsRead) return;
    _argsRead = true;
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map && args['course'] is String) {
      setState(() => _courseSlug = args['course'] as String);
    }
  }

  Future<void> _loadStatus() async {
    try {
      final s = await Api.assistantStatus();
      if (mounted) setState(() => _status = s);
    } catch (_) {
      // The page still lets a reader try; the server answers with a clear
      // message when the assistant is switched off.
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _ask(String question) async {
    final text = question.trim();
    if (text.length < 3 || _pending) return;
    _controller.clear();
    setState(() {
      _pending = true;
      _error = null;
      _failed = null;
      _turns.add(_Turn.user(text));
    });
    _scrollDown();
    try {
      final history = <Map<String, String>>[];
      for (final turn in _turns.reversed.take(9).toList().reversed) {
        if (turn.answer != null) {
          history.add({
            'role': 'assistant',
            'content': turn.answer!.answer.length > 500
                ? turn.answer!.answer.substring(0, 500)
                : turn.answer!.answer,
          });
        } else if (turn.question != null && turn.question != text) {
          history.add({'role': 'user', 'content': turn.question!});
        }
      }
      final answer =
          await Api.ask(text, courseSlug: _courseSlug, history: history);
      if (!mounted) return;
      setState(() {
        _turns.add(_Turn.answer(answer));
        _pending = false;
      });
      _loadStatus();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _pending = false;
        _error = '$e';
        _failed = text;
      });
      _loadStatus();
    }
    _scrollDown();
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent + 200,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOut,
      );
    });
  }

  void _newChat() {
    setState(() {
      _turns.clear();
      _error = null;
      _failed = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final scoped = _courseSlug;
    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            SyncourseHeader(
              title: 'Ask',
              showBack: Navigator.canPop(context),
            ),
            Expanded(
              child: ListView(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(18, 0, 18, 20),
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Study assistant',
                          style: TextStyle(
                              fontSize: 25,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.8,
                              color: AppColors.text),
                        ),
                      ),
                      if (_turns.isNotEmpty)
                        TextButton(
                          onPressed: _newChat,
                          child: const Text('New chat'),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Ask about a subject and the answer is built from the lesson transcripts, PDFs and notes inside the courses, with every claim linked to its file. When nothing matches, it says so instead of guessing.',
                    style: const TextStyle(
                        fontSize: 12.5, height: 1.6, color: AppColors.dim),
                  ),
                  if (_status != null) ...[
                    const SizedBox(height: 9),
                    Text(
                      _status!.mode == 'llm'
                          ? 'Written by ${_status!.provider} · ${_status!.model}'
                          : 'Answers are quoted straight from the catalogue, with no model in between.',
                      style:
                          const TextStyle(fontSize: 10.5, color: AppColors.dim),
                    ),
                    if (_status!.cap > 0)
                      Text(
                        '${_status!.premium ? 'Premium' : 'Member'} allowance: ${_status!.remaining} of ${_status!.cap} questions left today.',
                        style: const TextStyle(
                            fontSize: 10.5, color: AppColors.dim),
                      ),
                  ],
                  if (scoped != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.accentSoft,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: AppColors.accent.withValues(alpha: .35)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Answering inside /courses/$scoped',
                              style: const TextStyle(
                                  fontSize: 11.5, color: AppColors.ink2),
                            ),
                          ),
                          TextButton(
                            onPressed: () => setState(() => _courseSlug = null),
                            child: const Text('Whole catalogue'),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (_turns.isEmpty && !_pending) ...[
                    const SizedBox(height: 18),
                    Wrap(
                      spacing: 8,
                      runSpacing: 9,
                      children: [
                        for (final s in _suggestions)
                          GestureDetector(
                            onTap: () => _ask(s),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 13, vertical: 9),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceSunk,
                                border: Border.all(color: AppColors.border),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(s,
                                  style: const TextStyle(
                                      fontSize: 12, color: AppColors.ink3)),
                            ),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 16),
                  for (final turn in _turns) _TurnView(turn: turn),
                  if (_pending)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Row(
                        children: [
                          SizedBox(
                            width: 13,
                            height: 13,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: AppColors.accent),
                          ),
                          SizedBox(width: 9),
                          Text('Reading the course transcripts…',
                              style: TextStyle(
                                  fontSize: 12, color: AppColors.dim)),
                        ],
                      ),
                    ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.danger.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                            color: AppColors.danger.withValues(alpha: .35)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_error!,
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.ink2)),
                          if (_failed != null)
                            TextButton(
                              onPressed: () => _ask(_failed!),
                              child: const Text('Try again'),
                            ),
                        ],
                      ),
                    ),
                  ],
                  if (_turns.isNotEmpty && !_pending && _error == null) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 9,
                      children: [
                        for (final s in const [
                          'Which one should I start with?',
                          'What is the prerequisite?',
                          'Show me the closest alternative',
                        ])
                          GestureDetector(
                            onTap: () => _ask(s),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppColors.surfaceSunk,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: AppColors.border),
                              ),
                              child: Text(s,
                                  style: const TextStyle(
                                      fontSize: 11.5, color: AppColors.ink4)),
                            ),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 14),
                  Text(
                    'No luck? Search the whole catalogue or ask a different way — a tool name, a subject or a lecturer works best.',
                    style: const TextStyle(
                        fontSize: 11, height: 1.5, color: AppColors.dim),
                  ),
                ],
              ),
            ),
            _Composer(
              controller: _controller,
              disabled: _pending,
              hasTurns: _turns.isNotEmpty,
              onSend: _ask,
            ),
          ],
        ),
      ),
    );
  }
}

class _Turn {
  _Turn.user(this.question) : answer = null;
  _Turn.answer(this.answer) : question = null;
  final String? question;
  final AssistantAnswer? answer;
}

class _TurnView extends StatelessWidget {
  const _TurnView({required this.turn});
  final _Turn turn;

  @override
  Widget build(BuildContext context) {
    if (turn.question != null) {
      return Align(
        alignment: Alignment.centerRight,
        child: Container(
          margin: const EdgeInsets.only(top: 10, left: 36),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.accentSoft,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.accent.withValues(alpha: .3)),
          ),
          child: Text(turn.question!,
              style: const TextStyle(
                  fontSize: 13.5, height: 1.4, color: AppColors.ink1)),
        ),
      );
    }
    final a = turn.answer!;
    final paragraphs = a.answer
        .split(RegExp(r'\n{2,}'))
        .where((p) => p.trim().isNotEmpty)
        .toList();
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.surfaceRaised,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              a.scope == 'product'
                  ? (a.mode == 'llm'
                      ? 'Answered from the Syncourse guide'
                      : 'From the Syncourse guide')
                  : (a.mode == 'llm'
                      ? 'Written from the catalogue'
                      : 'Quoted from the catalogue'),
              style: const TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: .4,
                  color: AppColors.ink4),
            ),
          ),
          if (a.notice != null) ...[
            const SizedBox(height: 8),
            Text(a.notice!,
                style: const TextStyle(fontSize: 11, color: AppColors.accent)),
          ],
          const SizedBox(height: 10),
          for (final p in paragraphs)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                p.trim(),
                style: const TextStyle(
                    fontSize: 14, height: 1.65, color: AppColors.ink2),
              ),
            ),
          if (a.citations.isNotEmpty) ...[
            const SizedBox(height: 8),
            const Text('Where this came from',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .7,
                    color: AppColors.dim)),
            const SizedBox(height: 7),
            for (final c in a.citations)
              Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('[${c.index}]',
                        style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: AppColors.accent)),
                    const SizedBox(width: 7),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onTap: () => Navigator.pushNamed(
                                context, '/courses/${c.courseSlug}'),
                            child: Text(c.courseTitle,
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.ink1)),
                          ),
                          if (c.moduleTitle != null || c.name.isNotEmpty)
                            Text(
                              [
                                c.moduleTitle ?? '',
                                c.name.startsWith('entry:') ? '' : c.name
                              ].where((e) => e.isNotEmpty).join(' · '),
                              style: const TextStyle(
                                  fontSize: 10, color: AppColors.dim),
                            ),
                          if (c.snippet.isNotEmpty)
                            Text('“${c.snippet}”',
                                style: const TextStyle(
                                    fontSize: 10.5,
                                    height: 1.4,
                                    color: AppColors.ink4)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (a.courses.isNotEmpty) ...[
            const SizedBox(height: 6),
            const Text('Courses to open',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: .7,
                    color: AppColors.dim)),
            const SizedBox(height: 6),
            for (final c in a.courses)
              GestureDetector(
                onTap: () => Navigator.pushNamed(context, '/courses/${c.slug}'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(c.title,
                            style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink1)),
                      ),
                      Text(
                        [
                          c.level,
                          if (c.ratingAvg > 0)
                            '${c.ratingAvg.toStringAsFixed(1)}★',
                          if (c.isPremium) 'premium',
                        ].join(' · '),
                        style: const TextStyle(
                            fontSize: 9.5, color: AppColors.dim),
                      ),
                      const Icon(Icons.chevron_right,
                          size: 16, color: AppColors.dim),
                    ],
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.disabled,
    required this.hasTurns,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool disabled;
  final bool hasTurns;
  final ValueChanged<String> onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.bg,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              enabled: !disabled,
              minLines: 1,
              maxLines: 4,
              maxLength: 500,
              textInputAction: TextInputAction.send,
              onSubmitted: onSend,
              style: const TextStyle(fontSize: 13.5, color: AppColors.text),
              decoration: InputDecoration(
                counterText: '',
                hintText: hasTurns
                    ? 'Ask a follow-up…'
                    : 'What do you want to learn or check?',
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton.filled(
            onPressed: disabled ? null : () => onSend(controller.text),
            style: IconButton.styleFrom(
              backgroundColor: AppColors.accent,
              foregroundColor: const Color(0xFF161310),
              disabledBackgroundColor: AppColors.surfaceRaised,
            ),
            icon: disabled
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.dim),
                  )
                : const Icon(Icons.arrow_upward, size: 18),
          ),
        ],
      ),
    );
  }
}
