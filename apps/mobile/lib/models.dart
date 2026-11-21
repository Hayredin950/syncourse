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
  final String description;
  final String contentType;
  final double ratingAvg;
  final int ratingCount, enrollmentCount, lessonCount, downloadCount;
  final double durationMin;
  final bool isPremium, isFeatured, saved;
  final bool isNew;
  final int? rank;
  final String? lecturerName, organizationName;
  final List<String> lecturerNames, categoryNames;
  final String? publishedAt;

  CourseSummary({
    required this.id,
    required this.title,
    required this.slug,
    required this.level,
    this.thumbnailUrl,
    this.description = '',
    this.contentType = 'course',
    required this.ratingAvg,
    required this.ratingCount,
    required this.enrollmentCount,
    required this.lessonCount,
    this.downloadCount = 0,
    required this.durationMin,
    required this.isPremium,
    this.isFeatured = false,
    this.saved = false,
    this.isNew = false,
    this.rank,
    this.lecturerName,
    this.organizationName,
    this.lecturerNames = const [],
    this.categoryNames = const [],
    this.publishedAt,
  });

  factory CourseSummary.fromJson(Map<String, dynamic> j) => CourseSummary(
        id: j['id'] as String,
        title: j['title'] as String,
        slug: j['slug'] as String,
        level: (j['level'] as String?) ?? 'All Levels',
        thumbnailUrl: j['thumbnailUrl'] as String?,
        description: j['description'] as String? ?? '',
        contentType: j['contentType'] as String? ?? 'course',
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        ratingCount: (j['ratingCount'] as num?)?.toInt() ?? 0,
        enrollmentCount: (j['enrollmentCount'] as num?)?.toInt() ?? 0,
        lessonCount: (j['lessonCount'] as num?)?.toInt() ?? 0,
        downloadCount: (j['downloadCount'] as num?)?.toInt() ?? 0,
        durationMin: (j['durationMin'] as num?)?.toDouble() ?? 0,
        isPremium: j['isPremium'] as bool? ?? false,
        isFeatured: j['isFeatured'] as bool? ?? false,
        saved: j['saved'] as bool? ?? false,
        isNew: j['isNew'] as bool? ?? false,
        rank: (j['rank'] as num?)?.toInt(),
        lecturerName: j['lecturerName'] as String?,
        organizationName: j['organizationName'] as String?,
        lecturerNames: ((j['lecturerNames'] as List?) ?? []).cast<String>(),
        categoryNames: ((j['categoryNames'] as List?) ?? []).cast<String>(),
        publishedAt: j['publishedAt'] as String?,
      );

  String get durationText => _fmtDuration(durationMin);
  bool get isMini => contentType == 'mini-course';
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
  final int rating, replyCount, upvotes;
  final bool isStaff, mine, upvoted;
  final DateTime createdAt;
  Review.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        userName = j['userName'] as String? ?? 'Learner',
        userAvatar = j['userAvatar'] as String?,
        body = j['body'] as String?,
        rating = (j['rating'] as num?)?.toInt() ?? 0,
        replyCount = (j['replyCount'] as num?)?.toInt() ?? 0,
        upvotes = (j['upvotes'] as num?)?.toInt() ?? 0,
        isStaff = j['isStaff'] as bool? ?? false,
        mine = j['mine'] as bool? ?? false,
        upvoted = j['upvoted'] as bool? ?? false,
        createdAt = DateTime.tryParse(j['createdAt'] as String? ?? '') ??
            DateTime.now();
}

class TelegramFile {
  final String id;
  final String? moduleTitle, fileName, chatUsername, caption;
  final int moduleOrder, partIndex;
  final double? fileSizeMb;
  TelegramFile.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        moduleTitle = j['moduleTitle'] as String?,
        fileName = j['fileName'] as String?,
        chatUsername = j['chatUsername'] as String?,
        caption = j['caption'] as String?,
        moduleOrder = (j['moduleOrder'] as num?)?.toInt() ?? 0,
        partIndex = (j['partIndex'] as num?)?.toInt() ?? 1,
        fileSizeMb = (j['fileSizeMb'] as num?)?.toDouble();
}

