import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'api.dart';

/// One lesson stored on the device.
class OfflineLesson {
  OfflineLesson({
    required this.id,
    required this.title,
    required this.sectionTitle,
    required this.videoPath,
    required this.files,
    required this.notes,
  });

  final String id;
  final String title;
  final String sectionTitle;
  final String? videoPath;
  final List<Map<String, String>> files;
  final List<Map<String, String>> notes;

  factory OfflineLesson.fromJson(Map<String, dynamic> j) => OfflineLesson(
        id: j['id'] as String,
        title: (j['title'] as String?) ?? 'Lesson',
        sectionTitle: (j['sectionTitle'] as String?) ?? '',
        videoPath: j['videoPath'] as String?,
        files: ((j['files'] as List?) ?? [])
            .map((e) =>
                Map<String, String>.from((e as Map).cast<String, String>()))
            .toList(),
        notes: ((j['notes'] as List?) ?? [])
            .map((e) =>
                Map<String, String>.from((e as Map).cast<String, String>()))
            .toList(),
      );
}

/// A course that lives entirely on the phone. [expiresAt] mirrors the Premium
/// pass: when it passes, the files are deleted on the next open.
class OfflineCourse {
  OfflineCourse({
    required this.slug,
    required this.title,
    required this.expiresAt,
    required this.bytes,
    required this.lessons,
  });

  final String slug;
  final String title;
  final DateTime expiresAt;
  final int bytes;
  final List<OfflineLesson> lessons;

  bool get expired => expiresAt.isBefore(DateTime.now());
}

/// Real downloads, real files. Nothing here caches metadata only.
class OfflineStore {
  static Future<Directory> _root() async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/offline');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  static Future<Directory> _courseDir(String slug) async {
    final root = await _root();
    final dir = Directory('${root.path}/$slug');
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }

  static Future<int> _dirBytes(Directory dir) async {
    if (!await dir.exists()) return 0;
    var total = 0;
    await for (final entity in dir.list(recursive: true, followLinks: false)) {
      if (entity is File) total += await entity.length();
    }
    return total;
  }

  static Future<void> remove(String slug) async {
    final root = await _root();
    final dir = Directory('${root.path}/$slug');
    if (await dir.exists()) await dir.delete(recursive: true);
  }

  /// Every complete offline course, newest first. Expired plans are purged
  /// here so a lapsed pass cannot keep watching downloaded files.
  static Future<List<OfflineCourse>> courses() async {
    final root = await _root();
    if (!await root.exists()) return [];
    final out = <OfflineCourse>[];
    await for (final entity in root.list()) {
      if (entity is! Directory) continue;
      final meta = File('${entity.path}/meta.json');
      if (!await meta.exists()) continue;
      try {
        final j = jsonDecode(await meta.readAsString()) as Map<String, dynamic>;
        final expires = DateTime.tryParse((j['expiresAt'] as String?) ?? '') ??
            DateTime.now();
        if (expires.isBefore(DateTime.now())) {
          await entity.delete(recursive: true);
          continue;
        }
        out.add(OfflineCourse(
          slug: j['slug'] as String,
          title: (j['title'] as String?) ?? 'Course',
          expiresAt: expires,
          bytes: await _dirBytes(entity),
          lessons: ((j['lessons'] as List?) ?? [])
              .map((e) => OfflineLesson.fromJson(e as Map<String, dynamic>))
              .toList(),
        ));
      } catch (_) {
        // A half-written folder is not a course; remove it rather than show it.
        await entity.delete(recursive: true);
      }
    }
    out.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    return out;
  }

  static Future<int> storageBytes() async => _dirBytes(await _root());

  static String _safe(String name) => name
      .replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')
      .replaceAll(RegExp(r'_+'), '_');

  static Future<void> _download(String url, File target) async {
    final client = http.Client();
    try {
      final req = http.Request('GET', Uri.parse(url));
      final res = await client.send(req);
      if (res.statusCode >= 400) {
        throw Exception('Download failed (${res.statusCode})');
      }
      final sink = target.openWrite();
      await res.stream.pipe(sink);
    } finally {
      client.close();
    }
  }

  /// Download a whole course. [onProgress] is 0…1 over the files, not bytes.
  static Future<OfflineCourse> download(
    String slug, {
    void Function(double progress, String label)? onProgress,
  }) async {
    final manifest = await Api.offlineManifest(slug);
    final course = Map<String, dynamic>.from(manifest['course'] as Map);
    final rawLessons = (manifest['lessons'] as List?) ?? [];
    final dir = await _courseDir(slug);
    final filesDir = Directory('${dir.path}/files');
    if (!await filesDir.exists()) await filesDir.create(recursive: true);

    final totalUnits = rawLessons.fold<int>(1, (sum, raw) {
      final l = raw as Map<String, dynamic>;
      final video = l['video'];
      final attachments = (l['attachments'] as List?) ?? [];
      return sum + (video == null ? 0 : 1) + attachments.length;
    });
    var done = 0;

    final lessons = <Map<String, dynamic>>[];
    for (final raw in rawLessons) {
      final l = Map<String, dynamic>.from(raw as Map);
      String? videoPath;
      final video = l['video'];
      if (video is Map && video['url'] is String) {
        final url = video['url'] as String;
        final ext = Uri.parse(url).path.split('.').last;
        final name =
            '${_safe(l['id'] as String)}.${ext.length <= 4 ? ext : 'mp4'}';
        final file = File('${filesDir.path}/$name');
        if (!await file.exists() || await file.length() == 0) {
          await _download(url, file);
        }
        videoPath = file.path;
        done++;
        onProgress?.call(done / totalUnits, '${l['title']}');
      }

      final files = <Map<String, String>>[];
      for (final a in (l['attachments'] as List?) ?? []) {
        final att = Map<String, dynamic>.from(a as Map);
        final url = att['url'] as String?;
        if (url == null) continue;
        final label = (att['fileName'] as String?) ?? 'file';
        final name = '${_safe(att['id'] as String)}-${_safe(label)}';
        final file = File('${filesDir.path}/$name');
        if (!await file.exists() || await file.length() == 0) {
          await _download(url, file);
        }
        files.add({'name': label, 'path': file.path});
        done++;
        onProgress?.call(done / totalUnits, label);
      }

      final notes = <Map<String, String>>[];
      for (final n in (l['notes'] as List?) ?? []) {
        final note = Map<String, dynamic>.from(n as Map);
        notes.add({
          'title': (note['title'] as String?) ?? 'Note',
          'text': (note['richText'] as String?) ?? '',
        });
      }

      lessons.add({
        'id': l['id'],
        'title': l['title'],
        'sectionTitle': l['sectionTitle'] ?? '',
        'videoPath': videoPath,
        'files': files,
        'notes': notes,
      });
    }

    final expires =
        DateTime.tryParse((manifest['expiresAt'] as String?) ?? '') ??
            DateTime.now().add(const Duration(days: 7));

    final meta = {
      'slug': slug,
      'title': course['title'] ?? slug,
      'expiresAt': expires.toIso8601String(),
      'downloadedAt': DateTime.now().toIso8601String(),
      'lessons': lessons,
    };
    await File('${dir.path}/meta.json').writeAsString(jsonEncode(meta));

    return OfflineCourse(
      slug: slug,
      title: (course['title'] as String?) ?? slug,
      expiresAt: expires,
      bytes: await _dirBytes(dir),
      lessons: lessons.map(OfflineLesson.fromJson).toList(),
    );
  }
}
