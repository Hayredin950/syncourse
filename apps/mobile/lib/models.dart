// ---------------------------------------------------------------------------
// Models mirroring the NestJS API responses (see apps/api/src/*).
// ---------------------------------------------------------------------------

String _fmtDuration(double minutes) {
  if (minutes <= 0) return '';
  final h = minutes ~/ 60;
  final m = (minutes % 60).round();
  if (h > 0) return '${h}h ${m}m';
  return '${m}m';
}

String _fmtDurationSec(int seconds) {
  if (seconds <= 0) return '';
  final h = seconds ~/ 3600;
  final m = (seconds % 3600) ~/ 60;
  if (h > 0) return '${h}h ${m}m';
  return '${m}m';
}

class CourseSummary {
  final String id, title, slug, level;
  final String? thumbnailUrl;
  final double ratingAvg;
  final int ratingCount, enrollmentCount, lessonCount, downloadCount;
  final double durationMin;
  final bool isPremium;
  final bool isNew;
  final int? rank;
  final String? lecturerName, organizationName;
  final List<String> categoryNames;

  CourseSummary({
    required this.id,
    required this.title,
    required this.slug,
    required this.level,
    this.thumbnailUrl,
    required this.ratingAvg,
    required this.ratingCount,
    required this.enrollmentCount,
    required this.lessonCount,
    this.downloadCount = 0,
    required this.durationMin,
    required this.isPremium,
    this.isNew = false,
    this.rank,
    this.lecturerName,
    this.organizationName,
    this.categoryNames = const [],
  });

  factory CourseSummary.fromJson(Map<String, dynamic> j) => CourseSummary(
        id: j['id'] as String,
        title: j['title'] as String,
        slug: j['slug'] as String,
        level: (j['level'] as String?) ?? 'All Levels',
        thumbnailUrl: j['thumbnailUrl'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: (j['ratingCount'] as num?)?.toInt() ?? 0,
        enrollmentCount: (j['enrollmentCount'] as num?)?.toInt() ?? 0,
        lessonCount: (j['lessonCount'] as num?)?.toInt() ?? 0,
        downloadCount: (j['downloadCount'] as num?)?.toInt() ?? 0,
        durationMin: (j['durationMin'] as num?)?.toDouble() ?? 0,
        isPremium: j['isPremium'] as bool? ?? false,
        isNew: j['isNew'] as bool? ?? false,
        rank: j['rank'] as int?,
        lecturerName: j['lecturerName'] as String?,
        organizationName: j['organizationName'] as String?,
        categoryNames: ((j['categoryNames'] as List?) ?? []).cast<String>(),
      );

  String get durationText => _fmtDuration(durationMin);
}

class LessonLite {
  final String id, title, type;
  final int durationSec, orderIndex;
  final bool isPreview;
  LessonLite.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        type = j['type'] as String? ?? 'video',
        durationSec = (j['durationSec'] as num?)?.toInt() ?? 0,
        orderIndex = (j['orderIndex'] as num?)?.toInt() ?? 0,
        isPreview = j['isPreview'] as bool? ?? false;

  String get durationText => _fmtDurationSec(durationSec);
}

class Section {
  final String id, title;
  final List<LessonLite> lessons;
  Section.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        lessons = ((j['lessons'] as List?) ?? [])
            .map((e) => LessonLite.fromJson(e as Map<String, dynamic>))
            .toList();

  String get durationText {
    final secs = lessons.fold<int>(0, (s, l) => s + l.durationSec);
    return _fmtDurationSec(secs);
  }
}

class Note {
  final String id, title, richText;
  final List<String> imageUrls;
  final bool isCheatsheet;
  final String? pdfUrl;
  Note.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        richText = j['richText'] as String? ?? '',
        imageUrls = ((j['imageUrls'] as List?) ?? []).cast<String>(),
        isCheatsheet = j['isCheatsheet'] as bool? ?? false,
        pdfUrl = j['pdfUrl'] as String?;
}

class LessonFile {
  final String id, label, format;
  final double sizeMb;
  final String? codec;
  final bool hasSubtitles, isBest;
  LessonFile.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        label = j['label'] as String,
        format = j['format'] as String? ?? 'mp4',
        sizeMb = (j['sizeMb'] as num?)?.toDouble() ?? 0,
        codec = j['codec'] as String?,
        hasSubtitles = j['hasSubtitles'] as bool? ?? false,
        isBest = j['isBest'] as bool? ?? false;
}

class LecturerLite {
  final String id, name, slug;
  final String? photoUrl, bio, credentials;
  LecturerLite.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        slug = j['slug'] as String? ?? '',
        photoUrl = j['photoUrl'] as String?,
        bio = j['bio'] as String?,
        credentials = j['credentials'] as String?;
}

class Review {
  final String id, userName;
  final String? userAvatar, body;
  final int rating, replyCount;
  final bool isStaff;
  final DateTime createdAt;
  Review.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        userName = j['userName'] as String? ?? 'Learner',
        userAvatar = j['userAvatar'] as String?,
        body = j['body'] as String?,
        rating = (j['rating'] as num?)?.toInt() ?? 0,
        replyCount = (j['replyCount'] as num?)?.toInt() ?? 0,
        isStaff = j['isStaff'] as bool? ?? false,
        createdAt = DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now();
}

class CourseDetail {
  final String id, title, slug, description, level, language;
  final String? thumbnailUrl, bannerUrl, previewVideoUrl, prerequisites;
  final double ratingAvg;
  final int ratingCount, enrollmentCount, lessonCount;
  final double durationMin;
  final List<String> tags, audience, categoryNames;
  final LecturerLite? lecturer;
  final Map<String, dynamic>? organization;
  final List<Section> sections;
  final List<Review> reviews;
  final Map<String, dynamic>? ratings;
  final Map<String, dynamic>? downloads;
  final bool isPremium;