class CourseDetail {
  final String id, title, slug, description, level, language;
  final String? thumbnailUrl, bannerUrl, previewVideoUrl, prerequisites;
  final double ratingAvg;
  final int ratingCount,
      enrollmentCount,
      lessonCount,
      likeCount,
      myRating,
      reviewTotal;
  final double durationMin;
  final bool isPremium, saved, liked;
  final List<String> tags, audience, categoryNames;
  final LecturerLite? lecturer;
  final List<LecturerLite> lecturers;
  final Map<String, dynamic>? organization;
  final List<Section> sections;
  final List<Review> reviews;
  final List<TelegramFile> telegramFiles;
  final Map<String, dynamic>? ratings;
  final Map<String, dynamic>? downloads;

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
    this.likeCount = 0,
    this.myRating = 0,
    this.reviewTotal = 0,
    required this.durationMin,
    this.isPremium = false,
    this.saved = false,
    this.liked = false,
    this.tags = const [],
    this.audience = const [],
    this.categoryNames = const [],
    this.lecturer,
    this.lecturers = const [],
    this.organization,
    this.sections = const [],
    this.reviews = const [],
    this.telegramFiles = const [],
    this.ratings,
    this.downloads,
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
        likeCount: (j['likeCount'] as num?)?.toInt() ?? 0,
        myRating: (j['myRating'] as num?)?.toInt() ?? 0,
        reviewTotal: (j['reviewTotal'] as num?)?.toInt() ?? 0,
        durationMin: (j['durationMin'] as num?)?.toDouble() ?? 0,
        isPremium: j['isPremium'] as bool? ?? false,
        saved: j['saved'] as bool? ?? false,
        liked: j['liked'] as bool? ?? false,
        tags: ((j['tags'] as List?) ?? []).cast<String>(),
        audience: ((j['audience'] as List?) ?? []).cast<String>(),
        categoryNames: ((j['categoryNames'] as List?) ?? []).cast<String>(),
        lecturer: j['lecturer'] == null
            ? null
            : LecturerLite.fromJson(j['lecturer'] as Map<String, dynamic>),
        lecturers: ((j['lecturers'] as List?) ?? [])
            .map((e) => LecturerLite.fromJson(e as Map<String, dynamic>))
            .toList(),
        organization: j['organization'] as Map<String, dynamic>?,
        sections: ((j['sections'] as List?) ?? [])
            .map((e) => Section.fromJson(e as Map<String, dynamic>))
            .toList(),
        reviews: ((j['reviews'] as List?) ?? [])
            .map((e) => Review.fromJson(e as Map<String, dynamic>))
            .toList(),
        telegramFiles: ((j['telegramFiles'] as List?) ?? [])
            .map((e) => TelegramFile.fromJson(e as Map<String, dynamic>))
            .toList(),
        ratings: j['ratings'] as Map<String, dynamic>?,
        downloads: j['downloads'] as Map<String, dynamic>?,
      );

  String get durationText => _fmtDuration(durationMin);
  int get reviewCount => (ratings?['count'] as num?)?.toInt() ?? 0;
  double get reviewAvg => ((ratings?['avg'] as num?) ?? 0).toDouble();
}

class LessonAttachment {
  final String id, fileType, fileName;
  final double sizeMb;
  LessonAttachment.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        fileType = j['fileType'] as String? ?? 'file',
        fileName = j['fileName'] as String? ?? 'Course file',
        sizeMb = (j['sizeMb'] as num?)?.toDouble() ?? 0;
}

