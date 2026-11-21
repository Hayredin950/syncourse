import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../theme.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool _register = false;
  bool _loading = false;
  bool _googleBusy = false;
  bool? _googleEnabled;

  @override
  void initState() {
    super.initState();
    _loadProviders();
  }

  /// Ask the server which external sign-in providers exist. The web can always
  /// draw the button and let the API reject it; the app must not promise a
  /// Google flow the server cannot start.
  Future<void> _loadProviders() async {
    try {
      final providers = await Api.authProviders();
      if (mounted) {
        setState(() => _googleEnabled = providers['google'] == true);
      }
    } catch (_) {
      if (mounted) setState(() => _googleEnabled = false);
    }
  }

  Future<void> _startGoogle() async {
    setState(() => _googleBusy = true);
    final redirect = Uri.encodeComponent('syncourse://auth');
    final url = '$apiBase/api/auth/google?redirect=$redirect';
    final opened =
        await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    if (!mounted) return;
    setState(() => _googleBusy = false);
    if (!opened) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open the browser for Google')),
      );
    }
  }

  void _googleUnavailable() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
            'Google sign-in is not configured on this server yet. Use your email and password.'),
      ),
    );
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _loading = true);
    try {
      if (_register) {
        await Api.register(_name.text, _email.text, _password.text);
      } else {
        await Api.login(_email.text, _password.text);
      }
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(_register
                  ? 'Account created — check your email to verify'
                  : 'Welcome back!')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_register ? 'Create account' : 'Sign in')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.school, size: 64, color: AppColors.accent),
              const SizedBox(height: 8),
              const Text(
                'Syncourse',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5),
              ),
              const SizedBox(height: 4),
              const Text(
                'One account across web, app and Telegram',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.muted, fontSize: 13),
              ),
              const SizedBox(height: 24),
              if (_register) ...[
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(
                      labelText: 'Name', border: OutlineInputBorder()),
                  validator: (v) =>
                      (v == null || v.isEmpty) ? 'Enter your name' : null,
                ),
                const SizedBox(height: 12),
              ],
              TextFormField(
                controller: _email,
                decoration: const InputDecoration(
                    labelText: 'Email', border: OutlineInputBorder()),
                keyboardType: TextInputType.emailAddress,
                validator: (v) => (v == null || !v.contains('@'))
                    ? 'Enter a valid email'
                    : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                decoration: const InputDecoration(
                    labelText: 'Password (min 8 chars)',
                    border: OutlineInputBorder()),
                obscureText: true,
                validator: (v) => (v == null || v.length < 8)
                    ? 'At least 8 characters'
                    : null,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(_register ? 'Create account' : 'Sign in'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _googleBusy
                    ? null
                    : _googleEnabled == true
                        ? _startGoogle
                        : _googleUnavailable,
                icon: const Icon(Icons.g_mobiledata, size: 26),
                label: Text(
                    _googleBusy ? 'Opening Google…' : 'Continue with Google'),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() => _register = !_register),
                child: Text(_register
                    ? 'Already have an account? Sign in'
                    : 'New here? Create an account'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