  CourseDetail({
    required this.id,
    required this.title,
    required this.slug,
    required this.description,
    required this.level,
    required this.language,
    this.thumbnailUrl,
    this.bannerUrl,
    this.previewVideoUrl,
    this.prerequisites,
    required this.ratingAvg,
    required this.ratingCount,
    required this.enrollmentCount,
    required this.lessonCount,
    required this.durationMin,
    required this.tags,
    required this.audience,
    required this.categoryNames,
    this.lecturer,
    this.organization,
    required this.sections,
    required this.reviews,
    this.ratings,
    this.downloads,
    required this.isPremium,
  });

  factory CourseDetail.fromJson(Map<String, dynamic> j) => CourseDetail(
        id: j['id'] as String,
        title: j['title'] as String,
        slug: j['slug'] as String,
        description: j['description'] as String? ?? '',
        level: (j['level'] as String?) ?? 'All Levels',
        language: (j['language'] as String?) ?? 'English',
        thumbnailUrl: j['thumbnailUrl'] as String?,
        bannerUrl: j['bannerUrl'] as String?,
        previewVideoUrl: j['previewVideoUrl'] as String?,
        prerequisites: j['prerequisites'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: (j['ratingCount'] as num?)?.toInt() ?? 0,
        enrollmentCount: (j['enrollmentCount'] as num?)?.toInt() ?? 0,
        lessonCount: (j['lessonCount'] as num?)?.toInt() ?? 0,
        durationMin: (j['durationMin'] as num?)?.toDouble() ?? 0,
        tags: ((j['tags'] as List?) ?? []).cast<String>(),
        audience: ((j['audience'] as List?) ?? []).cast<String>(),
        categoryNames: ((j['categoryNames'] as List?) ?? []).cast<String>(),
        lecturer: j['lecturer'] == null
            ? null
            : LecturerLite.fromJson(j['lecturer'] as Map<String, dynamic>),
        organization: j['organization'] as Map<String, dynamic>?,
        sections: ((j['sections'] as List?) ?? [])
            .map((e) => Section.fromJson(e as Map<String, dynamic>))
            .toList(),
        reviews: ((j['reviews'] as List?) ?? [])
            .map((e) => Review.fromJson(e as Map<String, dynamic>))
            .toList(),
        ratings: j['ratings'] as Map<String, dynamic>?,
        downloads: j['downloads'] as Map<String, dynamic>?,
        isPremium: j['isPremium'] as bool? ?? false,
      );

  String get durationText => _fmtDuration(durationMin);
  int get reviewCount => (ratings?['count'] as num?)?.toInt() ?? 0;
  double get reviewAvg => ((ratings?['avg'] as num?) ?? 0).toDouble();
}

class LessonDetail {
  final String id, title;
  final String? sectionTitle;
  final List<Note> notes;
  final List<LessonFile> files;
  final int durationSec, courseProgress;
  final bool isPreview, watched;
  final String courseTitle, courseSlug;
  LessonDetail.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        sectionTitle = j['sectionTitle'] as String?,
        notes = ((j['notes'] as List?) ?? [])
            .map((e) => Note.fromJson(e as Map<String, dynamic>))
            .toList(),
        files = ((j['files'] as List?) ?? [])
            .map((e) => LessonFile.fromJson(e as Map<String, dynamic>))
            .toList(),
        durationSec = (j['durationSec'] as num?)?.toInt() ?? 0,
        courseProgress = (j['courseProgress'] as num?)?.toInt() ?? 0,
        isPreview = j['isPreview'] as bool? ?? false,
        watched = j['watched'] as bool? ?? false,
        courseTitle = (j['course'] as Map<String, dynamic>?)?['title'] as String? ?? '',
        courseSlug = (j['course'] as Map<String, dynamic>?)?['slug'] as String? ?? '';

