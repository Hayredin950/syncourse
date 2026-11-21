import 'dart:io';

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../theme.dart';

/// Plays a lesson that lives on the device. Deliberately simple: play/pause,
/// scrub, and a clear label that this file is offline.
class OfflinePlayerScreen extends StatefulWidget {
  const OfflinePlayerScreen(
      {super.key, required this.title, required this.path, this.remoteUrl});

  final String title;
  final String? path;
  final String? remoteUrl;

  @override
  State<OfflinePlayerScreen> createState() => _OfflinePlayerScreenState();
}

class _OfflinePlayerScreenState extends State<OfflinePlayerScreen> {
  VideoPlayerController? _controller;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final controller = widget.path != null
          ? VideoPlayerController.file(File(widget.path!))
          : VideoPlayerController.networkUrl(Uri.parse(widget.remoteUrl!));
      await controller.initialize();
      if (!mounted) return;
      setState(() => _controller = controller);
      await controller.play();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
          title:
              Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: Center(
        child: _error != null
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Text('This file could not be played.\n$_error',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.muted)),
              )
            : c == null
                ? const CircularProgressIndicator()
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AspectRatio(
                        aspectRatio: c.value.aspectRatio == 0
                            ? 16 / 9
                            : c.value.aspectRatio,
                        child: VideoPlayer(c),
                      ),
                      const SizedBox(height: 10),
                      VideoProgressIndicator(c,
                          allowScrubbing: true,
                          colors: const VideoProgressColors(
                              playedColor: AppColors.accent)),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(
                            iconSize: 38,
                            color: Colors.white,
                            icon: Icon(c.value.isPlaying
                                ? Icons.pause_circle_filled
                                : Icons.play_circle_fill),
                            onPressed: () {
                              c.value.isPlaying ? c.pause() : c.play();
                              setState(() {});
                            },
                          ),
                        ],
                      ),
                      Text(
                        widget.path != null
                            ? 'Saved on this device'
                            : 'Streaming',
                        style: const TextStyle(
                            color: AppColors.muted, fontSize: 12),
                      ),
                    ],
                  ),
      ),
    );
  }
}
