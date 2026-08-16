import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

const apiBase = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://localhost:4000',
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
        res = await http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
      case 'PATCH':
        res = await http.patch(uri, headers: headers, body: jsonEncode(body ?? {}));
      case 'DELETE':
        res = await http.delete(uri, headers: headers);
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

  // --- auth ---
  static Future<void> login(String email, String password) async {
    final data = await post('/auth/login', {'email': email, 'password': password});
    await setToken(data['accessToken'] as String);
  }

  static Future<void> register(String name, String email, String password) async {
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

  // --- catalog ---
  static Future<HomeFeed> home() async {
    final d = await get('/home');
    return HomeFeed.fromJson(d);
  }

  static Future<List<CourseSummary>> browse({
    String? sort,
    String? category,
    List<String> tags = const [],
    String? query,
    int limit = 60,
  }) async {
    final qs = <String>[
      'limit=$limit',
      if (sort != null) 'sort=$sort',
      if (category != null) 'category=${Uri.encodeQueryComponent(category)}',
      if (query != null) 'q=${Uri.encodeQueryComponent(query)}',
      for (final t in tags) 'tag=${Uri.encodeQueryComponent(t)}',
    ].join('&');
    final d = await get('/courses?$qs');
    return ((d['results'] as List?) ?? [])
        .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

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

  // --- learning ---
  static Future<void> enroll(String slug) => post('/courses/$slug/enroll');
  static Future<void> toggleSave(String slug) => post('/courses/$slug/save');
  static Future<void> toggleLike(String slug) => post('/courses/$slug/like');
  static Future<void> markComplete(String lessonId) =>
      post('/lessons/$lessonId/progress', {'completed': true});

  static Future<MyLearning> myLearning() async {
    final d = await get('/me/learning');
    return MyLearning.fromJson(d);
  }

  // --- search ---
  static Future<List<CourseSummary>> search(String q) async {
    final d = await get('/search?q=${Uri.encodeQueryComponent(q)}');
    return ((d['courses'] as List?) ?? [])
        .map((e) => CourseSummary.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<List<String>> trendingSearches() async {
    final d = await get('/search/trending');
    return ((d['trending'] as List?) ?? []).cast<String>();
  }

  // --- collections ---
  static Future<List<CourseCollection>> myLists() async {
    final d = await get('/me/lists');
    return (d as List).map((e) => CourseCollection.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<CourseCollection> createList(String name) async {
    final d = await post('/lists', {'name': name, 'visibility': 'private'});
    return CourseCollection.fromJson(d);
  }

  static Future<CourseCollection> listDetail(String id) async {
    final d = await get('/lists/$id');
    return CourseCollection.fromJson(d);
  }

  // --- payments ---
  static Future<List<Plan>> plans() async {
    final d = await get('/payments/plans');
    return (d as List).map((e) => Plan.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<Map<String, dynamic>> checkout(String planId, String method) async {
    final d = await post('/payments/checkout', {
      'planId': planId,
      'method': method,
      'currency': method == 'telebirr' ? 'ETB' : 'USD',
    });
    return d as Map<String, dynamic>;
  }

  // --- circles ---
  static Future<List<ActivityItem>> circlesActivity() async {
    final d = await get('/circles/activity');
    return ((d['activity'] as List?) ?? [])
        .map((e) => ActivityItem.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