  String get durationText => _fmtDurationSec(durationSec);
  String? get videoUrl => null; // real URLs come from /lessons/:id/video-url (signed)
}

class Plan {
  final String id, name;
  final int durationDays, weeklyEtb;
  final double priceEtb, priceUsd;
  final bool isBestValue;
  Plan.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        durationDays = (j['durationDays'] as num?)?.toInt() ?? 0,
        weeklyEtb = (j['weeklyEtb'] as num?)?.toInt() ?? 0,
        priceEtb = (j['priceEtb'] as num?)?.toDouble() ?? 0,
        priceUsd = (j['priceUsd'] as num?)?.toDouble() ?? 0,
        isBestValue = j['isBestValue'] as bool? ?? false;
}

class UserProfile {
  final String id, name, username, email;
  final String? avatarUrl;
  final String planType;
  final String? planExpiresAt, telegramUsername;
  final DateTime memberSince;
  final Map<String, int> stats;
  UserProfile.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        username = j['username'] as String,
        email = j['email'] as String,
        avatarUrl = j['avatarUrl'] as String?,
        planType = j['planType'] as String? ?? 'free',
        planExpiresAt = j['planExpiresAt'] as String?,
        telegramUsername = j['telegramUsername'] as String?,
        memberSince = DateTime.tryParse(j['memberSince'] as String? ?? '') ?? DateTime.now(),
        stats = ((j['stats'] as Map<String, dynamic>?) ?? {}).map((k, v) => MapEntry(k, (v as num).toInt()));

  bool get isPremium => planType == 'premium';
}

class HomeRail {
  final String title, slug;
  final List<CourseSummary> courses;
  HomeRail({required this.title, required this.slug, required this.courses});
}

class HomeFeed {
  final List<CourseSummary> trending, latest, topRated;
  final List<HomeRail> rails;
  HomeFeed({required this.trending, required this.latest, required this.topRated, required this.rails});

  factory HomeFeed.fromJson(Map<String, dynamic> j) {
    List<CourseSummary> parse(String key) => ((j[key] as List?) ?? [])
        .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
    final rails = <HomeRail>[];
    for (final b in ((j['bestOf'] as List?) ?? []).take(6)) {
      final m = b as Map<String, dynamic>;
      rails.add(HomeRail(
        title: 'Best of ${m['name'] ?? ''}',
        slug: m['slug'] as String? ?? '',
        courses: ((m['courses'] as List?) ?? [])
            .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
      ));
    }
    for (final p in ((j['featuredPaths'] as List?) ?? []).take(6)) {
      final m = p as Map<String, dynamic>;
      rails.add(HomeRail(
        title: 'Featured path · ${m['title'] ?? ''}',
        slug: m['id'] as String? ?? '',
        courses: ((m['courses'] as List?) ?? [])
            .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
      ));
    }
    return HomeFeed(
      trending: parse('trending'),
      latest: parse('latest'),
      topRated: parse('topRated'),
      rails: rails,
    );
  }
}

class MyLearningItem {
  final String id, title, slug;
  final String? thumbnailUrl;
  final int progressPct;
  final String status;
  MyLearningItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        slug = j['slug'] as String,
        thumbnailUrl = j['thumbnailUrl'] as String?,
        progressPct = (j['progressPct'] as num?)?.toInt() ?? 0,
        status = j['status'] as String? ?? 'in_progress';
}

class MyLearning {
  final List<MyLearningItem> inProgress, completed, watchlist, liked;
  MyLearning({required this.inProgress, required this.completed, required this.watchlist, required this.liked});

  factory MyLearning.fromJson(Map<String, dynamic> j) {
    List<MyLearningItem> parse(String key) => ((j[key] as List?) ?? [])
        .map((e) => MyLearningItem.fromJson(e as Map<String, dynamic>))
        .toList();
    return MyLearning(
      inProgress: parse('inProgress'),
      completed: parse('completed'),
      watchlist: parse('watchlist'),
      liked: parse('liked'),
    );
  }

  List<MyLearningItem> get enrolled => [...inProgress, ...completed];
}

class CourseCollection {
  final String id, name;
  final String? description;
  final String visibility;
  final int itemCount, savesCount;
  final String? ownerName;
  final List<String> covers;
  final List<MyLearningItem> items;
  CourseCollection({
    required this.id,
    required this.name,
    this.description,
    required this.visibility,
    required this.itemCount,
    this.savesCount = 0,
    this.ownerName,
    this.covers = const [],
    this.items = const [],
  });

  factory CourseCollection.fromJson(Map<String, dynamic> j) => CourseCollection(
        id: j['id'] as String,
        name: j['name'] as String,
        description: j['description'] as String?,
        visibility: j['visibility'] as String? ?? 'private',
        itemCount: (j['itemCount'] as num?)?.toInt() ?? 0,
        savesCount: (j['savesCount'] as num?)?.toInt() ?? 0,
        ownerName: j['ownerName'] as String?,
        covers: ((j['covers'] as List?) ?? []).cast<String>(),
        items: ((j['items'] as List?) ?? [])
            .map((e) => MyLearningItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class ActivityItem {
  final String id, userName, verb, targetTitle, createdAt;
  ActivityItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String? ?? '',
        userName = j['userName'] as String? ?? '',
        verb = j['verb'] as String? ?? '',
        targetTitle = j['targetTitle'] as String? ?? '',
        createdAt = j['createdAt'] as String? ?? '';
}
