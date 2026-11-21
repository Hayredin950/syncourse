import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

const apiBase = String.fromEnvironment(
  'API_URL',
  // A release build talks to production unless the build passes
  // --dart-define=API_URL=… ; the old localhost default made every installed
  // app look broken because it pointed at the phone itself.
  defaultValue: 'https://syncourse-api.vercel.app',
);

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

class Api {
  static String? _token;

  static Future<void> setToken(String? token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    if (token == null) {
      await prefs.remove('syncourse_token');
    } else {
      await prefs.setString('syncourse_token', token);
    }
  }

  static Future<String?> loadToken() async {
    if (_token != null) return _token;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('syncourse_token');
    return _token;
  }

  static Future<dynamic> request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final token = await loadToken();
    final uri = Uri.parse('$apiBase/api$path');
    final headers = <String, String>{
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
    late http.Response res;
    switch (method) {
      case 'POST':
        res = await http.post(uri,
            headers: headers, body: jsonEncode(body ?? {}));
        break;
      case 'PATCH':
        res = await http.patch(uri,
            headers: headers, body: jsonEncode(body ?? {}));
        break;
      case 'DELETE':
        res = await http.delete(uri, headers: headers);
        break;
      default:
        res = await http.get(uri, headers: headers);
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final msg = data is Map && data['message'] is String
          ? data['message'] as String
          : 'Request failed (${res.statusCode})';
      throw ApiException(res.statusCode, msg);
    }
    return data;
  }

  static Future<dynamic> get(String path) => request(path);
  static Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      request(path, method: 'POST', body: body);
  static Future<dynamic> patch(String path, [Map<String, dynamic>? body]) =>
      request(path, method: 'PATCH', body: body);
  static Future<dynamic> delete(String path) => request(path, method: 'DELETE');

  // --- auth ---
  /// Which external sign-in providers the server can start. The app uses this
  /// so the Google button is only a promise the API can keep.
  static Future<Map<String, dynamic>> authProviders() async {
    final d = await get('/auth/providers');
    return d as Map<String, dynamic>;
  }

  static Future<void> login(String email, String password) async {
    final data =
        await post('/auth/login', {'email': email, 'password': password});
    await setToken(data['accessToken'] as String);
  }

  static Future<void> register(
      String name, String email, String password) async {
    final data = await post('/auth/register', {
      'name': name,
      'email': email,
      'password': password,
    });
    await setToken(data['accessToken'] as String);
  }

  static Future<void> logout() => setToken(null);

  static Future<UserProfile> me() async {
    final d = await get('/users/me');
    return UserProfile.fromJson(d);
  }

  /// Link the bot chat so downloads made there show up in this account.
  static Future<void> linkTelegram(String username) =>
      post('/auth/link-telegram', {'telegramUsername': username});

  static Future<void> unlinkGoogle() => post('/users/me/unlink-google');

  /// Raw bytes for an authenticated file (receipt and certificate PDFs), which
  /// `request` cannot return because it expects JSON.
  static Future<List<int>> downloadBytes(String path) async {
    final token = await loadToken();
    final uri = Uri.parse('$apiBase/api$path');
    final res = await http.get(uri, headers: {
      if (token != null) 'Authorization': 'Bearer $token',
    });
    if (res.statusCode >= 400) {
      throw ApiException(
          res.statusCode, 'Could not download the file (${res.statusCode})');
    }
    return res.bodyBytes;
  }

  // --- catalog ---
  static Future<HomeFeed> home() async {
    final d = await get('/home');
    return HomeFeed.fromJson(d);
  }