class LessonDetail {
  final String id, title;
  final String? sectionTitle;
  final List<Note> notes;
  final List<LessonFile> files;
  final List<LessonAttachment> attachments;
  final int durationSec, courseProgress;
  final bool isPreview, watched, locked;
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
        attachments = ((j['attachments'] as List?) ?? [])
            .map((e) => LessonAttachment.fromJson(e as Map<String, dynamic>))
            .toList(),
        durationSec = (j['durationSec'] as num?)?.toInt() ?? 0,
        courseProgress = (j['courseProgress'] as num?)?.toInt() ?? 0,
        isPreview = j['isPreview'] as bool? ?? false,
        watched = j['watched'] as bool? ?? false,
        locked = j['locked'] as bool? ?? false,
        courseTitle =
            (j['course'] as Map<String, dynamic>?)?['title'] as String? ?? '',
        courseSlug =
            (j['course'] as Map<String, dynamic>?)?['slug'] as String? ?? '';

  String get durationText => _fmtDurationSec(durationSec);
  String? get videoUrl =>
      null; // real URLs come from /lessons/:id/video-url (signed)
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
  final String? gender;
  final String planType;
  final String? planExpiresAt, telegramUsername;
  final DateTime memberSince;
  final Map<String, int> stats;
  final bool isStaff, isVerified, hasGoogle, hasPassword;
  final Map<String, dynamic>? pendingPayment;
  final Map<String, dynamic>? settings;
  final Map<String, dynamic>? privacy;
  final List<Map<String, dynamic>> sessions;
  UserProfile.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        username = j['username'] as String,
        email = j['email'] as String,
        avatarUrl = j['avatarUrl'] as String?,
        gender = j['gender'] as String?,
        planType = j['planType'] as String? ?? 'free',
        planExpiresAt = j['planExpiresAt'] as String?,
        telegramUsername = j['telegramUsername'] as String?,
        memberSince = DateTime.tryParse(j['memberSince'] as String? ?? '') ??
            DateTime.now(),
        stats = ((j['stats'] as Map<String, dynamic>?) ?? {})
            .map((k, v) => MapEntry(k, (v as num).toInt())),
        isStaff = j['isStaff'] as bool? ?? false,
        isVerified = j['isVerified'] as bool? ?? false,
        hasGoogle = j['hasGoogle'] as bool? ?? false,
        hasPassword = j['hasPassword'] as bool? ?? false,
        pendingPayment = j['pendingPayment'] as Map<String, dynamic>?,
        settings = j['settings'] as Map<String, dynamic>?,
        privacy = j['privacy'] as Map<String, dynamic>?,
        sessions = ((j['sessions'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();

  bool get isPremium => planType == 'premium';
}

class CategoryRow {
  final String id, name, slug;
  final String? icon, coverImage;
  final int courseCount;
  CategoryRow.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String? ?? j['slug'] as String? ?? '',
        name = j['name'] as String? ?? '',
        slug = j['slug'] as String? ?? '',
        icon = j['icon'] as String?,
        coverImage = j['coverImage'] as String?,
        courseCount = (j['courseCount'] as num?)?.toInt() ?? 0;
}

class LecturerRow {
  final String id, name, slug;
  final String? photoUrl, bio, credentials;
  final int courseCount;
  LecturerRow.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        slug = j['slug'] as String,
        photoUrl = j['photoUrl'] as String?,
        bio = j['bio'] as String?,
        credentials = j['credentials'] as String?,
        courseCount = (j['courseCount'] as num?)?.toInt() ?? 0;
}

class OrganizationRow {
  final String id, name, slug;
  final String? logoUrl, description, orgType;
  final int courseCount, subscribers;
  OrganizationRow.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String,
        slug = j['slug'] as String,
        logoUrl = j['logoUrl'] as String?,
        description = j['description'] as String?,
        orgType = j['orgType'] as String?,
        courseCount = (j['courseCount'] as num?)?.toInt() ?? 0,
        subscribers = (j['subscribers'] as num?)?.toInt() ?? 0;
}

class LearningPathRow {
  final String id, title, description;
  final String? coverUrl;
  final int courseCount, totalVotes;
  final double ratingAvg;
  final List<CourseSummary> courses;
  LearningPathRow.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String? ?? '',
        description = j['description'] as String? ?? '',
        coverUrl = j['coverUrl'] as String?,
        courseCount = (j['courseCount'] as num?)?.toInt() ?? 0,
        totalVotes = (j['totalVotes'] as num?)?.toInt() ?? 0,
        ratingAvg = (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        courses = ((j['courses'] as List?) ?? [])
            .map((e) =>
                CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
}

class LearningPathDetail {
  final String id, title, description;
  final String? coverUrl;
  final int courseCount, totalVotes;
  final double ratingAvg;
  final List<CourseSummary> courses;
  final Map<String, dynamic> progress;
  LearningPathDetail.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String? ?? '',
        description = j['description'] as String? ?? '',
        coverUrl = j['coverUrl'] as String?,
        courseCount = (j['courseCount'] as num?)?.toInt() ??
            ((j['courses'] as List?) ?? []).length,
        totalVotes = (j['totalVotes'] as num?)?.toInt() ?? 0,
        ratingAvg = (j['ratingAvg'] as num?)?.toDouble() ?? 0,
        courses = ((j['courses'] as List?) ?? [])
            .map((e) =>
                CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        progress = (j['progress'] as Map<String, dynamic>?) ?? {};

  int get totalLessons => (progress['totalLessons'] as num?)?.toInt() ?? 0;
  int get completedLessons =>
      (progress['completedLessons'] as num?)?.toInt() ?? 0;
  int get pct => (progress['pct'] as num?)?.toInt() ?? 0;
  Map<String, dynamic>? get next => progress['next'] as Map<String, dynamic>?;
}

class ResourceSummary {
  final String id, type, title, slug;
  final String? summary, coverUrl;
  final bool isPremium, isFeatured;
  final int readMinutes, viewCount, downloadCount, mediaCount;
  final String? publishedAt;
  final Map<String, dynamic>? category, organization, lecturer;
  final List<String> tags, mediaKinds;

  ResourceSummary({
    required this.id,
    required this.type,
    required this.title,
    required this.slug,
    this.summary,
    this.coverUrl,
    this.isPremium = false,
    this.isFeatured = false,
    this.readMinutes = 0,
    this.viewCount = 0,
    this.downloadCount = 0,
    this.mediaCount = 0,
    this.publishedAt,
    this.category,
    this.organization,
    this.lecturer,
    this.tags = const [],
    this.mediaKinds = const [],
  });

  factory ResourceSummary.fromJson(Map<String, dynamic> j) => ResourceSummary(
        id: j['id'] as String,
        type: j['type'] as String? ?? 'note',
        title: j['title'] as String? ?? '',
        slug: j['slug'] as String? ?? '',
        summary: j['summary'] as String?,
        coverUrl: j['coverUrl'] as String?,
        isPremium: j['isPremium'] as bool? ?? false,
        isFeatured: j['isFeatured'] as bool? ?? false,
        readMinutes: (j['readMinutes'] as num?)?.toInt() ?? 0,
        viewCount: (j['viewCount'] as num?)?.toInt() ?? 0,
        downloadCount: (j['downloadCount'] as num?)?.toInt() ?? 0,
        mediaCount: (j['mediaCount'] as num?)?.toInt() ?? 0,
        publishedAt: j['publishedAt'] as String?,
        category: j['category'] as Map<String, dynamic>?,
        organization: j['organization'] as Map<String, dynamic>?,
        lecturer: j['lecturer'] as Map<String, dynamic>?,
        tags: ((j['tags'] as List?) ?? []).cast<String>(),
        mediaKinds: ((j['mediaKinds'] as List?) ?? []).cast<String>(),
      );

  String get typeLabel {
    switch (type) {
      case 'cheat-sheet':
        return 'Cheat-sheet';
      case 'roadmap':
        return 'Roadmap';
      case 'note':
        return 'Note';
      default:
        return 'Resource';
    }
  }

  String get categoryName => category?['name'] as String? ?? '';
}

class ResourceList {
  final int total;
  final List<ResourceSummary> results;
  final Map<String, int> counts;
  final List<Map<String, dynamic>> categories;
  ResourceList({
    required this.total,
    required this.results,
    this.counts = const {},
    this.categories = const [],
  });

  factory ResourceList.fromJson(Map<String, dynamic> j) => ResourceList(
        total: (j['total'] as num?)?.toInt() ?? 0,
        results: ((j['results'] as List?) ?? [])
            .map((e) =>
                ResourceSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        counts: ((j['counts'] as Map<String, dynamic>?) ?? {})
            .map((k, v) => MapEntry(k, (v as num).toInt())),
        categories: ((j['categories'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
}

class ResourceDetail {
  final ResourceSummary summary;
  final String bodyMd;
  final String? sourceUrl, updatedAt;
  final bool locked;
  final List<Map<String, dynamic>> media;
  final List<ResourceSummary> related;
  ResourceDetail({
    required this.summary,
    required this.bodyMd,
    this.sourceUrl,
    this.updatedAt,
    this.locked = false,
    this.media = const [],
    this.related = const [],
  });

  factory ResourceDetail.fromJson(Map<String, dynamic> j) => ResourceDetail(
        summary: ResourceSummary.fromJson(j),
        bodyMd: j['bodyMd'] as String? ?? '',
        sourceUrl: j['sourceUrl'] as String?,
        updatedAt: j['updatedAt'] as String?,
        locked: j['locked'] as bool? ?? false,
        media: ((j['media'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
        related: ((j['related'] as List?) ?? [])
            .map((e) =>
                ResourceSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

class AssistantStatus {
  final bool enabled, premium;
  final String mode, provider, model;
  final int cap, used, remaining;
  AssistantStatus.fromJson(Map<String, dynamic> j)
      : enabled = j['enabled'] as bool? ?? false,
        premium = ((j['viewer'] as Map?)?['premium'] as bool?) ?? false,
        mode = j['mode'] as String? ?? 'extractive',
        provider = j['provider'] as String? ?? '',
        model = j['model'] as String? ?? '',
        cap = ((j['viewer'] as Map?)?['cap'] as num?)?.toInt() ?? 0,
        used = ((j['viewer'] as Map?)?['used'] as num?)?.toInt() ?? 0,
        remaining = ((j['viewer'] as Map?)?['remaining'] as num?)?.toInt() ?? 0;
}

class AssistantCitation {
  final int index;
  final String courseTitle, courseSlug, kind, name, snippet, url;
  final String? moduleTitle;
  AssistantCitation.fromJson(Map<String, dynamic> j)
      : index = (j['index'] as num?)?.toInt() ?? 0,
        courseTitle = j['courseTitle'] as String? ?? '',
        courseSlug = j['courseSlug'] as String? ?? '',
        kind = j['kind'] as String? ?? '',
        name = j['name'] as String? ?? '',
        snippet = j['snippet'] as String? ?? '',
        url = j['url'] as String? ?? '',
        moduleTitle = j['moduleTitle'] as String?;
}

class SearchResult {
  final String query, type;
  final int total;
  final List<CourseSummary> courses;
  final List<Map<String, dynamic>> lecturers, organizations;
  final List<ResourceSummary> resources;
  final List<String> trending;
  SearchResult({
    required this.query,
    required this.type,
    required this.total,
    this.courses = const [],
    this.lecturers = const [],
    this.organizations = const [],
    this.resources = const [],
    this.trending = const [],
  });

  factory SearchResult.fromJson(Map<String, dynamic> j) => SearchResult(
        query: j['query'] as String? ?? '',
        type: j['type'] as String? ?? 'all',
        total: (j['total'] as num?)?.toInt() ?? 0,
        courses: ((j['courses'] as List?) ?? [])
            .map((e) =>
                CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        lecturers: ((j['lecturers'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
        organizations: ((j['organizations'] as List?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
        resources: ((j['resources'] as List?) ?? [])
            .map((e) =>
                ResourceSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        trending: ((j['trending'] as List?) ?? []).cast<String>(),
      );

  bool get isEmpty =>
      courses.isEmpty &&
      lecturers.isEmpty &&
      organizations.isEmpty &&
      resources.isEmpty;
}

class AssistantAnswer {
  final String answer, mode, scope;
  final String? notice;
  final List<AssistantCitation> citations;
  final List<CourseSummary> courses;
  AssistantAnswer.fromJson(Map<String, dynamic> j)
      : answer = j['answer'] as String? ?? '',
        mode = j['mode'] as String? ?? 'extractive',
        scope = j['scope'] as String? ?? 'catalogue',
        notice = j['notice'] as String?,
        citations = ((j['citations'] as List?) ?? [])
            .map((e) =>
                AssistantCitation.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        courses = ((j['courses'] as List?) ?? [])
            .map((e) =>
                CourseSummary.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
}

class HomeRail {
  final String title, slug;
  final List<CourseSummary> courses;
  HomeRail({required this.title, required this.slug, required this.courses});
}

class HomeFeed {
  final List<CourseSummary> trending, latest, topRated;
  final List<HomeRail> rails;
  final List<CategoryRow> categories;
  final List<LecturerRow> lecturers;
  final List<LearningPathRow> featuredPaths;
  final List<Map<String, dynamic>> bestOf;
  HomeFeed({
    required this.trending,
    required this.latest,
    required this.topRated,
    required this.rails,
    this.categories = const [],
    this.lecturers = const [],
    this.featuredPaths = const [],
    this.bestOf = const [],
  });

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
      categories: ((j['categories'] as List?) ?? [])
          .map((e) => CategoryRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      lecturers: ((j['lecturers'] as List?) ?? [])
          .map((e) => LecturerRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      featuredPaths: ((j['featuredPaths'] as List?) ?? [])
          .map((e) => LearningPathRow.fromJson(e as Map<String, dynamic>))
          .toList(),
      bestOf: ((j['bestOf'] as List?) ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
    );
  }
}

class MyLearningItem {
  final String id, title, slug;
  final String? thumbnailUrl, level;
  final bool isPremium;
  final int lessonCount;
  final double durationMin;
  final DateTime? savedAt, likedAt, downloadedAt, addedAt;
  MyLearningItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        title = j['title'] as String,
        slug = j['slug'] as String,
        thumbnailUrl = j['thumbnailUrl'] as String?,
        level = j['level'] as String?,
        isPremium = j['isPremium'] as bool? ?? false,
        lessonCount = (j['lessonCount'] as num?)?.toInt() ?? 0,
        durationMin = (j['durationMin'] as num?)?.toDouble() ?? 0,
        savedAt = DateTime.tryParse(j['savedAt'] as String? ?? ''),
        likedAt = DateTime.tryParse(j['likedAt'] as String? ?? ''),
        downloadedAt = DateTime.tryParse(j['downloadedAt'] as String? ?? ''),
        addedAt = DateTime.tryParse(j['addedAt'] as String? ?? '');
}

/// GET /me/learning — a reader's saved, liked and downloaded courses.
///
/// There is no enrolment and no lesson progress: a course is a Telegram
/// archive, so "downloaded" is the closest thing to having taken it.
class MyLearning {
  final List<MyLearningItem> saved, liked, downloaded;
  MyLearning(
      {required this.saved, required this.liked, required this.downloaded});

  factory MyLearning.fromJson(Map<String, dynamic> j) {
    List<MyLearningItem> parse(String key) => ((j[key] as List?) ?? [])
        .map((e) => MyLearningItem.fromJson(e as Map<String, dynamic>))
        .toList();
    return MyLearning(
      saved: parse('saved'),
      liked: parse('liked'),
      downloaded: parse('downloaded'),
    );
  }
}

class CourseCollection {
  final String id, name;
  final String? description;
  final String visibility;
  final int itemCount, savesCount;
  final String? ownerName, ownerAvatarUrl;
  final bool isOwner, saved;
  final String? createdAt, updatedAt;
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
    this.ownerAvatarUrl,
    this.isOwner = false,
    this.saved = false,
    this.createdAt,
    this.updatedAt,
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
        ownerAvatarUrl: j['ownerAvatarUrl'] as String?,
        isOwner: j['isOwner'] as bool? ?? false,
        saved: j['saved'] as bool? ?? false,
        createdAt: j['createdAt'] as String?,
        updatedAt: j['updatedAt'] as String?,
        covers: ((j['covers'] as List?) ?? []).cast<String>(),
        items: ((j['items'] as List?) ?? [])
            .map((e) =>
                MyLearningItem.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
      );
}

class ActivityItem {
  final String id, userName, verb, targetTitle, createdAt;
  ActivityItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String? ?? '',
        userName = j['userName'] as String? ?? '',
        // The API names the action `type` and nests the course, so derive the
        // sentence pieces here instead of expecting fields it never sends.
        verb = j['verb'] as String? ??
            (j['type'] == 'download' ? 'downloaded' : 'reviewed'),
        targetTitle = j['targetTitle'] as String? ??
            ((j['course'] as Map?)?['title'] as String?) ??
            '',
        createdAt = j['createdAt'] as String? ?? '';
}

class ActivityFeedItem {
  final String id, type, userName, createdAt;
  final String? body, courseTitle, courseSlug, courseThumbnailUrl;
  ActivityFeedItem.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String? ?? '',
        type = j['type'] as String? ?? 'download',
        userName = j['userName'] as String? ?? '',
        createdAt = j['createdAt'] as String? ?? '',
        body = j['body'] as String?,
        courseTitle = (j['course'] as Map?)?['title'] as String?,
        courseSlug = (j['course'] as Map?)?['slug'] as String?,
        courseThumbnailUrl = (j['course'] as Map?)?['thumbnailUrl'] as String?;
}

class CircleRow {
  final String id, name;
  final String? description, ownerName;
  final int memberCount, postCount;
  final bool joined, isOwner;
  CircleRow.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String? ?? '',
        description = j['description'] as String?,
        ownerName = (j['owner'] as Map?)?['name'] as String?,
        memberCount = (j['memberCount'] as num?)?.toInt() ?? 0,
        postCount = (j['postCount'] as num?)?.toInt() ?? 0,
        joined = j['joined'] as bool? ?? false,
        isOwner = j['isOwner'] as bool? ?? false;
}

class CircleMember {
  final String id, name, role;
  final String? avatarUrl;
  CircleMember.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String? ?? '',
        name = j['name'] as String? ?? '',
        role = j['role'] as String? ?? 'member',
        avatarUrl = j['avatarUrl'] as String?;
}

class CirclePost {
  final String id, body, createdAt, authorName;
  final String? authorAvatarUrl, courseTitle, courseSlug, courseThumbnailUrl;
  final bool canDelete;
  CirclePost.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String? ?? '',
        body = j['body'] as String? ?? '',
        createdAt = j['createdAt'] as String? ?? '',
        authorName = (j['author'] as Map?)?['name'] as String? ?? '',
        authorAvatarUrl = (j['author'] as Map?)?['avatarUrl'] as String?,
        courseTitle = (j['course'] as Map?)?['title'] as String?,
        courseSlug = (j['course'] as Map?)?['slug'] as String?,
        courseThumbnailUrl = (j['course'] as Map?)?['thumbnailUrl'] as String?,
        canDelete = j['canDelete'] as bool? ?? false;
}

class CircleDetail {
  final String id, name;
  final String? description, ownerName;
  final int memberCount, postCount;
  final bool joined, isOwner, canPost;
  final List<CircleMember> members;
  final List<CirclePost> posts;
  CircleDetail.fromJson(Map<String, dynamic> j)
      : id = j['id'] as String,
        name = j['name'] as String? ?? '',
        description = j['description'] as String?,
        ownerName = (j['owner'] as Map?)?['name'] as String?,
        memberCount = (j['memberCount'] as num?)?.toInt() ?? 0,
        postCount = (j['postCount'] as num?)?.toInt() ?? 0,
        joined = j['joined'] as bool? ?? false,
        isOwner = j['isOwner'] as bool? ?? false,
        canPost = j['canPost'] as bool? ?? false,
        members = ((j['members'] as List?) ?? [])
            .map((e) =>
                CircleMember.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        posts = ((j['posts'] as List?) ?? [])
            .map(
                (e) => CirclePost.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList();
}