  static Future<List<CourseSummary>> browse({
    String? sort,
    String? category,
    String? contentType,
    String? level,
    String? lecturer,
    String? organization,
    List<String> tags = const [],
    String? query,
    int limit = 60,
    int offset = 0,
  }) async {
    final parts = <String>[
      'limit=$limit',
      if (offset > 0) 'offset=$offset',
      if (sort != null) 'sort=$sort',
      if (category != null) 'category=${Uri.encodeQueryComponent(category)}',
      if (contentType != null)
        'contentType=${Uri.encodeQueryComponent(contentType)}',
      if (level != null) 'level=${Uri.encodeQueryComponent(level)}',
      if (lecturer != null) 'lecturer=${Uri.encodeQueryComponent(lecturer)}',
      if (organization != null)
        'organization=${Uri.encodeQueryComponent(organization)}',
      if (query != null) 'q=${Uri.encodeQueryComponent(query)}',
      for (final t in tags) 'tag=${Uri.encodeQueryComponent(t)}',
    ].join('&');
    final d = await get('/courses?$parts');
    return ((d['results'] as List?) ?? [])
        .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<CategoryRow>> categories() async {
    final d = await get('/categories');
    return ((d as List?) ?? [])
        .map((e) => CategoryRow.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<LecturerRow>> lecturers() async {
    final d = await get('/lecturers');
    return ((d as List?) ?? [])
        .map((e) => LecturerRow.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<Map<String, dynamic>> lecturerDetail(String slug) async =>
      await get('/lecturers/$slug') as Map<String, dynamic>;

  static Future<List<OrganizationRow>> organizations() async {
    final d = await get('/organizations');
    return ((d as List?) ?? [])
        .map((e) => OrganizationRow.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<Map<String, dynamic>> organizationDetail(String slug) async =>
      await get('/organizations/$slug') as Map<String, dynamic>;

  static Future<List<LearningPathRow>> learningPaths() async {
    final d = await get('/learning-paths');
    return ((d as List?) ?? [])
        .map((e) => LearningPathRow.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<LearningPathDetail> learningPathDetail(String id) async {
    final d = await get('/learning-paths/$id');
    return LearningPathDetail.fromJson(d as Map<String, dynamic>);
  }

  // --- resources ---
  static Future<ResourceList> resources({
    String? type,
    String? category,
    String? query,
    String sort = 'newest',
    int limit = 40,
    int offset = 0,
  }) async {
    final parts = <String>[
      'sort=$sort',
      'limit=$limit',
      if (offset > 0) 'offset=$offset',
      if (type != null && type.isNotEmpty) 'type=$type',
      if (category != null && category.isNotEmpty)
        'category=${Uri.encodeQueryComponent(category)}',
      if (query != null && query.isNotEmpty)
        'q=${Uri.encodeQueryComponent(query)}',
    ].join('&');
    final d = await get('/resources?$parts');
    return ResourceList.fromJson(d as Map<String, dynamic>);
  }

  static Future<ResourceDetail> resourceDetail(String slug) async {
    final d = await get('/resources/$slug');
    return ResourceDetail.fromJson(d as Map<String, dynamic>);
  }

  static Future<void> resourceDownload(String slug) =>
      post('/resources/$slug/download');

  static Future<CourseDetail> courseDetail(String slug) async {
    final d = await get('/courses/$slug');
    return CourseDetail.fromJson(d);
  }

  static Future<LessonDetail> lessonDetail(String lessonId) async {
    final d = await get('/lessons/$lessonId');
    return LessonDetail.fromJson(d);
  }

  static Future<String> videoUrl(String lessonId) async {
    final d = await get('/lessons/$lessonId/video-url');
    return d['url'] as String;
  }

  /// Signed URL for one lesson attachment. Checks entitlement on the server.
  static Future<Map<String, dynamic>> lessonFileUrl(
      String lessonId, String attachmentId) async {
    final d = await get(
        '/lessons/$lessonId/file-url?attachmentId=${Uri.encodeQueryComponent(attachmentId)}');
    return d as Map<String, dynamic>;
  }

  // --- learning ---
  static Future<void> toggleSave(String slug) => post('/courses/$slug/save');
  static Future<void> toggleLike(String slug) => post('/courses/$slug/like');

  /// Rate a course once; rating again replaces the previous stars.
  static Future<Map<String, dynamic>> rateCourse(
      String courseId, int stars) async {
    final d = await post('/courses/$courseId/rate', {'stars': stars});
    return d as Map<String, dynamic>;
  }

  static Future<Review> postReview(
    String courseId,
    String body,
  ) async {
    final d = await post('/courses/$courseId/reviews', {'body': body});
    return Review.fromJson(d as Map<String, dynamic>);
  }

  static Future<void> deleteReview(String reviewId) =>
      delete('/reviews/$reviewId');

  static Future<Map<String, dynamic>> upvoteReview(String reviewId) async {
    final d = await post('/discussion/$reviewId/upvote', {});
    return d as Map<String, dynamic>;
  }

  static Future<MyLearning> myLearning() async {
    final d = await get('/me/learning');
    return MyLearning.fromJson(d);
  }

  // --- search ---
  static Future<SearchResult> search(
    String q, {
    String type = 'all',
    int limit = 20,
    int offset = 0,
  }) async {
    final d = await get(
      '/search?q=${Uri.encodeQueryComponent(q)}&type=$type&limit=$limit&offset=$offset',
    );
    return SearchResult.fromJson(d as Map<String, dynamic>);
  }

  static Future<List<String>> trendingSearches() async {
    final d = await get('/search/trending');
    return ((d['trending'] as List?) ?? []).cast<String>();
  }

  // --- recommendations ---
  static Future<Map<String, dynamic>> forYou({int limit = 12}) async =>
      await get('/recommendations/for-you?limit=$limit')
          as Map<String, dynamic>;

  static Future<List<CourseSummary>> similar(
    String slug, {
    int limit = 8,
  }) async {
    final d = await get('/recommendations/similar/$slug?limit=$limit');
    return ((d['courses'] as List?) ?? [])
        .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // --- collections ---
  static Future<List<CourseCollection>> myLists() async {
    final d = await get('/me/lists');
    return (d as List)
        .map((e) => CourseCollection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<CourseCollection>> browseLists({
    String sort = 'most-saved',
    int limit = 30,
  }) async {
    final d = await get('/lists?sort=$sort&limit=$limit');
    return ((d['results'] as List?) ?? [])
        .map((e) => CourseCollection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<CourseCollection> createList(String name,
      {String visibility = 'private'}) async {
    final d = await post('/lists', {'name': name, 'visibility': visibility});
    return CourseCollection.fromJson(d as Map<String, dynamic>);
  }

  static Future<CourseCollection> listDetail(String id) async {
    final d = await get('/lists/$id');
    return CourseCollection.fromJson(d as Map<String, dynamic>);
  }

  static Future<Map<String, dynamic>> toggleListSaved(String id) async =>
      await post('/lists/$id/save') as Map<String, dynamic>;

  static Future<CourseCollection> addListItems(
      String id, List<String> courseIds) async {
    final d = await post('/lists/$id/items', {'courseIds': courseIds});
    return CourseCollection.fromJson(d as Map<String, dynamic>);
  }

  static Future<CourseCollection> removeListItem(
      String id, String courseId) async {
    final d = await delete('/lists/$id/items/$courseId');
    return CourseCollection.fromJson(d as Map<String, dynamic>);
  }

  static Future<CourseCollection> updateList(
    String id, {
    String? name,
    String? description,
    String? visibility,
  }) async {
    final d = await patch('/lists/$id', {
      if (name != null) 'name': name,
      if (description != null) 'description': description,
      if (visibility != null) 'visibility': visibility,
    });
    return CourseCollection.fromJson(d as Map<String, dynamic>);
  }

  static Future<void> deleteList(String id) => delete('/lists/$id');

  // --- assistant ---
  static Future<AssistantStatus> assistantStatus() async {
    final d = await get('/assistant/status');
    return AssistantStatus.fromJson(d as Map<String, dynamic>);
  }

  static Future<AssistantAnswer> ask(
    String question, {
    String? courseSlug,
    List<Map<String, String>> history = const [],
  }) async {
    final d = await post('/assistant/ask', {
      'question': question,
      if (courseSlug != null) 'courseSlug': courseSlug,
      if (history.isNotEmpty) 'history': history,
    });
    return AssistantAnswer.fromJson(d as Map<String, dynamic>);
  }

  // --- account ---
  static Future<Map<String, dynamic>> stats() async =>
      await get('/users/me/stats') as Map<String, dynamic>;

  static Future<UserProfile> updateProfile(
      Map<String, dynamic> patchBody) async {
    final d = await patch('/users/me', patchBody);
    return UserProfile.fromJson(d as Map<String, dynamic>);
  }

  static Future<void> changePassword(
      String currentPassword, String newPassword) async {
    await post('/users/me/change-password', {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  static Future<List<Map<String, dynamic>>> receipts() async {
    final d = await get('/payments/receipts');
    return ((d as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  static Future<List<Map<String, dynamic>>> circles() async {
    final d = await get('/circles');
    return ((d as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
  }

  static Future<Map<String, dynamic>> circleDetail(String id) async =>
      await get('/circles/$id') as Map<String, dynamic>;

  static Future<Map<String, dynamic>> createCircle(
      String name, String description) async {
    final d = await post('/circles', {
      'name': name,
      if (description.trim().isNotEmpty) 'description': description.trim(),
    });
    return d as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> updateCircle(
    String id, {
    String? name,
    String? description,
  }) async {
    final d = await patch('/circles/$id', {
      if (name != null) 'name': name,
      if (description != null) 'description': description,
    });
    return d as Map<String, dynamic>;
  }

  static Future<void> deleteCircle(String id) => delete('/circles/$id');

  static Future<void> joinCircle(String id) => post('/circles/$id/join');
  static Future<void> leaveCircle(String id) => post('/circles/$id/leave');

  static Future<Map<String, dynamic>> createCirclePost(
      String circleId, String body) async {
    final d = await post('/circles/$circleId/posts', {'body': body});
    return d as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> deleteCirclePost(
      String circleId, String postId) async {
    final d = await delete('/circles/$circleId/posts/$postId');
    return d as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> removeCircleMember(
      String circleId, String memberId) async {
    final d = await delete('/circles/$circleId/members/$memberId');
    return d as Map<String, dynamic>;
  }

  // --- payments ---
  static Future<List<Plan>> plans() async {
    final d = await get('/payments/plans');
    return (d as List)
        .map((e) => Plan.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Ask the bot to send this lesson's file link to the linked Telegram chat.
  /// This is the real delivery path; the app does not keep a local media cache.
  static Future<Map<String, dynamic>> downloadToTelegram(
      String lessonId) async {
    final d = await post('/lessons/$lessonId/download-to-telegram', {});
    return d as Map<String, dynamic>;
  }

  /// Extend Premium with a gift pass. The server claims the use atomically.
  static Future<Map<String, dynamic>> redeem(String code) async {
    final d = await post('/payments/redeem', {'code': code});
    return d as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> perks() async {
    final d = await get('/payments/perks');
    return d as Map<String, dynamic>;
  }

  // --- progress & certificates ---

  static Future<Map<String, dynamic>> courseProgress(String slug) async {
    final d = await get('/courses/$slug/progress');
    return d as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> setLessonProgress(
      String lessonId, bool completed) async {
    final d =
        await post('/lessons/$lessonId/progress', {'completed': completed});
    return d as Map<String, dynamic>;
  }

  /// Mark one unit of a course complete. Lessons use the lesson endpoint; this
  /// one works for both lesson courses and Telegram-archive courses.
  static Future<Map<String, dynamic>> setCourseUnitProgress(
      String slug, String unitId, bool completed) async {
    final d = await post(
        '/courses/$slug/progress', {'unitId': unitId, 'completed': completed});
    return d as Map<String, dynamic>;
  }

  static Future<Map<String, dynamic>> issueCertificate(String slug) async {
    final d = await post('/courses/$slug/certificate', {});
    return d as Map<String, dynamic>;
  }

  static Future<List<Map<String, dynamic>>> myCertificates() async {
    final d = await get('/certificates/me');
    return (d as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  /// Public record for one serial: learner, course, issue date.
  static Future<Map<String, dynamic>> verifyCertificate(String serial) async {
    final d = await get('/certificates/${Uri.encodeComponent(serial)}');
    return d as Map<String, dynamic>;
  }

  /// Signed URLs for one whole course. Premium-only on the server.
  static Future<Map<String, dynamic>> offlineManifest(String slug) async {
    final d = await get('/courses/$slug/offline-manifest');
    return d as Map<String, dynamic>;
  }

  // --- circles ---
  /// The signed-in feed: `{ followingCount, items }`. Throws a 401 when nobody
  /// is signed in, which the screen turns into its own invite panel.
  static Future<Map<String, dynamic>> activityFeed() async =>
      await get('/activity') as Map<String, dynamic>;

  static Future<List<ActivityItem>> circlesActivity() async {
    // The feed lives at /activity and returns { followingCount, items }.
    // The old /circles/activity path 404'd and the parser read a key that was
    // never sent, so the Circles tab always claimed you followed nobody.
    final d = await get('/activity');
    return ((d['items'] as List?) ?? [])
        .map((e) => ActivityItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
